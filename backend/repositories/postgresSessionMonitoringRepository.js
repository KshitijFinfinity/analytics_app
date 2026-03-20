const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_recordings (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      events JSONB NOT NULL DEFAULT '[]'::jsonb,
      ip_address TEXT,
      country TEXT,
      city TEXT,
      region TEXT,
      timezone TEXT,
      event_timestamp TIMESTAMPTZ,
      start_timestamp TIMESTAMPTZ,
      end_timestamp TIMESTAMPTZ,
      session_finished BOOLEAN NOT NULL DEFAULT FALSE,
      end_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS start_timestamp TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS end_timestamp TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS session_finished BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS end_reason TEXT
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS ip_address TEXT
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS country TEXT
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS city TEXT
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS region TEXT
  `);

  await pool.query(`
    ALTER TABLE session_recordings
    ADD COLUMN IF NOT EXISTS timezone TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS frontend_errors (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      page TEXT,
      timestamp TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dead_clicks (
      id UUID PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      page TEXT,
      element TEXT,
      x DOUBLE PRECISION,
      y DOUBLE PRECISION,
      timestamp TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function insertSessionRecordingBatch({
  user_id,
  session_id,
  events,
  timestamp,
  start_timestamp,
  end_timestamp,
  session_finished,
  end_reason,
  ip_address,
  country,
  city,
  region,
  timezone,
}) {
  await ensureTables();

  const query = `
    INSERT INTO session_recordings (
      id,
      user_id,
      session_id,
      events,
      ip_address,
      country,
      city,
      region,
      timezone,
      event_timestamp,
      start_timestamp,
      end_timestamp,
      session_finished,
      end_reason
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12::timestamptz, $13, $14)
  `;

  const values = [
    uuidv4(),
    String(user_id || ""),
    String(session_id || ""),
    JSON.stringify(Array.isArray(events) ? events : []),
    ip_address ? String(ip_address) : null,
    country ? String(country) : null,
    city ? String(city) : null,
    region ? String(region) : null,
    timezone ? String(timezone) : null,
    timestamp || null,
    start_timestamp || null,
    end_timestamp || null,
    Boolean(session_finished),
    end_reason ? String(end_reason) : null,
  ];

  await pool.query(query, values);
}

async function insertFrontendError({ user_id, session_id, message, stack, page, timestamp }) {
  await ensureTables();

  const query = `
    INSERT INTO frontend_errors (id, user_id, session_id, message, stack, page, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
  `;

  const values = [uuidv4(), String(user_id || ""), String(session_id || ""), String(message || ""), stack || null, page || null, timestamp || null];
  await pool.query(query, values);
}

async function insertDeadClick({ session_id, user_id, page, element, x, y, timestamp }) {
  await ensureTables();

  const query = `
    INSERT INTO dead_clicks (id, session_id, user_id, page, element, x, y, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
  `;

  const values = [
    uuidv4(),
    String(session_id || ""),
    String(user_id || ""),
    page || null,
    element || null,
    x != null ? Number(x) : null,
    y != null ? Number(y) : null,
    timestamp || null,
  ];

  await pool.query(query, values);
}

async function getDeadClicksBySession(sessionId, userId) {
  await ensureTables();

  const hasUserId = Boolean(String(userId || "").trim());

  const result = hasUserId
    ? await pool.query(
        `SELECT session_id, user_id, page, element, x, y, timestamp, created_at
         FROM dead_clicks
         WHERE session_id = $1 AND user_id = $2
         ORDER BY COALESCE(timestamp, created_at) ASC`,
        [sessionId, userId]
      )
    : await pool.query(
        `SELECT session_id, user_id, page, element, x, y, timestamp, created_at
         FROM dead_clicks
         WHERE session_id = $1
         ORDER BY COALESCE(timestamp, created_at) ASC`,
        [sessionId]
      );

  return result.rows.map((row) => ({
    session_id: row.session_id,
    user_id: row.user_id,
    page: row.page,
    element: row.element,
    x: row.x != null ? Number(row.x) : null,
    y: row.y != null ? Number(row.y) : null,
    timestamp: row.timestamp || row.created_at,
  }));
}

async function getSessionSummaries(limit = 100) {
  await ensureTables();

  const query = `
    WITH recording_agg AS (
      SELECT
        user_id,
        session_id,
        COUNT(id)::int AS batch_count,
        COALESCE(SUM(jsonb_array_length(events)), 0)::int AS event_count,
        COALESCE(MIN(start_timestamp), MIN(COALESCE(event_timestamp, created_at))) AS start_timestamp,
        COALESCE(MAX(end_timestamp), MAX(COALESCE(event_timestamp, created_at))) AS end_timestamp,
        BOOL_OR(session_finished) AS session_finished,
        (
          array_remove(
            array_agg(end_reason ORDER BY COALESCE(end_timestamp, event_timestamp, created_at) DESC),
            NULL
          )
        )[1] AS end_reason
      FROM session_recordings
      GROUP BY user_id, session_id
    ),
    error_agg AS (
      SELECT
        user_id,
        session_id,
        COUNT(id)::int AS error_count
      FROM frontend_errors
      GROUP BY user_id, session_id
    )
    SELECT
      r.user_id,
      r.session_id,
      r.batch_count,
      r.event_count,
      r.start_timestamp,
      r.end_timestamp,
      COALESCE(r.session_finished, FALSE) AS session_finished,
      r.end_reason,
      COALESCE(e.error_count, 0)::int AS error_count,
      COALESCE(rec_loc.country, evt_loc.country) AS country,
      COALESCE(rec_loc.city, evt_loc.city) AS city,
      COALESCE(rec_loc.region, evt_loc.region) AS region,
      COALESCE(rec_loc.timezone, evt_loc.timezone) AS timezone,
      COALESCE(r.end_timestamp, r.start_timestamp) AS sort_timestamp
    FROM recording_agg r
    LEFT JOIN error_agg e
      ON e.user_id = r.user_id AND e.session_id = r.session_id
    LEFT JOIN LATERAL (
      SELECT country, city, region, timezone
      FROM session_recordings
      WHERE user_id = r.user_id
        AND session_id = r.session_id
        AND (country IS NOT NULL OR city IS NOT NULL OR region IS NOT NULL OR timezone IS NOT NULL)
      ORDER BY COALESCE(event_timestamp, created_at) DESC
      LIMIT 1
    ) AS rec_loc ON TRUE
    LEFT JOIN LATERAL (
      SELECT country, city, region, timezone
      FROM events
      WHERE session_id = r.session_id
      ORDER BY (user_id = r.user_id) DESC, created_at DESC
      LIMIT 1
    ) AS evt_loc ON TRUE
    ORDER BY sort_timestamp DESC NULLS LAST, r.session_id DESC
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows.map((row) => ({
    user_id: row.user_id,
    session_id: row.session_id,
    batch_count: Number(row.batch_count || 0),
    event_count: Number(row.event_count || 0),
    start_timestamp: row.start_timestamp,
    end_timestamp: row.end_timestamp,
    session_finished: Boolean(row.session_finished),
    end_reason: row.end_reason || null,
    error_count: Number(row.error_count || 0),
    country: row.country || null,
    city: row.city || null,
    region: row.region || null,
    timezone: row.timezone || null,
  }));
}

async function getSessionReplay(sessionId, userId) {
  await ensureTables();

  const hasUserId = Boolean(String(userId || "").trim());

  const eventsResult = hasUserId
    ? await pool.query(
        `
          SELECT events
          FROM session_recordings
          WHERE session_id = $1 AND user_id = $2
          ORDER BY COALESCE(event_timestamp, created_at) ASC
        `,
        [sessionId, userId]
      )
    : await pool.query(
        `
          SELECT events
          FROM session_recordings
          WHERE session_id = $1
          ORDER BY COALESCE(event_timestamp, created_at) ASC
        `,
        [sessionId]
      );

  const errorsResult = hasUserId
    ? await pool.query(
        `
          SELECT message, stack, page, timestamp, created_at
          FROM frontend_errors
          WHERE session_id = $1 AND user_id = $2
          ORDER BY COALESCE(timestamp, created_at) ASC
        `,
        [sessionId, userId]
      )
    : await pool.query(
        `
          SELECT message, stack, page, timestamp, created_at
          FROM frontend_errors
          WHERE session_id = $1
          ORDER BY COALESCE(timestamp, created_at) ASC
        `,
        [sessionId]
      );

  const mergedEvents = [];
  for (const row of eventsResult.rows) {
    const items = Array.isArray(row.events) ? row.events : [];
    mergedEvents.push(...items);
  }

  mergedEvents.sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0));

  return {
    events: mergedEvents,
    errors: errorsResult.rows.map((row) => ({
      message: row.message,
      stack: row.stack,
      page: row.page,
      timestamp: row.timestamp || row.created_at,
    })),
  };
}

async function deleteAllSessionRecordings() {
  await ensureTables();

  await pool.query("BEGIN");
  try {
    const errorsDelete = await pool.query("DELETE FROM frontend_errors");
    const recordingsDelete = await pool.query("DELETE FROM session_recordings");
    await pool.query("COMMIT");

    return {
      deleted_session_recordings: Number(recordingsDelete.rowCount || 0),
      deleted_frontend_errors: Number(errorsDelete.rowCount || 0),
    };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function deleteSessionRecording(sessionId, userId) {
  await ensureTables();

  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedSessionId) {
    throw new Error("sessionId is required");
  }

  await pool.query("BEGIN");
  try {
    let errorsDelete;
    let recordingsDelete;

    if (normalizedUserId) {
      errorsDelete = await pool.query(
        "DELETE FROM frontend_errors WHERE session_id = $1 AND user_id = $2",
        [normalizedSessionId, normalizedUserId]
      );
      recordingsDelete = await pool.query(
        "DELETE FROM session_recordings WHERE session_id = $1 AND user_id = $2",
        [normalizedSessionId, normalizedUserId]
      );
    } else {
      errorsDelete = await pool.query("DELETE FROM frontend_errors WHERE session_id = $1", [normalizedSessionId]);
      recordingsDelete = await pool.query("DELETE FROM session_recordings WHERE session_id = $1", [normalizedSessionId]);
    }

    await pool.query("COMMIT");

    return {
      deleted_session_recordings: Number(recordingsDelete.rowCount || 0),
      deleted_frontend_errors: Number(errorsDelete.rowCount || 0),
    };
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

module.exports = {
  insertSessionRecordingBatch,
  insertFrontendError,
  insertDeadClick,
  getDeadClicksBySession,
  getSessionSummaries,
  getSessionReplay,
  deleteAllSessionRecordings,
  deleteSessionRecording,
};
