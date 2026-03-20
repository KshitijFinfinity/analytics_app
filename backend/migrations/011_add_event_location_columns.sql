ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS timezone TEXT;

CREATE INDEX IF NOT EXISTS idx_events_country ON events(country);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_region ON events(region);
CREATE INDEX IF NOT EXISTS idx_events_timezone ON events(timezone);
