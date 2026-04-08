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
);

ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS id UUID;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS page TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE events
SET project_id = 'legacy'
WHERE project_id IS NULL OR TRIM(project_id) = '';

CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_page ON events(page);
CREATE INDEX IF NOT EXISTS idx_events_session_created_at ON events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_session_created_at ON events(user_id, session_id, created_at ASC);