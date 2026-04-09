const express = require("express");
const pool = require("../db");
const funnelService = require("../services/funnelAnalysisService");
const {
  executeAnalyticsQuery,
  executeTimeSeriesQuery,
  executeBarChartQuery,
  executeQueryBuilderAnalytics,
} = require("../services/analyticsQueryService");
const {
  listSessionRecordings,
  getSessionReplay,
  getDeadClicksForSession,
  deleteAllSessionRecordings,
  deleteSessionRecording,
} = require("../controllers/sessionRecordingController");
const {
  getClickHeatmap,
  getHoverHeatmap,
  getScrollHeatmap,
  getLatestPageSnapshot,
  getPageUrls,
  getHeatmapStats,
} = require("../controllers/heatmapController");

const router = express.Router();

const TABLE_EXISTS_TTL_MS = 60 * 1000;
const JOURNEY_DEFAULT_FRESH_WINDOW_DAYS = 7;
const tableExistsCache = new Map();
let ensureFrontendErrorsColumnsPromise = null;

async function tableExists(tableName) {
  const now = Date.now();
  const cached = tableExistsCache.get(tableName);
  if (cached && now - cached.timestamp < TABLE_EXISTS_TTL_MS) {
    return cached.value;
  }

  const result = await pool.query(`SELECT to_regclass($1) AS table_ref`, [`public.${tableName}`]);
  const value = Boolean(result.rows[0]?.table_ref);
  tableExistsCache.set(tableName, { value, timestamp: now });
  return value;
}

async function ensureFrontendErrorsColumns() {
  if (ensureFrontendErrorsColumnsPromise) {
    return ensureFrontendErrorsColumnsPromise;
  }

  ensureFrontendErrorsColumnsPromise = (async () => {
    const hasFrontendErrors = await tableExists("frontend_errors");
    if (!hasFrontendErrors) return;

    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS page_url TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS project_id TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS page_path TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS source_file TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS line_number INTEGER`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS column_number INTEGER`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS error_type TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS user_agent TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS resolved_by TEXT`);
    await pool.query(`ALTER TABLE frontend_errors ADD COLUMN IF NOT EXISTS resolution_note TEXT`);
  })();

  try {
    await ensureFrontendErrorsColumnsPromise;
  } catch (error) {
    ensureFrontendErrorsColumnsPromise = null;
    throw error;
  }
}

function normalizeJourneyMetric(input) {
  const metric = String(input || "events").toLowerCase();
  return metric === "users" ? "users" : "events";
}

function normalizeJourneyUserType(input) {
  const userType = String(input || "all").toLowerCase();
  return userType === "new" || userType === "returning" ? userType : "all";
}

function normalizeJourneyFilterValue(input) {
  const value = String(input || "").trim();
  return value && value.toLowerCase() !== "all" ? value : "";
}

function normalizeJourneyMatchMode(input) {
  const value = String(input || "contains").toLowerCase();
  return value === "starts_from" ? "starts_from" : "contains";
}

function normalizeJourneyProjectId(input) {
  const value = String(input || "").trim();
  if (!value || value === "*" || value.toLowerCase() === "all") {
    return "";
  }
  return value;
}

function normalizeDateValue(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function buildJourneyScopeWhere({ userType, device, country, startDate, endDate, projectId }, values) {
  const clauses = [];

  if (userType !== "all") {
    if (userType === "new") {
      clauses.push(`user_first_seen >= NOW() - INTERVAL '30 days'`);
    } else {
      clauses.push(`user_first_seen < NOW() - INTERVAL '30 days'`);
    }
  }

  if (device) {
    values.push(device.toLowerCase());
    clauses.push(`LOWER(device_type) = $${values.length}`);
  }

  if (country) {
    values.push(country.toLowerCase());
    clauses.push(`LOWER(country) = $${values.length}`);
  }

  if (projectId) {
    values.push(projectId);
    clauses.push(`project_id = $${values.length}`);
  }

  if (startDate) {
    values.push(startDate);
    clauses.push(`created_at >= $${values.length}::date`);
  }

  if (endDate) {
    values.push(endDate);
    clauses.push(`created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }

  if (!startDate && !endDate) {
    clauses.push(`created_at >= NOW() - INTERVAL '${JOURNEY_DEFAULT_FRESH_WINDOW_DAYS} days'`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

async function queryJourneyTransitions({ metric, userType, device, country, startDate, endDate, projectId, limit }) {
  const values = [];
  const whereSql = buildJourneyScopeWhere({ userType, device, country, startDate, endDate, projectId }, values);
  values.push(limit);
  const countExpr = metric === "users" ? "COUNT(DISTINCT user_id)::int" : "COUNT(*)::int";

  const result = await pool.query(
    `
      WITH enriched_events AS (
        SELECT
          e.user_id,
          e.session_id,
          e.project_id,
          COALESCE(NULLIF(TRIM(e.page::text), ''), '(unknown)') AS page,
          e.created_at,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.properties->>'device_type', e.properties->>'device', e.properties->'device'->>'type')::text), ''),
            '(unknown)'
          ) AS device_type,
          COALESCE(NULLIF(TRIM(e.country), ''), '(unknown)') AS country,
          MIN(e.created_at) OVER (PARTITION BY e.user_id) AS user_first_seen
        FROM events e
        WHERE e.user_id IS NOT NULL
      ),
      scoped_events AS (
        SELECT
          *,
          CASE
            WHEN user_first_seen >= NOW() - INTERVAL '30 days' THEN 'new'
            ELSE 'returning'
          END AS user_type
        FROM enriched_events
        ${whereSql}
      ),
      ordered_events AS (
        SELECT
          user_id,
          session_id,
          page,
          created_at,
          LEAD(page) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_page,
          LEAD(created_at) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_created_at
        FROM scoped_events
      )
      SELECT
        page AS source,
        next_page AS target,
        ${countExpr} AS count,
        ROUND(AVG(EXTRACT(EPOCH FROM (next_created_at - created_at)) * 1000))::bigint AS avg_transition_ms
      FROM ordered_events
      WHERE next_page IS NOT NULL AND page <> next_page
      GROUP BY source, target
      ORDER BY count DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows;
}

async function queryJourneyTopPaths({ metric, userType, device, country, startDate, endDate, projectId, limit }) {
  const values = [];
  const whereSql = buildJourneyScopeWhere({ userType, device, country, startDate, endDate, projectId }, values);
  values.push(limit);
  const volumeExpr = metric === "users" ? "COUNT(DISTINCT user_id)::int" : "COUNT(*)::int";

  const result = await pool.query(
    `
      WITH enriched_events AS (
        SELECT
          e.user_id,
          e.session_id,
          e.project_id,
          COALESCE(NULLIF(TRIM(e.page::text), ''), '(unknown)') AS page,
          e.created_at,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.properties->>'device_type', e.properties->>'device', e.properties->'device'->>'type')::text), ''),
            '(unknown)'
          ) AS device_type,
          COALESCE(NULLIF(TRIM(e.country), ''), '(unknown)') AS country,
          MIN(e.created_at) OVER (PARTITION BY e.user_id) AS user_first_seen
        FROM events e
        WHERE e.user_id IS NOT NULL
      ),
      scoped_events AS (
        SELECT
          *,
          CASE
            WHEN user_first_seen >= NOW() - INTERVAL '30 days' THEN 'new'
            ELSE 'returning'
          END AS user_type
        FROM enriched_events
        ${whereSql}
      )
      SELECT
        page,
        ${volumeExpr} AS views,
        COUNT(DISTINCT user_id)::int AS users
      FROM scoped_events
      GROUP BY page
      ORDER BY views DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows;
}

async function queryJourneyDropoffs({ metric, userType, device, country, startDate, endDate, projectId, limit }) {
  const values = [];
  const whereSql = buildJourneyScopeWhere({ userType, device, country, startDate, endDate, projectId }, values);
  values.push(limit);
  const entrantsExpr = metric === "users" ? "COUNT(DISTINCT user_id)::int" : "COUNT(*)::int";
  const continuedExpr = metric === "users" ? "COUNT(DISTINCT user_id)::int" : "COUNT(*)::int";

  const result = await pool.query(
    `
      WITH enriched_events AS (
        SELECT
          e.user_id,
          e.session_id,
          e.project_id,
          COALESCE(NULLIF(TRIM(e.page::text), ''), '(unknown)') AS page,
          e.created_at,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.properties->>'device_type', e.properties->>'device', e.properties->'device'->>'type')::text), ''),
            '(unknown)'
          ) AS device_type,
          COALESCE(NULLIF(TRIM(e.country), ''), '(unknown)') AS country,
          MIN(e.created_at) OVER (PARTITION BY e.user_id) AS user_first_seen
        FROM events e
        WHERE e.user_id IS NOT NULL
      ),
      scoped_events AS (
        SELECT
          *,
          CASE
            WHEN user_first_seen >= NOW() - INTERVAL '30 days' THEN 'new'
            ELSE 'returning'
          END AS user_type
        FROM enriched_events
        ${whereSql}
      ),
      ordered_events AS (
        SELECT
          user_id,
          session_id,
          page,
          created_at,
          LEAD(page) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_page,
          LEAD(created_at) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_created_at
        FROM scoped_events
      ),
      source_totals AS (
        SELECT page AS step, ${entrantsExpr} AS entrants
        FROM scoped_events
        GROUP BY page
      ),
      continued AS (
        SELECT
          page AS step,
          ${continuedExpr} AS continued,
          ROUND(AVG(EXTRACT(EPOCH FROM (next_created_at - created_at)) * 1000))::bigint AS avg_time_to_next_ms
        FROM ordered_events
        WHERE next_page IS NOT NULL AND next_page <> page
        GROUP BY page
      )
      SELECT
        s.step,
        s.entrants,
        COALESCE(c.continued, 0)::int AS continued,
        GREATEST(s.entrants - COALESCE(c.continued, 0), 0)::int AS dropoff_count,
        CASE
          WHEN s.entrants = 0 THEN 0
          ELSE ROUND((GREATEST(s.entrants - COALESCE(c.continued, 0), 0)::numeric / s.entrants::numeric) * 100, 1)
        END AS dropoff_rate,
        COALESCE(c.avg_time_to_next_ms, 0)::bigint AS avg_time_to_next_ms
      FROM source_totals s
      LEFT JOIN continued c ON c.step = s.step
      ORDER BY dropoff_rate DESC, dropoff_count DESC, entrants DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows;
}

async function queryJourneyFilterOptions({ projectId, startDate, endDate }) {
  const values = [];
  const whereSql = buildJourneyScopeWhere({ userType: "all", device: "", country: "", startDate, endDate, projectId }, values);
  const result = await pool.query(
    `
      SELECT DISTINCT
        COALESCE(NULLIF(TRIM(COALESCE(properties->>'device_type', properties->>'device', properties->'device'->>'type')::text), ''), '(unknown)') AS device_type,
        COALESCE(NULLIF(TRIM(country), ''), '(unknown)') AS country
      FROM events
      ${whereSql ? `${whereSql} AND user_id IS NOT NULL` : "WHERE user_id IS NOT NULL"}
      LIMIT 5000
    `,
    values
  );

  const devices = [];
  const countries = [];
  for (const row of result.rows) {
    if (row.device_type && !devices.includes(row.device_type)) devices.push(row.device_type);
    if (row.country && !countries.includes(row.country)) countries.push(row.country);
  }

  devices.sort((a, b) => a.localeCompare(b));
  countries.sort((a, b) => a.localeCompare(b));

  return { devices, countries };
}

async function queryJourneyFlow({
  metric,
  userType,
  device,
  country,
  startDate,
  endDate,
  projectId,
  path,
  matchMode,
  depth,
  branchLimit,
  startNode,
}) {
  const values = [];
  const whereSql = buildJourneyScopeWhere({ userType, device, country, startDate, endDate, projectId }, values);

  const pathValue = normalizeJourneyFilterValue(path);
  const normalizedStartNode = normalizeJourneyFilterValue(startNode);
  const shouldFilterByPath = Boolean(pathValue);
  const countExpr = metric === "users" ? "COUNT(DISTINCT user_id)::int" : "COUNT(*)::int";

  values.push(shouldFilterByPath);
  const hasPathParamIndex = values.length;
  values.push(pathValue || "");
  const pathParamIndex = values.length;

  const result = await pool.query(
    `
      WITH enriched_events AS (
        SELECT
          e.user_id,
          e.session_id,
          e.project_id,
          COALESCE(NULLIF(TRIM(e.page::text), ''), '(unknown)') AS page,
          e.created_at,
          COALESCE(
            NULLIF(TRIM(COALESCE(e.properties->>'device_type', e.properties->>'device', e.properties->'device'->>'type')::text), ''),
            '(unknown)'
          ) AS device_type,
          COALESCE(NULLIF(TRIM(e.country), ''), '(unknown)') AS country,
          MIN(e.created_at) OVER (PARTITION BY e.user_id) AS user_first_seen
        FROM events e
        WHERE e.user_id IS NOT NULL AND e.session_id IS NOT NULL
      ),
      scoped_events AS (
        SELECT *
        FROM enriched_events
        ${whereSql}
      ),
      ordered_events AS (
        SELECT
          user_id,
          session_id,
          page,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS step_index,
          LEAD(page) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_page,
          LEAD(created_at) OVER (
            PARTITION BY user_id, session_id
            ORDER BY created_at ASC
          ) AS next_created_at
        FROM scoped_events
      ),
      matching_sessions AS (
        SELECT DISTINCT user_id, session_id
        FROM ordered_events
        WHERE
          $${hasPathParamIndex}::boolean = FALSE
          OR (
            ${matchMode === "starts_from" ? `step_index = 1 AND page = $${pathParamIndex}` : `page = $${pathParamIndex}`}
          )
      ),
      matched_events AS (
        SELECT o.*
        FROM ordered_events o
        INNER JOIN matching_sessions m
          ON m.user_id = o.user_id AND m.session_id = o.session_id
      ),
      transition_rows AS (
        SELECT
          page AS source,
          next_page AS target,
          user_id,
          session_id,
          created_at,
          next_created_at
        FROM matched_events
        WHERE next_page IS NOT NULL AND next_page <> page
      ),
      transition_agg AS (
        SELECT
          source,
          target,
          ${countExpr} AS count,
          ROUND(AVG(EXTRACT(EPOCH FROM (next_created_at - created_at)) * 1000))::bigint AS avg_transition_ms
        FROM transition_rows
        GROUP BY source, target
      ),
      source_totals AS (
        SELECT
          page AS step,
          ${countExpr} AS entrants
        FROM matched_events
        GROUP BY page
      ),
      continued_totals AS (
        SELECT
          source AS step,
          ${countExpr} AS continued
        FROM transition_rows
        GROUP BY source
      ),
      top_paths AS (
        SELECT
          page,
          ${countExpr} AS views,
          COUNT(DISTINCT user_id)::int AS users
        FROM matched_events
        GROUP BY page
      )
      SELECT json_build_object(
        'transitions', COALESCE((
          SELECT json_agg(json_build_object(
            'source', t.source,
            'target', t.target,
            'count', t.count,
            'avg_transition_ms', COALESCE(t.avg_transition_ms, 0)
          ) ORDER BY t.count DESC)
          FROM transition_agg t
        ), '[]'::json),
        'dropoffs', COALESCE((
          SELECT json_agg(json_build_object(
            'step', s.step,
            'entrants', s.entrants,
            'continued', COALESCE(c.continued, 0),
            'dropoff_count', GREATEST(s.entrants - COALESCE(c.continued, 0), 0),
            'dropoff_rate', CASE WHEN s.entrants = 0 THEN 0 ELSE ROUND((GREATEST(s.entrants - COALESCE(c.continued, 0), 0)::numeric / s.entrants::numeric) * 100, 1) END
          ) ORDER BY (CASE WHEN s.entrants = 0 THEN 0 ELSE ROUND((GREATEST(s.entrants - COALESCE(c.continued, 0), 0)::numeric / s.entrants::numeric) * 100, 1) END) DESC, s.entrants DESC)
          FROM source_totals s
          LEFT JOIN continued_totals c ON c.step = s.step
        ), '[]'::json),
        'top_paths', COALESCE((
          SELECT json_agg(json_build_object(
            'page', p.page,
            'views', p.views,
            'users', p.users
          ) ORDER BY p.views DESC)
          FROM top_paths p
        ), '[]'::json),
        'summary', json_build_object(
          'matched_sessions', (SELECT COUNT(*)::int FROM matching_sessions),
          'matched_users', (SELECT COUNT(DISTINCT user_id)::int FROM matching_sessions),
          'total_transitions', (SELECT COALESCE(SUM(count), 0)::int FROM transition_agg)
        )
      ) AS payload
    `,
    values
  );

  const payload = result.rows[0]?.payload || {
    transitions: [],
    dropoffs: [],
    top_paths: [],
    summary: { matched_sessions: 0, matched_users: 0, total_transitions: 0 },
  };

  const transitions = Array.isArray(payload.transitions) ? payload.transitions : [];
  const graph = buildJourneyExploreGraph(
    transitions,
    normalizedStartNode || pathValue,
    Math.min(Math.max(Number(depth || 3), 1), 5),
    Math.min(Math.max(Number(branchLimit || 5), 2), 8)
  );

  const nodes = Array.isArray(graph?.sankey?.nodes)
    ? graph.sankey.nodes.map((node) => ({ id: String(node?.name || "") })).filter((node) => node.id)
    : [];
  const links = Array.isArray(graph?.sankey?.links)
    ? graph.sankey.links.map((link) => ({
        source: String(link?.source_name || ""),
        target: String(link?.target_name || ""),
        value: Number(link?.count || link?.value || 0),
        percentage:
          Number(payload?.summary?.total_transitions || 0) > 0
            ? Number((((Number(link?.count || link?.value || 0) / Number(payload.summary.total_transitions || 0)) * 100)).toFixed(2))
            : 0,
        avg_transition_ms: Number(link?.avg_transition_ms || 0),
      }))
    : [];

  return {
    nodes,
    links,
    graph,
    transitions,
    dropoffs: Array.isArray(payload.dropoffs) ? payload.dropoffs : [],
    top_paths: Array.isArray(payload.top_paths) ? payload.top_paths : [],
    summary: payload.summary || { matched_sessions: 0, matched_users: 0, total_transitions: 0 },
    effective_path: pathValue,
    match_mode: matchMode,
  };
}

function buildJourneyExploreGraph(transitions, startPath, depth, branchLimit) {
  const adjacency = new Map();
  for (const row of transitions) {
    const source = String(row.source || "(unknown)");
    if (!adjacency.has(source)) adjacency.set(source, []);
    adjacency.get(source).push({
      source,
      target: String(row.target || "(unknown)"),
      count: Number(row.count || 0),
      avg_transition_ms: Number(row.avg_transition_ms || 0),
    });
  }

  for (const edges of adjacency.values()) {
    edges.sort((a, b) => b.count - a.count);
  }

  const start = startPath || (transitions[0] ? String(transitions[0].source || "(unknown)") : "");
  if (!start) {
    return {
      start: "",
      nodes: [],
      links: [],
      levels: [],
    };
  }

  const visited = new Set([start]);
  const nodes = [{ id: start, level: 0, volume: 0 }];
  const links = [];
  const levels = [[{ id: start, level: 0, count: 0, dropoff_rate: 0 }]];
  let frontier = [start];

  for (let level = 0; level < depth; level += 1) {
    const nextFrontier = [];
    const levelNodes = [];

    for (const source of frontier) {
      const edges = (adjacency.get(source) || []).slice(0, branchLimit);
      const sourceVolume = edges.reduce((sum, edge) => sum + edge.count, 0);

      for (const edge of edges) {
        links.push(edge);

        const dropoffRate = sourceVolume > 0 ? Number((((sourceVolume - edge.count) / sourceVolume) * 100).toFixed(1)) : 0;
        levelNodes.push({
          id: edge.target,
          level: level + 1,
          count: edge.count,
          dropoff_rate: dropoffRate,
          avg_transition_ms: edge.avg_transition_ms,
          source,
        });

        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          nodes.push({ id: edge.target, level: level + 1, volume: edge.count });
          nextFrontier.push(edge.target);
        }
      }
    }

    if (levelNodes.length === 0) break;
    levels.push(levelNodes);
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  const sankeyNodeIndex = new Map();
  const sankeyNodes = [];
  for (const node of nodes) {
    if (!sankeyNodeIndex.has(node.id)) {
      sankeyNodeIndex.set(node.id, sankeyNodes.length);
      sankeyNodes.push({ name: node.id });
    }
  }
  const sankeyLinks = links
    .filter((edge) => sankeyNodeIndex.has(edge.source) && sankeyNodeIndex.has(edge.target))
    .map((edge) => ({
      source: sankeyNodeIndex.get(edge.source),
      target: sankeyNodeIndex.get(edge.target),
      value: Math.max(1, Number(edge.count || 0)),
      avg_transition_ms: Number(edge.avg_transition_ms || 0),
      source_name: edge.source,
      target_name: edge.target,
      count: Number(edge.count || 0),
    }));

  return {
    start,
    nodes,
    links,
    levels,
    sankey: {
      nodes: sankeyNodes,
      links: sankeyLinks,
    },
  };
}

router.get("/session-recordings", listSessionRecordings);
router.get("/session-recordings/:sessionId/events", getSessionReplay);
router.get("/session-recordings/:sessionId/dead-clicks", getDeadClicksForSession);
router.delete("/session-recordings", deleteAllSessionRecordings);
router.delete("/session-recordings/:sessionId", deleteSessionRecording);

router.get("/overview", async (req, res) => {
  try {
    const projectId = String(req.query.project_id || "").trim();
    const hasProjectFilter = Boolean(projectId);
    const [hasEvents, hasFrontendErrors, hasSessionRecordings] = await Promise.all([
      tableExists("events"),
      tableExists("frontend_errors"),
      tableExists("session_recordings"),
    ]);

    const [totalEventsResult, totalUsersResult, totalSessionsResult, totalErrorsResult, recentActivityResult] = await Promise.all([
      hasEvents
        ? pool.query(`SELECT COUNT(*)::int AS value FROM events${hasProjectFilter ? " WHERE project_id = $1" : ""}`, hasProjectFilter ? [projectId] : [])
        : Promise.resolve({ rows: [{ value: 0 }] }),
      hasEvents
        ? pool.query(`SELECT COUNT(DISTINCT user_id)::int AS value FROM events${hasProjectFilter ? " WHERE project_id = $1" : ""}`, hasProjectFilter ? [projectId] : [])
        : Promise.resolve({ rows: [{ value: 0 }] }),
      hasSessionRecordings
        ? pool.query(`SELECT COUNT(DISTINCT session_id)::int AS value FROM session_recordings`)
        : Promise.resolve({ rows: [{ value: 0 }] }),
      hasFrontendErrors
        ? pool.query(`SELECT COUNT(*)::int AS value FROM frontend_errors${hasProjectFilter ? " WHERE project_id = $1" : ""}`, hasProjectFilter ? [projectId] : [])
        : Promise.resolve({ rows: [{ value: 0 }] }),
      hasEvents
        ? pool.query(`
            SELECT
              event_name,
              user_id,
              session_id,
              page,
              created_at
            FROM events
            ${hasProjectFilter ? "WHERE project_id = $1" : ""}
            ORDER BY created_at DESC
            LIMIT 20
          `, hasProjectFilter ? [projectId] : [])
        : Promise.resolve({ rows: [] }),
    ]);

    const totalEvents = Number(totalEventsResult.rows[0]?.value || 0);
    const totalUsers = Number(totalUsersResult.rows[0]?.value || 0);
    const totalSessions = Number(totalSessionsResult.rows[0]?.value || 0);
    const totalErrors = Number(totalErrorsResult.rows[0]?.value || 0);
    const recentActivity = recentActivityResult.rows;

    return res.json({
      metrics: {
        total_events: totalEvents,
        total_users: totalUsers,
        sessions: totalSessions,
        errors: totalErrors,
      },
      recent_activity: recentActivity,
    });
  } catch (error) {
    console.error("Overview query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch overview analytics" });
  }
});

/**
 * Production analytics query endpoint
 * POST /analytics/query
 * 
 * Body:
 * {
 *   eventNames: string[],
 *   metric: "count" | "unique_users",
 *   chartType: "line" | "bar" | "table",
 *   groupBy: "event_name" | "page" | "user_id" | "session_id" | "created_at" | "device_type",
 *   xAxis?: "event_name" | "page" | "user_id" | "session_id" | "created_at" | "device_type",
 *   yAxis?: "count" | "unique_users",
 *   startDate: string (YYYY-MM-DD),
 *   endDate: string (YYYY-MM-DD),
 *   filterText?: string
 * }
 * 
 * Returns:
 * {
 *   labels: string[],
 *   datasets: [{ label: string, data: number[] }],
 *   raw: object[]
 * }
 */
router.post("/query", async (req, res) => {
  try {
    const {
      project_id,
      events,
      eventNames,
      metric = "count",
      chartType = "line",
      timeRange = "7d",
      interval = "day",
      filters = [],
      breakdown = null,
      startDate,
      endDate,
    } = req.body;

    const selectedEvents = Array.isArray(events) ? events : Array.isArray(eventNames) ? eventNames : [];
    const projectId = String(project_id || "").trim();

    // Validate inputs
    if (!Array.isArray(selectedEvents) || selectedEvents.length === 0) {
      return res.status(400).json({ error: "events must be a non-empty array" });
    }

    const validMetrics = ["count", "unique_users"];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({ error: `metric must be one of: ${validMetrics.join(", ")}` });
    }

    const validChartTypes = ["line", "bar", "table"];
    if (!validChartTypes.includes(chartType)) {
      return res.status(400).json({ error: `chartType must be one of: ${validChartTypes.join(", ")}` });
    }

    if (timeRange === "custom" && (!startDate || !endDate)) {
      return res.status(400).json({ error: "startDate and endDate are required for custom range" });
    }

    const result = await executeQueryBuilderAnalytics({
      events: selectedEvents,
      metric,
      chartType,
      timeRange,
      interval,
      filters,
      breakdown,
      startDate,
      endDate,
      projectId: projectId || undefined,
    });

    return res.json(result);
  } catch (error) {
    console.error("Analytics query error:", error.message);
    return res.status(500).json({ error: error.message || "Failed to execute analytics query" });
  }
});

router.get("/heatmap/click", getClickHeatmap);
router.get("/heatmap/hover", getHoverHeatmap);
router.get("/heatmap/scroll", getScrollHeatmap);
router.get("/heatmap/snapshot", getLatestPageSnapshot);
router.get("/heatmap/pages", getPageUrls);
router.get("/heatmap/stats", getHeatmapStats);

router.get("/frontend-errors/summary", async (req, res) => {
  try {
    const projectId = String(req.query.project_id || "").trim();
    const hasFrontendErrors = await tableExists("frontend_errors");
    if (!hasFrontendErrors) {
      return res.json({
        top_errors: [],
        frequency: [],
        replay_sessions: [],
        sessions_affected: 0,
        total_errors: 0,
        resolved_errors: 0,
        unresolved_errors: 0,
      });
    }

    await ensureFrontendErrorsColumns();

    const projectWhere = projectId ? "WHERE project_id = $1" : "";
    const projectValues = projectId ? [projectId] : [];

    const [topErrorsResult, frequencyResult, sessionsResult, replaySessionsResult] = await Promise.all([
      pool.query(`
        SELECT
          message,
          COUNT(*)::int AS count,
          COUNT(DISTINCT session_id)::int AS sessions_affected
        FROM frontend_errors
        ${projectWhere}
        GROUP BY message
        ORDER BY count DESC
        LIMIT 10
      `, projectValues),
      pool.query(`
        SELECT
          DATE(COALESCE(timestamp, created_at))::text AS date,
          COUNT(*)::int AS count
        FROM frontend_errors
        ${projectWhere}
        GROUP BY DATE(COALESCE(timestamp, created_at))
        ORDER BY DATE(COALESCE(timestamp, created_at)) DESC
        LIMIT 14
      `, projectValues),
      pool.query(`
        SELECT
          COUNT(DISTINCT session_id)::int AS sessions_affected,
          COUNT(*)::int AS total_errors,
          COUNT(*) FILTER (WHERE resolved = TRUE)::int AS resolved_errors,
          COUNT(*) FILTER (WHERE resolved = FALSE)::int AS unresolved_errors
        FROM frontend_errors
        ${projectWhere}
      `, projectValues),
      pool.query(`
        SELECT
          session_id,
          user_id,
          COUNT(*)::int AS error_count,
          MAX(COALESCE(timestamp, created_at)) AS last_seen
        FROM frontend_errors
        ${projectWhere ? `${projectWhere} AND` : "WHERE"} session_id IS NOT NULL
        GROUP BY session_id, user_id
        ORDER BY error_count DESC, last_seen DESC
        LIMIT 20
      `, projectValues),
    ]);

    return res.json({
      top_errors: topErrorsResult.rows,
      frequency: frequencyResult.rows,
      replay_sessions: replaySessionsResult.rows,
      sessions_affected: Number(sessionsResult.rows[0]?.sessions_affected || 0),
      total_errors: Number(sessionsResult.rows[0]?.total_errors || 0),
      resolved_errors: Number(sessionsResult.rows[0]?.resolved_errors || 0),
      unresolved_errors: Number(sessionsResult.rows[0]?.unresolved_errors || 0),
    });
  } catch (error) {
    console.error("Frontend error summary query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch frontend error summary" });
  }
});

router.get("/frontend-errors/events", async (req, res) => {
  try {
    const hasFrontendErrors = await tableExists("frontend_errors");
    if (!hasFrontendErrors) {
      return res.json({ by_page: [], events: [] });
    }

    await ensureFrontendErrorsColumns();

    const requestedLimit = Number(req.query.limit || 120);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 20), 500)
      : 120;
    const projectId = String(req.query.project_id || "").trim();
    const statusFilter = String(req.query.status || "all").trim().toLowerCase();
    const statusParts = [];
    if (statusFilter === "resolved") {
      statusParts.push("resolved = TRUE");
    } else if (statusFilter === "unresolved") {
      statusParts.push("resolved = FALSE");
    }

    const byPageParts = [...statusParts];
    const byPageValues = [];
    if (projectId) {
      byPageValues.push(projectId);
      byPageParts.push(`project_id = $${byPageValues.length}`);
    }
    const byPageWhereSql = byPageParts.length > 0 ? `WHERE ${byPageParts.join(" AND ")}` : "";

    const eventsParts = [...statusParts];
    const eventsValues = [limit];
    if (projectId) {
      eventsValues.push(projectId);
      eventsParts.push(`project_id = $${eventsValues.length}`);
    }
    const eventsWhereSql = eventsParts.length > 0 ? `WHERE ${eventsParts.join(" AND ")}` : "";

    const [byPageResult, eventsResult] = await Promise.all([
      pool.query(
        `
          SELECT
            COALESCE(
              NULLIF(TRIM(page_path), ''),
              NULLIF(TRIM(page), ''),
              NULLIF(TRIM(page_url), ''),
              '(unknown)'
            ) AS page,
            COUNT(*)::int AS count
          FROM frontend_errors
          ${byPageWhereSql}
          GROUP BY 1
          ORDER BY count DESC, page ASC
          LIMIT 20
        `,
        byPageValues
      ),
      pool.query(
        `
          SELECT
            id,
            user_id,
            session_id,
            message,
            stack,
            COALESCE(NULLIF(TRIM(page_path), ''), NULLIF(TRIM(page), ''), '(unknown)') AS page,
            COALESCE(NULLIF(TRIM(page_url), ''), NULL) AS page_url,
            COALESCE(NULLIF(TRIM(source_file), ''), NULL) AS source,
            line_number AS line,
            column_number AS column,
            COALESCE(NULLIF(TRIM(error_type), ''), 'Error') AS error_type,
            COALESCE(NULLIF(TRIM(user_agent), ''), NULL) AS user_agent,
            COALESCE(resolved, FALSE) AS resolved,
            resolved_at,
            COALESCE(NULLIF(TRIM(resolved_by), ''), NULL) AS resolved_by,
            COALESCE(NULLIF(TRIM(resolution_note), ''), NULL) AS resolution_note,
            timestamp,
            created_at
          FROM frontend_errors
          ${eventsWhereSql}
          ORDER BY COALESCE(timestamp, created_at) DESC
          LIMIT $1
        `,
        eventsValues
      ),
    ]);

    return res.json({
      by_page: byPageResult.rows,
      events: eventsResult.rows,
    });
  } catch (error) {
    console.error("Frontend error events query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch frontend error events" });
  }
});

router.get("/frontend-errors/:id/logs", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const projectId = String(req.query.project_id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Error id is required" });
    }

    await ensureFrontendErrorsColumns();

    const primaryResult = await pool.query(
      `
        SELECT
          id,
          user_id,
          session_id,
          message,
          stack,
          COALESCE(NULLIF(TRIM(page_path), ''), NULLIF(TRIM(page), ''), '(unknown)') AS page,
          COALESCE(NULLIF(TRIM(page_url), ''), NULL) AS page_url,
          COALESCE(NULLIF(TRIM(source_file), ''), NULL) AS source,
          line_number AS line,
          column_number AS column,
          COALESCE(NULLIF(TRIM(error_type), ''), 'Error') AS error_type,
          COALESCE(NULLIF(TRIM(user_agent), ''), NULL) AS user_agent,
          COALESCE(resolved, FALSE) AS resolved,
          resolved_at,
          COALESCE(NULLIF(TRIM(resolved_by), ''), NULL) AS resolved_by,
          COALESCE(NULLIF(TRIM(resolution_note), ''), NULL) AS resolution_note,
          timestamp,
          created_at
        FROM frontend_errors
        WHERE id = $1${projectId ? " AND project_id = $2" : ""}
        LIMIT 1
      `,
      projectId ? [id, projectId] : [id]
    );

    if (primaryResult.rows.length === 0) {
      return res.status(404).json({ error: "Error log not found" });
    }

    const primary = primaryResult.rows[0];

    const relatedResult = await pool.query(
      `
        SELECT
          id,
          session_id,
          user_id,
          COALESCE(NULLIF(TRIM(page_path), ''), NULLIF(TRIM(page), ''), '(unknown)') AS page,
          COALESCE(NULLIF(TRIM(source_file), ''), NULL) AS source,
          line_number AS line,
          column_number AS column,
          COALESCE(resolved, FALSE) AS resolved,
          COALESCE(timestamp, created_at) AS seen_at
        FROM frontend_errors
        WHERE message = $1
        ORDER BY COALESCE(timestamp, created_at) DESC
        LIMIT 15
      `,
      projectId ? [String(primary.message || ""), projectId] : [String(primary.message || "")]
    );

    return res.json({
      event: primary,
      related_events: relatedResult.rows,
    });
  } catch (error) {
    console.error("Frontend error logs query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch frontend error logs" });
  }
});

router.patch("/frontend-errors/:id/resolve", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "Error id is required" });
    }

    await ensureFrontendErrorsColumns();

    const resolved = req.body?.resolved !== false;
    const resolvedBy = String(req.body?.resolved_by || "dev-team").trim() || "dev-team";
    const resolutionNote = String(req.body?.resolution_note || "").trim() || null;

    const result = await pool.query(
      `
        UPDATE frontend_errors
        SET
          resolved = $2,
          resolved_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
          resolved_by = CASE WHEN $2 THEN $3 ELSE NULL END,
          resolution_note = CASE WHEN $2 THEN $4 ELSE NULL END
        WHERE id = $1
        RETURNING
          id,
          COALESCE(resolved, FALSE) AS resolved,
          resolved_at,
          COALESCE(NULLIF(TRIM(resolved_by), ''), NULL) AS resolved_by,
          COALESCE(NULLIF(TRIM(resolution_note), ''), NULL) AS resolution_note
      `,
      [id, resolved, resolvedBy, resolutionNote]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Error event not found" });
    }

    return res.json({ success: true, event: result.rows[0] });
  } catch (error) {
    console.error("Frontend error resolve update failed:", error.message);
    return res.status(500).json({ error: "Failed to update error resolution state" });
  }
});

router.get("/user-journeys", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json({ top_paths: [], transitions: [], dropoffs: [], filters: { devices: [], countries: [] } });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 5), 100);
    const metric = normalizeJourneyMetric(req.query.metric);
    const userType = normalizeJourneyUserType(req.query.userType);
    const device = normalizeJourneyFilterValue(req.query.device);
    const country = normalizeJourneyFilterValue(req.query.country);
    const projectId = normalizeJourneyProjectId(req.query.project_id);
    const startDate = normalizeDateValue(req.query.startDate);
    const endDate = normalizeDateValue(req.query.endDate);

    const [transitions, topPaths, dropoffs, filterOptions] = await Promise.all([
      queryJourneyTransitions({ metric, userType, device, country, startDate, endDate, projectId, limit }),
      queryJourneyTopPaths({ metric, userType, device, country, startDate, endDate, projectId, limit }),
      queryJourneyDropoffs({ metric, userType, device, country, startDate, endDate, projectId, limit }),
      queryJourneyFilterOptions({ projectId, startDate, endDate }),
    ]);

    return res.json({
      metric,
      filters_applied: {
        projectId,
        userType,
        device,
        country,
        startDate,
        endDate,
      },
      top_paths: topPaths,
      transitions,
      dropoffs,
      filters: filterOptions,
    });
  } catch (error) {
    console.error("User journeys query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch user journeys" });
  }
});

router.get("/user-journeys/flow", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json({
        nodes: [],
        links: [],
        graph: { start: "", nodes: [], links: [], levels: [], sankey: { nodes: [], links: [] } },
        transitions: [],
        dropoffs: [],
        top_paths: [],
        summary: { matched_sessions: 0, matched_users: 0, total_transitions: 0 },
        effective_path: "",
        match_mode: "contains",
        filters: { devices: [], countries: [] },
      });
    }

    const metric = normalizeJourneyMetric(req.query.metric);
    const userType = normalizeJourneyUserType(req.query.userType);
    const device = normalizeJourneyFilterValue(req.query.device);
    const country = normalizeJourneyFilterValue(req.query.country);
    const projectId = normalizeJourneyProjectId(req.query.project_id);
    const startDate = normalizeDateValue(req.query.startDate);
    const endDate = normalizeDateValue(req.query.endDate);
    const path = normalizeJourneyFilterValue(req.query.path);
    const matchMode = normalizeJourneyMatchMode(req.query.matchMode);
    const startNode = normalizeJourneyFilterValue(req.query.startNode);
    const depth = Math.min(Math.max(Number(req.query.depth || 3), 1), 5);
    const branchLimit = Math.min(Math.max(Number(req.query.branchLimit || 5), 2), 8);

    const [flow, filterOptions] = await Promise.all([
      queryJourneyFlow({
        metric,
        userType,
        device,
        country,
        startDate,
        endDate,
        projectId,
        path,
        matchMode,
        startNode,
        depth,
        branchLimit,
      }),
      queryJourneyFilterOptions({ projectId, startDate, endDate }),
    ]);

    return res.json({
      metric,
      filters_applied: {
        projectId,
        userType,
        device,
        country,
        startDate,
        endDate,
      },
      ...flow,
      filters: filterOptions,
    });
  } catch (error) {
    console.error("User journeys flow query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch journey flow" });
  }
});

router.get("/user-journeys/explore", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json({
        start: "",
        nodes: [],
        links: [],
        levels: [],
        sankey: { nodes: [], links: [] },
      });
    }

    const metric = normalizeJourneyMetric(req.query.metric);
    const userType = normalizeJourneyUserType(req.query.userType);
    const device = normalizeJourneyFilterValue(req.query.device);
    const country = normalizeJourneyFilterValue(req.query.country);
    const projectId = normalizeJourneyProjectId(req.query.project_id);
    const startDate = normalizeDateValue(req.query.startDate);
    const endDate = normalizeDateValue(req.query.endDate);
    const start = normalizeJourneyFilterValue(req.query.start);
    const depth = Math.min(Math.max(Number(req.query.depth || 3), 1), 5);
    const branchLimit = Math.min(Math.max(Number(req.query.branchLimit || 6), 2), 12);

    const transitions = await queryJourneyTransitions({
      metric,
      userType,
      device,
      country,
      startDate,
      endDate,
      projectId,
      limit: 1500,
    });

    const graph = buildJourneyExploreGraph(transitions, start, depth, branchLimit);
    return res.json({
      metric,
      filters_applied: {
        projectId,
        userType,
        device,
        country,
        startDate,
        endDate,
      },
      ...graph,
    });
  } catch (error) {
    console.error("Journey explore query error:", error.message);
    return res.status(500).json({ error: "Failed to explore user journeys" });
  }
});

router.get("/user-journeys/path-sessions", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json({ sessions: [] });
    }

    const path = normalizeJourneyFilterValue(req.query.path);
    const source = normalizeJourneyFilterValue(req.query.source);
    const target = normalizeJourneyFilterValue(req.query.target);
    const projectId = normalizeJourneyProjectId(req.query.project_id);
    const startDate = normalizeDateValue(req.query.startDate);
    const endDate = normalizeDateValue(req.query.endDate);
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

    if (!path && !(source && target)) {
      return res.status(400).json({ error: "Provide path or both source and target" });
    }

    const values = [];
    let whereSql = "";

    if (path) {
      values.push(path);
      whereSql = `page = $${values.length}`;
    } else {
      values.push(source);
      const sourceIndex = values.length;
      values.push(target);
      const targetIndex = values.length;
      whereSql = `page = $${sourceIndex} AND next_page = $${targetIndex}`;
    }

    if (projectId) {
      values.push(projectId);
      whereSql = `${whereSql} AND project_id = $${values.length}`;
    }

    if (startDate) {
      values.push(startDate);
      whereSql = `${whereSql} AND created_at >= $${values.length}::date`;
    }

    if (endDate) {
      values.push(endDate);
      whereSql = `${whereSql} AND created_at < ($${values.length}::date + INTERVAL '1 day')`;
    }

    if (!startDate && !endDate) {
      whereSql = `${whereSql} AND created_at >= NOW() - INTERVAL '${JOURNEY_DEFAULT_FRESH_WINDOW_DAYS} days'`;
    }

    values.push(limit);

    const result = await pool.query(
      `
        WITH ordered_events AS (
          SELECT
            user_id,
            session_id,
            project_id,
            COALESCE(NULLIF(TRIM(page::text), ''), '(unknown)') AS page,
            created_at,
            LEAD(COALESCE(NULLIF(TRIM(page::text), ''), '(unknown)')) OVER (
              PARTITION BY user_id, session_id
              ORDER BY created_at ASC
            ) AS next_page
          FROM events
          WHERE user_id IS NOT NULL AND session_id IS NOT NULL
        )
        SELECT
          user_id,
          session_id,
          MAX(created_at) AS last_seen
        FROM ordered_events
        WHERE ${whereSql}
        GROUP BY user_id, session_id
        ORDER BY last_seen DESC
        LIMIT $${values.length}
      `,
      values
    );

    return res.json({
      sessions: result.rows.map((row) => ({
        user_id: row.user_id,
        session_id: row.session_id,
        last_seen: row.last_seen,
      })),
    });
  } catch (error) {
    console.error("Journey path sessions query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch path sessions" });
  }
});

router.get("/events", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json([]);
    }

    const allowedGroups = new Set(["event_name", "page", "user_id", "session_id"]);
    const requestedGroup = String(req.query.groupBy || "event_name").trim();
    const groupBy = allowedGroups.has(requestedGroup) ? requestedGroup : "event_name";

    const rawEvents = String(req.query.events || "").trim();
    const selectedEvents = rawEvents
      ? rawEvents
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const projectId = String(req.query.project_id || "").trim();

    const whereParts = [];
    const values = [];

    // Only filter by project_id if it's not "*" (wildcard for all projects)
    if (projectId && projectId !== "*") {
      values.push(projectId);
      whereParts.push(`project_id = $${values.length}`);
    }

    if (selectedEvents.length > 0) {
      values.push(selectedEvents);
      whereParts.push(`event_name = ANY($${values.length}::text[])`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const query = `
      SELECT
        COALESCE(NULLIF(TRIM(${groupBy}::text), ''), '(unknown)') AS label,
        COUNT(*)::int AS count
      FROM events
      ${whereSql}
      GROUP BY label
      ORDER BY count DESC, label ASC
      LIMIT 100
    `;

    const result = await pool.query(query, values);
    return res.json(result.rows);
  } catch (error) {
    console.error("Events query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch analytics events" });
  }
});

router.get("/funnels", async (_req, res) => {
  try {
    const rows = await funnelService.listSavedFunnels();
    return res.json(rows);
  } catch (error) {
    console.error("Funnels list query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch saved funnels" });
  }
});

router.post("/funnels/analyze", async (req, res) => {
  try {
    const metrics = await funnelService.analyzeFunnel(req.body || {});
    return res.json(metrics);
  } catch (error) {
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to analyze funnel" });
  }
});

router.post("/funnels", async (req, res) => {
  try {
    const funnel = await funnelService.createSavedFunnel(req.body || {});
    return res.status(201).json(funnel);
  } catch (error) {
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to save funnel" });
  }
});

router.put("/funnels/:id", async (req, res) => {
  try {
    const funnel = await funnelService.updateSavedFunnel(req.params.id, req.body || {});
    return res.json(funnel);
  } catch (error) {
    if (/not found/i.test(error.message || "")) {
      return res.status(404).json({ error: "Funnel not found" });
    }
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to update funnel" });
  }
});

router.delete("/funnels/:id", async (req, res) => {
  try {
    const result = await funnelService.deleteSavedFunnel(req.params.id);
    return res.json(result);
  } catch (error) {
    const code = /required/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to delete funnel" });
  }
});

module.exports = router;