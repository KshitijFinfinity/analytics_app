const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

async function ensureSessionRecordingsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS session_recordings (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await pool.query(query);
}

async function createSessionRecording({ user_id, session_id, events }) {
  await ensureSessionRecordingsTable();

  const normalizedEvents = Array.isArray(events) ? events : [];
  const query = `
    INSERT INTO session_recordings (id, user_id, session_id, events)
    VALUES ($1, $2, $3, $4::jsonb)
  `;

  const values = [uuidv4(), String(user_id || ""), String(session_id || ""), JSON.stringify(normalizedEvents)];
  await pool.query(query, values);
}

async function listSessionRecordingSessions(limit = 100) {
  await ensureSessionRecordingsTable();

  const query = `
    SELECT
      user_id,
      session_id,
      COUNT(*)::int AS batch_count,
      COALESCE(SUM(jsonb_array_length(events)), 0)::int AS event_count,
      MIN(created_at) AS first_seen_at,
      MAX(created_at) AS last_seen_at
    FROM session_recordings
    GROUP BY user_id, session_id
    ORDER BY MAX(created_at) DESC
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows.map((row) => ({
    user_id: row.user_id,
    session_id: row.session_id,
    batch_count: Number(row.batch_count || 0),
    event_count: Number(row.event_count || 0),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
  }));
}

async function getSessionReplayEvents(sessionId, userId) {
  await ensureSessionRecordingsTable();

  const hasUserId = Boolean(String(userId || "").trim());
  const query = hasUserId
    ? `
      SELECT events
      FROM session_recordings
      WHERE session_id = $1 AND user_id = $2
      ORDER BY created_at ASC
    `
    : `
      SELECT events
      FROM session_recordings
      WHERE session_id = $1
      ORDER BY created_at ASC
    `;

  const params = hasUserId ? [sessionId, userId] : [sessionId];
  const result = await pool.query(query, params);

  const merged = [];
  for (const row of result.rows) {
    const batchEvents = Array.isArray(row.events) ? row.events : [];
    merged.push(...batchEvents);
  }

  merged.sort((a, b) => {
    const aTs = Number(a?.timestamp || 0);
    const bTs = Number(b?.timestamp || 0);
    return aTs - bTs;
  });

  return merged;
}

module.exports = {
  createSessionRecording,
  listSessionRecordingSessions,
  getSessionReplayEvents,
};
