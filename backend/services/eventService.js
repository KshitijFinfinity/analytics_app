const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

async function ensureEventsTable() {
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

  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS country TEXT`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS city TEXT`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS region TEXT`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone TEXT`);
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
