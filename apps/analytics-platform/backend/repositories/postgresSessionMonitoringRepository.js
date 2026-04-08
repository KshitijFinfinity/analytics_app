const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

let ensureTablesPromise = null;

async function ensureTables() {
  if (ensureTablesPromise) {
    return ensureTablesPromise;
  }

  ensureTablesPromise = (async () => {
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
      page_url TEXT,
      page_path TEXT,
      source_file TEXT,
      line_number INTEGER,
      column_number INTEGER,
      error_type TEXT,
      user_agent TEXT,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT,
      resolution_note TEXT,
      timestamp TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS page_url TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS page_path TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS source_file TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS line_number INTEGER
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS column_number INTEGER
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS error_type TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS user_agent TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS resolved_by TEXT
  `);

  await pool.query(`
    ALTER TABLE frontend_errors
    ADD COLUMN IF NOT EXISTS resolution_note TEXT
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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_recordings_session_user ON session_recordings(session_id, user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_recordings_session_event_time ON session_recordings(session_id, COALESCE(event_timestamp, created_at))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_recordings_user_session_event_time ON session_recordings(user_id, session_id, COALESCE(event_timestamp, created_at))`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_frontend_errors_session_user ON frontend_errors(session_id, user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_frontend_errors_message ON frontend_errors(message)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_frontend_errors_error_time ON frontend_errors((COALESCE(timestamp, created_at)))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_frontend_errors_page_path ON frontend_errors(page_path)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_frontend_errors_resolved ON frontend_errors(resolved)`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dead_clicks_session_user_time ON dead_clicks(session_id, user_id, COALESCE(timestamp, created_at))`);
  })();

  try {
    await ensureTablesPromise;
  } catch (error) {
    ensureTablesPromise = null;
    throw error;
  }
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

async function insertFrontendError({
  user_id,
  session_id,
  message,
  stack,
  page,
  page_url,
  page_path,
  source_file,
  line_number,
  column_number,
  error_type,
  user_agent,
  timestamp,
}) {
  await ensureTables();

  const query = `
    INSERT INTO frontend_errors (
      id,
      user_id,
      session_id,
      message,
      stack,
      page,
      page_url,
      page_path,
      source_file,
      line_number,
      column_number,
      error_type,
      user_agent,
      timestamp
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz)
  `;

  const normalizedLine = Number.isFinite(Number(line_number)) ? Number(line_number) : null;
  const normalizedColumn = Number.isFinite(Number(column_number)) ? Number(column_number) : null;

  const values = [
    uuidv4(),
    String(user_id || ""),
    String(session_id || ""),
    String(message || ""),
    stack || null,
    page || null,
    page_url || null,
    page_path || null,
    source_file || null,
    normalizedLine,
    normalizedColumn,
    error_type || null,
    user_agent || null,
    timestamp || null,
  ];
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

  let result = hasUserId
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

  if (hasUserId && result.rows.length === 0) {
    // Fallback for sessions where user_id changed over time but session_id is still valid.
    result = await pool.query(
      `SELECT session_id, user_id, page, element, x, y, timestamp, created_at
       FROM dead_clicks
       WHERE session_id = $1
       ORDER BY COALESCE(timestamp, created_at) ASC`,
      [sessionId]
    );
  }

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
        MIN(CASE WHEN jsonb_array_length(events) > 0 THEN COALESCE(event_timestamp, created_at) END) AS replay_start_timestamp,
        MAX(CASE WHEN jsonb_array_length(events) > 0 THEN COALESCE(event_timestamp, created_at) END) AS replay_end_timestamp,
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
      r.replay_start_timestamp,
      r.replay_end_timestamp,
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
    replay_start_timestamp: row.replay_start_timestamp,
    replay_end_timestamp: row.replay_end_timestamp,
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

  let eventsResult = hasUserId
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

  let errorsResult = hasUserId
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

  if (hasUserId && eventsResult.rows.length === 0) {
    // Fallback for older data where session rows may not match the requested user_id exactly.
    eventsResult = await pool.query(
      `
        SELECT events
        FROM session_recordings
        WHERE session_id = $1
        ORDER BY COALESCE(event_timestamp, created_at) ASC
      `,
      [sessionId]
    );
  }

  if (hasUserId && errorsResult.rows.length === 0) {
    errorsResult = await pool.query(
      `
        SELECT message, stack, page, timestamp, created_at
        FROM frontend_errors
        WHERE session_id = $1
        ORDER BY COALESCE(timestamp, created_at) ASC
      `,
      [sessionId]
    );
  }

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
