const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

const FUNNEL_MODES = new Set(["strict", "flexible"]);
const ANALYSIS_MODES = new Set(["user", "session"]);

function normalizeMode(input) {
  const value = String(input || "strict").toLowerCase();
  return FUNNEL_MODES.has(value) ? value : "strict";
}

function normalizeAnalysisMode(input) {
  const value = String(input || "user").toLowerCase();
  return ANALYSIS_MODES.has(value) ? value : "user";
}

function normalizeWindowHours(input) {
  const hours = Number(input);
  if (!Number.isFinite(hours) || hours <= 0) return 24;
  return Math.min(Math.max(hours, 0.25), 24 * 30);
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step, index) => {
      if (typeof step === "string") {
        return { order: index + 1, event_name: step.trim() };
      }
      return {
        order: Number(step?.order || index + 1),
        event_name: String(step?.event_name || "").trim(),
      };
    })
    .filter((step) => step.event_name)
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({ order: index + 1, event_name: step.event_name }));
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * ratio;
  const floor = Math.floor(position);
  const ceil = Math.ceil(position);
  if (floor === ceil) return sortedValues[floor];
  const weight = position - floor;
  return sortedValues[floor] * (1 - weight) + sortedValues[ceil] * weight;
}

function buildDurationDistribution(durationMsList) {
  const buckets = [
    { key: "under_5m", label: "< 5 min", minMs: 0, maxMs: 5 * 60 * 1000, count: 0 },
    { key: "5m_to_30m", label: "5-30 min", minMs: 5 * 60 * 1000, maxMs: 30 * 60 * 1000, count: 0 },
    { key: "30m_to_1h", label: "30-60 min", minMs: 30 * 60 * 1000, maxMs: 60 * 60 * 1000, count: 0 },
    { key: "1h_to_24h", label: "1-24 hr", minMs: 60 * 60 * 1000, maxMs: 24 * 60 * 60 * 1000, count: 0 },
    { key: "over_24h", label: "> 24 hr", minMs: 24 * 60 * 60 * 1000, maxMs: Number.POSITIVE_INFINITY, count: 0 },
  ];

  for (const value of durationMsList) {
    const bucket = buckets.find((item) => value >= item.minMs && value < item.maxMs);
    if (bucket) bucket.count += 1;
  }

  return buckets.map(({ key, label, count }) => ({ key, label, count }));
}

async function ensureFunnelTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_funnels (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'strict',
      analysis_mode TEXT NOT NULL DEFAULT 'user',
      window_hours DOUBLE PRECISION NOT NULL DEFAULT 24,
      steps JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE saved_funnels
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'strict'
  `);

  await pool.query(`
    ALTER TABLE saved_funnels
    ADD COLUMN IF NOT EXISTS analysis_mode TEXT NOT NULL DEFAULT 'user'
  `);

  await pool.query(`
    ALTER TABLE saved_funnels
    ADD COLUMN IF NOT EXISTS window_hours DOUBLE PRECISION NOT NULL DEFAULT 24
  `);

  await pool.query(`
    ALTER TABLE saved_funnels
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

function evaluateStrictProgress(events, stepNames, windowMs) {
  if (!events.length || !stepNames.length) {
    return { reached: 0, startMs: null, completedAtMs: null };
  }

  let bestReached = 0;
  let bestStart = null;
  let bestEnd = null;

  for (let i = 0; i < events.length; i += 1) {
    if (events[i].event_name !== stepNames[0]) continue;

    const startMs = events[i].timestamp_ms;
    const deadline = startMs + windowMs;
    let stepIndex = 1;
    let currentReached = 1;
    let completionMs = startMs;

    for (let j = i + 1; j < events.length && stepIndex < stepNames.length; j += 1) {
      const item = events[j];
      if (item.timestamp_ms > deadline) break;
      if (item.event_name === stepNames[stepIndex]) {
        stepIndex += 1;
        currentReached = stepIndex;
        completionMs = item.timestamp_ms;
      }
    }

    if (currentReached > bestReached) {
      bestReached = currentReached;
      bestStart = startMs;
      bestEnd = completionMs;
    }

    if (bestReached === stepNames.length) break;
  }

  return {
    reached: bestReached,
    startMs: bestStart,
    completedAtMs: bestReached === stepNames.length ? bestEnd : null,
  };
}

function evaluateFlexibleProgress(events, stepNames, windowMs) {
  if (!events.length || !stepNames.length) {
    return { reached: 0, startMs: null, completedAtMs: null };
  }

  let bestReached = 0;
  let bestStart = null;
  let bestEnd = null;

  for (let i = 0; i < events.length; i += 1) {
    if (events[i].event_name !== stepNames[0]) continue;

    const startMs = events[i].timestamp_ms;
    const deadline = startMs + windowMs;
    const seen = new Set([stepNames[0]]);
    let completionMs = startMs;

    for (let j = i + 1; j < events.length; j += 1) {
      const item = events[j];
      if (item.timestamp_ms > deadline) break;
      if (stepNames.includes(item.event_name)) {
        seen.add(item.event_name);
        completionMs = item.timestamp_ms;
      }
    }

    const prefixReached = stepNames.filter((name) => seen.has(name)).length;
    if (prefixReached > bestReached) {
      bestReached = prefixReached;
      bestStart = startMs;
      bestEnd = completionMs;
    }

    if (bestReached === stepNames.length) break;
  }

  return {
    reached: bestReached,
    startMs: bestStart,
    completedAtMs: bestReached === stepNames.length ? bestEnd : null,
  };
}

function calculateStepMetrics(stepNames, userSets) {
  return stepNames.map((eventName, index) => {
    const users = userSets[index].size;
    const prevUsers = index > 0 ? userSets[index - 1].size : 0;
    const conversion = index === 0 || prevUsers === 0 ? null : Math.round((users / prevUsers) * 100);
    const dropoff = index === 0 ? 0 : Math.max(prevUsers - users, 0);

    return {
      step_order: index + 1,
      event_name: eventName,
      users,
      conversion_rate_from_previous: conversion,
      dropoff_count: dropoff,
    };
  });
}

async function analyzeFunnel({ steps, mode, analysis_mode, window_hours, project_id }) {
  await ensureFunnelTables();

  const normalizedSteps = normalizeSteps(steps);
  if (normalizedSteps.length < 2) {
    throw new Error("At least two funnel steps are required");
  }

  const normalizedMode = normalizeMode(mode);
  const normalizedAnalysisMode = normalizeAnalysisMode(analysis_mode);
  const normalizedWindowHours = normalizeWindowHours(window_hours);
  const normalizedProjectId = String(project_id || "").trim();
  const windowMs = normalizedWindowHours * 60 * 60 * 1000;
  const stepNames = normalizedSteps.map((step) => step.event_name);

  const whereParts = [`event_name = ANY($1::text[])`];
  const values = [stepNames];

  if (normalizedProjectId) {
    values.push(normalizedProjectId);
    whereParts.push(`project_id = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT user_id, session_id, event_name, created_at
      FROM events
      WHERE ${whereParts.join(" AND ")}
      ORDER BY created_at ASC
    `,
    values
  );

  const groups = new Map();
  for (const row of result.rows) {
    const timestampMs = new Date(row.created_at).getTime();
    if (!Number.isFinite(timestampMs)) continue;

    const key = normalizedAnalysisMode === "session" ? `${row.user_id}::${row.session_id}` : row.user_id;
    if (!groups.has(key)) {
      groups.set(key, {
        user_id: row.user_id,
        session_id: row.session_id,
        events: [],
      });
    }

    groups.get(key).events.push({
      user_id: row.user_id,
      session_id: row.session_id,
      event_name: row.event_name,
      timestamp_ms: timestampMs,
    });
  }

  const perUserBest = new Map();
  for (const group of groups.values()) {
    group.events.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const progress =
      normalizedMode === "strict"
        ? evaluateStrictProgress(group.events, stepNames, windowMs)
        : evaluateFlexibleProgress(group.events, stepNames, windowMs);

    if (!perUserBest.has(group.user_id) || progress.reached > perUserBest.get(group.user_id).reached) {
      perUserBest.set(group.user_id, progress);
    }
  }

  const userSets = stepNames.map(() => new Set());
  const completionTimes = [];

  for (const [userId, progress] of perUserBest.entries()) {
    for (let i = 0; i < progress.reached; i += 1) {
      userSets[i].add(userId);
    }

    if (progress.reached === stepNames.length && progress.startMs != null && progress.completedAtMs != null) {
      const duration = progress.completedAtMs - progress.startMs;
      if (duration >= 0) completionTimes.push(duration);
    }
  }

  completionTimes.sort((a, b) => a - b);
  const totalCompleted = completionTimes.length;
  const averageTimeMs = totalCompleted
    ? Math.round(completionTimes.reduce((sum, value) => sum + value, 0) / totalCompleted)
    : 0;
  const medianTimeMs = totalCompleted ? Math.round(percentile(completionTimes, 0.5)) : 0;

  return {
    mode: normalizedMode,
    analysis_mode: normalizedAnalysisMode,
    window_hours: normalizedWindowHours,
    steps: calculateStepMetrics(stepNames, userSets),
    total_users_entered: userSets[0].size,
    total_users_completed: userSets[stepNames.length - 1].size,
    completion_rate:
      userSets[0].size === 0 ? 0 : Math.round((userSets[stepNames.length - 1].size / userSets[0].size) * 100),
    time_to_convert: {
      average_ms: averageTimeMs,
      median_ms: medianTimeMs,
      distribution: buildDurationDistribution(completionTimes),
    },
  };
}

async function listSavedFunnels() {
  await ensureFunnelTables();
  const result = await pool.query(
    `
      SELECT id, name, mode, analysis_mode, window_hours, steps, created_at, updated_at
      FROM saved_funnels
      ORDER BY updated_at DESC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    mode: normalizeMode(row.mode),
    analysis_mode: normalizeAnalysisMode(row.analysis_mode),
    window_hours: Number(row.window_hours || 24),
    steps: normalizeSteps(Array.isArray(row.steps) ? row.steps : []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

async function createSavedFunnel(payload) {
  await ensureFunnelTables();
  const name = String(payload?.name || "").trim() || "Untitled Funnel";
  const mode = normalizeMode(payload?.mode);
  const analysisMode = normalizeAnalysisMode(payload?.analysis_mode);
  const windowHours = normalizeWindowHours(payload?.window_hours);
  const steps = normalizeSteps(payload?.steps);

  if (steps.length < 2) {
    throw new Error("At least two steps are required to save a funnel");
  }

  const id = uuidv4();
  await pool.query(
    `
      INSERT INTO saved_funnels (id, name, mode, analysis_mode, window_hours, steps)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [id, name, mode, analysisMode, windowHours, JSON.stringify(steps)]
  );

  return { id, name, mode, analysis_mode: analysisMode, window_hours: windowHours, steps };
}

async function updateSavedFunnel(id, payload) {
  await ensureFunnelTables();
  const funnelId = String(id || "").trim();
  if (!funnelId) throw new Error("funnel id is required");

  const current = await pool.query(
    `SELECT id, name, mode, analysis_mode, window_hours, steps FROM saved_funnels WHERE id = $1`,
    [funnelId]
  );

  if (current.rows.length === 0) {
    throw new Error("funnel not found");
  }

  const row = current.rows[0];
  const name = payload?.name != null ? String(payload.name).trim() || "Untitled Funnel" : row.name;
  const mode = payload?.mode != null ? normalizeMode(payload.mode) : normalizeMode(row.mode);
  const analysisMode = payload?.analysis_mode != null ? normalizeAnalysisMode(payload.analysis_mode) : normalizeAnalysisMode(row.analysis_mode);
  const windowHours = payload?.window_hours != null ? normalizeWindowHours(payload.window_hours) : Number(row.window_hours || 24);
  const steps = payload?.steps != null ? normalizeSteps(payload.steps) : normalizeSteps(Array.isArray(row.steps) ? row.steps : []);

  if (steps.length < 2) {
    throw new Error("At least two steps are required to save a funnel");
  }

  await pool.query(
    `
      UPDATE saved_funnels
      SET name = $2,
          mode = $3,
          analysis_mode = $4,
          window_hours = $5,
          steps = $6::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `,
    [funnelId, name, mode, analysisMode, windowHours, JSON.stringify(steps)]
  );

  return {
    id: funnelId,
    name,
    mode,
    analysis_mode: analysisMode,
    window_hours: windowHours,
    steps,
  };
}

async function deleteSavedFunnel(id) {
  await ensureFunnelTables();
  const funnelId = String(id || "").trim();
  if (!funnelId) throw new Error("funnel id is required");

  const result = await pool.query(`DELETE FROM saved_funnels WHERE id = $1`, [funnelId]);
  return { deleted: Number(result.rowCount || 0) };
}

async function getSavedFunnelById(id) {
  await ensureFunnelTables();
  const funnelId = String(id || "").trim();
  if (!funnelId) return null;

  const result = await pool.query(
    `
      SELECT id, name, mode, analysis_mode, window_hours, steps, created_at, updated_at
      FROM saved_funnels
      WHERE id = $1
      LIMIT 1
    `,
    [funnelId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.name,
    mode: normalizeMode(row.mode),
    analysis_mode: normalizeAnalysisMode(row.analysis_mode),
    window_hours: Number(row.window_hours || 24),
    steps: normalizeSteps(Array.isArray(row.steps) ? row.steps : []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  analyzeFunnel,
  listSavedFunnels,
  createSavedFunnel,
  updateSavedFunnel,
  deleteSavedFunnel,
  getSavedFunnelById,
};
