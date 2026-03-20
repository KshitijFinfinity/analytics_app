-- Heatmap Clicks Table
CREATE TABLE IF NOT EXISTS heatmap_clicks (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  x_coordinate FLOAT NOT NULL,
  y_coordinate FLOAT NOT NULL,
  element_selector TEXT,
  element_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for heatmap_clicks for better query performance
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_page_url ON heatmap_clicks(page_url);
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_session_id ON heatmap_clicks(session_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_user_id ON heatmap_clicks(user_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_created_at ON heatmap_clicks(created_at);

-- Heatmap Scrolls Table
CREATE TABLE IF NOT EXISTS heatmap_scrolls (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  scroll_depth_percentage FLOAT NOT NULL,
  viewport_height INT,
  document_height INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for heatmap_scrolls for better query performance
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_page_url ON heatmap_scrolls(page_url);
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_session_id ON heatmap_scrolls(session_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_user_id ON heatmap_scrolls(user_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_created_at ON heatmap_scrolls(created_at);

-- Heatmap Aggregated Clicks (for performance - pre-aggregated data)
CREATE TABLE IF NOT EXISTS heatmap_clicks_aggregated (
  id UUID PRIMARY KEY,
  page_url TEXT NOT NULL,
  date DATE NOT NULL,
  x_bucket INT NOT NULL,
  y_bucket INT NOT NULL,
  click_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_url, date, x_bucket, y_bucket)
);

-- Indexes for heatmap_clicks_aggregated
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_agg_page_url ON heatmap_clicks_aggregated(page_url);
CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_agg_date ON heatmap_clicks_aggregated(date);

-- Heatmap Aggregated Scrolls (for performance - pre-aggregated data)
CREATE TABLE IF NOT EXISTS heatmap_scrolls_aggregated (
  id UUID PRIMARY KEY,
  page_url TEXT NOT NULL,
  date DATE NOT NULL,
  scroll_depth_bucket INT NOT NULL,
  event_count INT DEFAULT 1,
  avg_scroll_depth FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_url, date, scroll_depth_bucket)
);

-- Indexes for heatmap_scrolls_aggregated
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_agg_page_url ON heatmap_scrolls_aggregated(page_url);
CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_agg_date ON heatmap_scrolls_aggregated(date);
