ALTER TABLE IF EXISTS session_recordings ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE IF EXISTS session_recordings ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS session_recordings ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE IF EXISTS session_recordings ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE IF EXISTS session_recordings ADD COLUMN IF NOT EXISTS timezone TEXT;

CREATE INDEX IF NOT EXISTS idx_session_recordings_country ON session_recordings(country);
CREATE INDEX IF NOT EXISTS idx_session_recordings_city ON session_recordings(city);
CREATE INDEX IF NOT EXISTS idx_session_recordings_region ON session_recordings(region);
CREATE INDEX IF NOT EXISTS idx_session_recordings_timezone ON session_recordings(timezone);
