const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

let ensureEventsTablePromise = null;

async function ensureEventsTable() {
  if (ensureEventsTablePromise) {
    return ensureEventsTablePromise;
  }

  ensureEventsTablePromise = (async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      page TEXT,
      properties JSONB DEFAULT '{}'::jsonb,
      country TEXT,
      city TEXT,
      region TEXT,
      timezone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

    await pool.query(createTableQuery);

    // Backfill missing columns for older deployments where `events` existed
    // before project-aware tracking was introduced.
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS id UUID`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS project_id TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS user_id TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS session_id TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS page TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await pool.query(`UPDATE events SET project_id = 'legacy' WHERE project_id IS NULL OR TRIM(project_id) = ''`);

    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS city TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS region TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone TEXT`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_page ON events(page)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_session_created_at ON events(session_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_user_session_created_at ON events(user_id, session_id, created_at ASC)`);
  })();

  try {
    await ensureEventsTablePromise;
  } catch (error) {
    ensureEventsTablePromise = null;
    throw error;
  }
}

async function createEvent(eventData) {
  const {
    project_id,
    user_id,
    session_id,
    event_name,
    page,
    properties = {},
    country = null,
    city = null,
    region = null,
    timezone = null,
  } = eventData;

  const id = uuidv4();

  await ensureEventsTable();

  const query = `
    INSERT INTO events (
      id,
      project_id,
      user_id,
      session_id,
      event_name,
      page,
      properties,
      country,
      city,
      region,
      timezone
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;

  const values = [
    id,
    project_id,
    user_id,
    session_id,
    event_name,
    page,
    properties,
    country,
    city,
    region,
    timezone,
  ];

  await pool.query(query, values);

  return { id };
}

module.exports = {
  createEvent,
};
