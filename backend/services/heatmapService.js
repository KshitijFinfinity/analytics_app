const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

const HEATMAP_BUCKET_SIZE_PX = 10;
const SCROLL_DEPTH_BUCKET_SIZE = 5;
const DEFAULT_PERCENT_BUCKET = 0.01;

let tablesInitialized = false;

function toPositiveNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function toNonNegativeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
}

function clampNormalized(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.min(0.9999, numericValue));
}

function derivePercent(explicitPercent, absoluteValue, dimension) {
  const safeExplicitPercent = clampNormalized(explicitPercent);
  if (safeExplicitPercent !== null) {
    return safeExplicitPercent;
  }

  if (absoluteValue === null || dimension === null || dimension <= 0) {
    return null;
  }

  return clampNormalized(absoluteValue / dimension);
}

async function ensureHeatmapTables() {
  if (tablesInitialized) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_clicks (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        x_coordinate FLOAT NOT NULL,
        y_coordinate FLOAT NOT NULL,
        x_percent FLOAT,
        y_percent FLOAT,
        page_x FLOAT,
        page_y FLOAT,
        page_x_percent FLOAT,
        page_y_percent FLOAT,
        viewport_width INT,
        viewport_height INT,
        document_width INT,
        document_height INT,
        scroll_x FLOAT,
        scroll_y FLOAT,
        device_type TEXT,
        element_selector TEXT,
        element_text TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS x_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS y_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS page_x FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS page_y FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS page_x_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS page_y_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS viewport_width INT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS viewport_height INT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS document_width INT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS document_height INT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS scroll_x FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS scroll_y FLOAT`);
    await pool.query(`ALTER TABLE heatmap_clicks ADD COLUMN IF NOT EXISTS device_type TEXT`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_page_url ON heatmap_clicks(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_session_id ON heatmap_clicks(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_user_id ON heatmap_clicks(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_created_at ON heatmap_clicks(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_device_type ON heatmap_clicks(device_type)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_hovers (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        x_coordinate FLOAT NOT NULL,
        y_coordinate FLOAT NOT NULL,
        x_percent FLOAT,
        y_percent FLOAT,
        page_x FLOAT,
        page_y FLOAT,
        page_x_percent FLOAT,
        page_y_percent FLOAT,
        viewport_width INT,
        viewport_height INT,
        document_width INT,
        document_height INT,
        scroll_x FLOAT,
        scroll_y FLOAT,
        device_type TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS x_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS y_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS page_x FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS page_y FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS page_x_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS page_y_percent FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS viewport_width INT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS viewport_height INT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS document_width INT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS document_height INT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS scroll_x FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS scroll_y FLOAT`);
    await pool.query(`ALTER TABLE heatmap_hovers ADD COLUMN IF NOT EXISTS device_type TEXT`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_hovers_page_url ON heatmap_hovers(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_hovers_session_id ON heatmap_hovers(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_hovers_user_id ON heatmap_hovers(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_hovers_created_at ON heatmap_hovers(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_hovers_device_type ON heatmap_hovers(device_type)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_scrolls (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        scroll_depth_percentage FLOAT NOT NULL,
        viewport_height INT,
        document_height INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_page_url ON heatmap_scrolls(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_session_id ON heatmap_scrolls(session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_user_id ON heatmap_scrolls(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_created_at ON heatmap_scrolls(created_at)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_page_snapshots (
        id UUID PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        page_url TEXT NOT NULL,
        dom_snapshot TEXT NOT NULL,
        viewport_width INT,
        viewport_height INT,
        document_width INT,
        document_height INT,
        scroll_x FLOAT,
        scroll_y FLOAT,
        device_type TEXT,
        captured_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS viewport_width INT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS viewport_height INT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS document_width INT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS document_height INT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS scroll_x FLOAT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS scroll_y FLOAT`);
    await pool.query(`ALTER TABLE heatmap_page_snapshots ADD COLUMN IF NOT EXISTS device_type TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_snapshots_page_url ON heatmap_page_snapshots(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_snapshots_device_type ON heatmap_page_snapshots(device_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_snapshots_captured_at ON heatmap_page_snapshots(captured_at)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_clicks_aggregated (
        id UUID PRIMARY KEY,
        page_url TEXT NOT NULL,
        date DATE NOT NULL,
        x_bucket INT NOT NULL,
        y_bucket INT NOT NULL,
        click_count INT DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(page_url, date, x_bucket, y_bucket)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_agg_page_url ON heatmap_clicks_aggregated(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_clicks_agg_date ON heatmap_clicks_aggregated(date)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS heatmap_scrolls_aggregated (
        id UUID PRIMARY KEY,
        page_url TEXT NOT NULL,
        date DATE NOT NULL,
        scroll_depth_bucket INT NOT NULL,
        event_count INT DEFAULT 1,
        avg_scroll_depth FLOAT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(page_url, date, scroll_depth_bucket)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_agg_page_url ON heatmap_scrolls_aggregated(page_url)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_heatmap_scrolls_agg_date ON heatmap_scrolls_aggregated(date)`);

    tablesInitialized = true;
    console.log("Heatmap tables initialized successfully");
  } catch (error) {
    console.error("Error creating heatmap tables:", error.message);
    throw error;
  }
}

async function recordClick({
  user_id,
  session_id,
  page_url,
  x_coordinate,
  y_coordinate,
  page_x,
  page_y,
  x_percent,
  y_percent,
  page_x_percent,
  page_y_percent,
  viewport_width,
  viewport_height,
  document_width,
  document_height,
  scroll_x,
  scroll_y,
  device_type,
  element_selector,
  element_text,
}) {
  await ensureHeatmapTables();

  const safeViewportWidth = toPositiveNumber(viewport_width);
  const safeViewportHeight = toPositiveNumber(viewport_height);
  const safeDocumentWidth = toPositiveNumber(document_width);
  const safeDocumentHeight = toPositiveNumber(document_height);
  const safeScrollX = toNonNegativeNumber(scroll_x) ?? 0;
  const safeScrollY = toNonNegativeNumber(scroll_y) ?? 0;
  const safeXCoordinate = toNonNegativeNumber(x_coordinate) ?? 0;
  const safeYCoordinate = toNonNegativeNumber(y_coordinate) ?? 0;
  const safePageX = toNonNegativeNumber(page_x) ?? safeXCoordinate + safeScrollX;
  const safePageY = toNonNegativeNumber(page_y) ?? safeYCoordinate + safeScrollY;
  const viewportXPercent = derivePercent(x_percent, safeXCoordinate, safeViewportWidth);
  const viewportYPercent = derivePercent(y_percent, safeYCoordinate, safeViewportHeight);
  const documentXPercent = derivePercent(page_x_percent, safePageX, safeDocumentWidth);
  const documentYPercent = derivePercent(page_y_percent, safePageY, safeDocumentHeight);

  const id = uuidv4();
  const query = `
    INSERT INTO heatmap_clicks (
      id,
      user_id,
      session_id,
      page_url,
      x_coordinate,
      y_coordinate,
      x_percent,
      y_percent,
      page_x,
      page_y,
      page_x_percent,
      page_y_percent,
      viewport_width,
      viewport_height,
      document_width,
      document_height,
      scroll_x,
      scroll_y,
      device_type,
      element_selector,
      element_text
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    )
  `;

  const values = [
    id,
    user_id,
    session_id,
    page_url,
    safeXCoordinate,
    safeYCoordinate,
    viewportXPercent,
    viewportYPercent,
    safePageX,
    safePageY,
    documentXPercent,
    documentYPercent,
    safeViewportWidth,
    safeViewportHeight,
    safeDocumentWidth,
    safeDocumentHeight,
    safeScrollX,
    safeScrollY,
    device_type || null,
    element_selector || null,
    element_text || null,
  ];

  try {
    await pool.query(query, values);
    await aggregateClick(page_url, safePageX, safePageY);
    return { id, success: true };
  } catch (error) {
    console.error("Error recording click:", error.message);
    throw error;
  }
}

async function recordHover({
  user_id,
  session_id,
  page_url,
  x_coordinate,
  y_coordinate,
  page_x,
  page_y,
  x_percent,
  y_percent,
  page_x_percent,
  page_y_percent,
  viewport_width,
  viewport_height,
  document_width,
  document_height,
  scroll_x,
  scroll_y,
  device_type,
}) {
  await ensureHeatmapTables();

  const safeViewportWidth = toPositiveNumber(viewport_width);
  const safeViewportHeight = toPositiveNumber(viewport_height);
  const safeDocumentWidth = toPositiveNumber(document_width);
  const safeDocumentHeight = toPositiveNumber(document_height);
  const safeScrollX = toNonNegativeNumber(scroll_x) ?? 0;
  const safeScrollY = toNonNegativeNumber(scroll_y) ?? 0;
  const safeXCoordinate = toNonNegativeNumber(x_coordinate) ?? 0;
  const safeYCoordinate = toNonNegativeNumber(y_coordinate) ?? 0;
  const safePageX = toNonNegativeNumber(page_x) ?? safeXCoordinate + safeScrollX;
  const safePageY = toNonNegativeNumber(page_y) ?? safeYCoordinate + safeScrollY;
  const viewportXPercent = derivePercent(x_percent, safeXCoordinate, safeViewportWidth);
  const viewportYPercent = derivePercent(y_percent, safeYCoordinate, safeViewportHeight);
  const documentXPercent = derivePercent(page_x_percent, safePageX, safeDocumentWidth);
  const documentYPercent = derivePercent(page_y_percent, safePageY, safeDocumentHeight);

  const id = uuidv4();
  const query = `
    INSERT INTO heatmap_hovers (
      id,
      user_id,
      session_id,
      page_url,
      x_coordinate,
      y_coordinate,
      x_percent,
      y_percent,
      page_x,
      page_y,
      page_x_percent,
      page_y_percent,
      viewport_width,
      viewport_height,
      document_width,
      document_height,
      scroll_x,
      scroll_y,
      device_type
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
  `;

  const values = [
    id,
    user_id,
    session_id,
    page_url,
    safeXCoordinate,
    safeYCoordinate,
    viewportXPercent,
    viewportYPercent,
    safePageX,
    safePageY,
    documentXPercent,
    documentYPercent,
    safeViewportWidth,
    safeViewportHeight,
    safeDocumentWidth,
    safeDocumentHeight,
    safeScrollX,
    safeScrollY,
    device_type || null,
  ];

  try {
    await pool.query(query, values);
    return { id, success: true };
  } catch (error) {
    console.error("Error recording hover:", error.message);
    throw error;
  }
}

async function recordScroll({
  user_id,
  session_id,
  page_url,
  scroll_depth_percentage,
  viewport_height,
  document_height,
}) {
  await ensureHeatmapTables();

  const id = uuidv4();
  const query = `
    INSERT INTO heatmap_scrolls (
      id,
      user_id,
      session_id,
      page_url,
      scroll_depth_percentage,
      viewport_height,
      document_height
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;

  const values = [
    id,
    user_id,
    session_id,
    page_url,
    scroll_depth_percentage,
    viewport_height,
    document_height,
  ];

  try {
    await pool.query(query, values);
    await aggregateScroll(page_url, scroll_depth_percentage);
    return { id, success: true };
  } catch (error) {
    console.error("Error recording scroll:", error.message);
    throw error;
  }
}

async function recordPageSnapshot({
  user_id,
  session_id,
  page_url,
  dom_snapshot,
  viewport_width,
  viewport_height,
  document_width,
  document_height,
  scroll_x,
  scroll_y,
  device_type,
}) {
  await ensureHeatmapTables();

  const id = uuidv4();
  const query = `
    INSERT INTO heatmap_page_snapshots (
      id,
      user_id,
      session_id,
      page_url,
      dom_snapshot,
      viewport_width,
      viewport_height,
      document_width,
      document_height,
      scroll_x,
      scroll_y,
      device_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;

  const values = [
    id,
    user_id,
    session_id,
    page_url,
    dom_snapshot,
    toPositiveNumber(viewport_width),
    toPositiveNumber(viewport_height),
    toPositiveNumber(document_width),
    toPositiveNumber(document_height),
    toNonNegativeNumber(scroll_x) ?? 0,
    toNonNegativeNumber(scroll_y) ?? 0,
    device_type || null,
  ];

  try {
    await pool.query(query, values);
    return { id, success: true };
  } catch (error) {
    console.error("Error recording page snapshot:", error.message);
    throw error;
  }
}

function getBucket(value, bucketSize) {
  return Math.floor(value / bucketSize) * bucketSize;
}

async function aggregateClick(page_url, x_coordinate, y_coordinate) {
  const x_bucket = getBucket(x_coordinate, HEATMAP_BUCKET_SIZE_PX);
  const y_bucket = getBucket(y_coordinate, HEATMAP_BUCKET_SIZE_PX);
  const date = new Date().toISOString().split("T")[0];

  const query = `
    INSERT INTO heatmap_clicks_aggregated (id, page_url, date, x_bucket, y_bucket, click_count)
    VALUES ($1, $2, $3, $4, $5, 1)
    ON CONFLICT (page_url, date, x_bucket, y_bucket)
    DO UPDATE SET click_count = heatmap_clicks_aggregated.click_count + 1
  `;

  const values = [uuidv4(), page_url, date, x_bucket, y_bucket];

  try {
    await pool.query(query, values);
  } catch (error) {
    console.error("Error aggregating click:", error.message);
  }
}

async function aggregateScroll(page_url, scroll_depth_percentage) {
  const scroll_depth_bucket = getBucket(scroll_depth_percentage, SCROLL_DEPTH_BUCKET_SIZE);
  const date = new Date().toISOString().split("T")[0];

  const query = `
    INSERT INTO heatmap_scrolls_aggregated (id, page_url, date, scroll_depth_bucket, event_count, avg_scroll_depth)
    VALUES ($1, $2, $3, $4, 1, $5)
    ON CONFLICT (page_url, date, scroll_depth_bucket)
    DO UPDATE SET
      event_count = heatmap_scrolls_aggregated.event_count + 1,
      avg_scroll_depth = (heatmap_scrolls_aggregated.avg_scroll_depth * heatmap_scrolls_aggregated.event_count + $5) / (heatmap_scrolls_aggregated.event_count + 1)
  `;

  const values = [uuidv4(), page_url, date, scroll_depth_bucket, scroll_depth_percentage];

  try {
    await pool.query(query, values);
  } catch (error) {
    console.error("Error aggregating scroll:", error.message);
  }
}

async function getClickHeatmap({
  page_url,
  start_date,
  end_date,
  device_type = null,
  bucket_size = DEFAULT_PERCENT_BUCKET,
  limit = 5000,
}) {
  await ensureHeatmapTables();

  const safeBucketSize = Number(bucket_size) > 0 ? Number(bucket_size) : DEFAULT_PERCENT_BUCKET;

  const query = `
    SELECT
      FLOOR(
        COALESCE(
          page_x_percent,
          CASE WHEN document_width > 0 THEN page_x / document_width ELSE NULL END,
          x_percent,
          CASE WHEN viewport_width > 0 THEN x_coordinate / viewport_width ELSE NULL END
        ) / $4
      ) * $4 AS x_percent,
      FLOOR(
        COALESCE(
          page_y_percent,
          CASE WHEN document_height > 0 THEN page_y / document_height ELSE NULL END,
          y_percent,
          CASE WHEN viewport_height > 0 THEN y_coordinate / viewport_height ELSE NULL END
        ) / $4
      ) * $4 AS y_percent,
      COUNT(*)::int AS click_count,
      ROUND(AVG(COALESCE(document_width, viewport_width))::numeric, 0)::int AS document_width,
      ROUND(AVG(COALESCE(document_height, viewport_height))::numeric, 0)::int AS document_height
    FROM heatmap_clicks
    WHERE page_url = $1
      AND created_at >= $2
      AND created_at <= $3
      AND ($5::text IS NULL OR device_type = $5)
      AND COALESCE(
        page_x_percent,
        CASE WHEN document_width > 0 THEN page_x / document_width ELSE NULL END,
        x_percent,
        CASE WHEN viewport_width > 0 THEN x_coordinate / viewport_width ELSE NULL END
      ) IS NOT NULL
      AND COALESCE(
        page_y_percent,
        CASE WHEN document_height > 0 THEN page_y / document_height ELSE NULL END,
        y_percent,
        CASE WHEN viewport_height > 0 THEN y_coordinate / viewport_height ELSE NULL END
      ) IS NOT NULL
    GROUP BY 1, 2
    ORDER BY click_count DESC
    LIMIT $6
  `;

  const values = [page_url, start_date, end_date, safeBucketSize, device_type, limit];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error fetching click heatmap:", error.message);
    throw error;
  }
}

async function getHoverHeatmap({
  page_url,
  start_date,
  end_date,
  device_type = null,
  bucket_size = 0.05,
  limit = 2500,
}) {
  await ensureHeatmapTables();

  const safeBucketSize = Number(bucket_size) > 0 ? Number(bucket_size) : 0.05;

  const query = `
    SELECT
      FLOOR(
        COALESCE(
          page_x_percent,
          CASE WHEN document_width > 0 THEN page_x / document_width ELSE NULL END,
          x_percent,
          CASE WHEN viewport_width > 0 THEN x_coordinate / viewport_width ELSE NULL END
        ) / $4
      ) * $4 AS x_percent,
      FLOOR(
        COALESCE(
          page_y_percent,
          CASE WHEN document_height > 0 THEN page_y / document_height ELSE NULL END,
          y_percent,
          CASE WHEN viewport_height > 0 THEN y_coordinate / viewport_height ELSE NULL END
        ) / $4
      ) * $4 AS y_percent,
      COUNT(*)::int AS hover_count,
      ROUND(AVG(COALESCE(document_width, viewport_width))::numeric, 0)::int AS document_width,
      ROUND(AVG(COALESCE(document_height, viewport_height))::numeric, 0)::int AS document_height
    FROM heatmap_hovers
    WHERE page_url = $1
      AND created_at >= $2
      AND created_at <= $3
      AND ($5::text IS NULL OR device_type = $5)
      AND COALESCE(
        page_x_percent,
        CASE WHEN document_width > 0 THEN page_x / document_width ELSE NULL END,
        x_percent,
        CASE WHEN viewport_width > 0 THEN x_coordinate / viewport_width ELSE NULL END
      ) IS NOT NULL
      AND COALESCE(
        page_y_percent,
        CASE WHEN document_height > 0 THEN page_y / document_height ELSE NULL END,
        y_percent,
        CASE WHEN viewport_height > 0 THEN y_coordinate / viewport_height ELSE NULL END
      ) IS NOT NULL
    GROUP BY 1, 2
    ORDER BY hover_count DESC
    LIMIT $6
  `;

  const values = [page_url, start_date, end_date, safeBucketSize, device_type, limit];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error fetching hover heatmap:", error.message);
    throw error;
  }
}

async function getClickHeatmapAggregated({ page_url, date }) {
  await ensureHeatmapTables();

  const query = `
    SELECT
      x_bucket,
      y_bucket,
      click_count
    FROM heatmap_clicks_aggregated
    WHERE page_url = $1
      AND date = $2
    ORDER BY click_count DESC
  `;

  const values = [page_url, date];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error fetching aggregated click heatmap:", error.message);
    throw error;
  }
}

async function getScrollHeatmap({ page_url, start_date, end_date }) {
  await ensureHeatmapTables();

  const query = `
    SELECT
      scroll_depth_percentage,
      COUNT(*) as event_count,
      AVG(scroll_depth_percentage) as avg_scroll_depth
    FROM heatmap_scrolls
    WHERE page_url = $1
      AND created_at >= $2
      AND created_at <= $3
    GROUP BY scroll_depth_percentage
    ORDER BY scroll_depth_percentage
  `;

  const values = [page_url, start_date, end_date];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error fetching scroll heatmap:", error.message);
    throw error;
  }
}

async function getScrollHeatmapAggregated({ page_url, date }) {
  await ensureHeatmapTables();

  const query = `
    SELECT
      scroll_depth_bucket,
      event_count,
      avg_scroll_depth
    FROM heatmap_scrolls_aggregated
    WHERE page_url = $1
      AND date = $2
    ORDER BY scroll_depth_bucket
  `;

  const values = [page_url, date];

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error("Error fetching aggregated scroll heatmap:", error.message);
    throw error;
  }
}

async function getLatestPageSnapshot({ page_url, start_date, end_date, device_type = null }) {
  await ensureHeatmapTables();

  const query = `
    SELECT
      id,
      page_url,
      dom_snapshot,
      viewport_width,
      viewport_height,
      document_width,
      document_height,
      scroll_x,
      scroll_y,
      device_type,
      captured_at
    FROM heatmap_page_snapshots
    WHERE page_url = $1
      AND captured_at >= $2
      AND captured_at <= $3
      AND ($4::text IS NULL OR device_type = $4)
    ORDER BY captured_at DESC
    LIMIT 1
  `;

  const values = [page_url, start_date, end_date, device_type];

  try {
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error fetching latest page snapshot:", error.message);
    throw error;
  }
}

async function getPageUrls({ start_date, end_date }) {
  await ensureHeatmapTables();

  const query = `
    SELECT DISTINCT page_url
    FROM heatmap_clicks
    WHERE created_at >= $1 AND created_at <= $2
    UNION
    SELECT DISTINCT page_url
    FROM heatmap_scrolls
    WHERE created_at >= $1 AND created_at <= $2
    UNION
    SELECT DISTINCT page_url
    FROM heatmap_hovers
    WHERE created_at >= $1 AND created_at <= $2
    UNION
    SELECT DISTINCT page_url
    FROM heatmap_page_snapshots
    WHERE captured_at >= $1 AND captured_at <= $2
    ORDER BY page_url
  `;

  const values = [start_date, end_date];

  try {
    const result = await pool.query(query, values);
    return result.rows.map((row) => row.page_url);
  } catch (error) {
    console.error("Error fetching page URLs:", error.message);
    throw error;
  }
}

async function getHeatmapStats({ page_url, start_date, end_date }) {
  await ensureHeatmapTables();

  const clickQuery = `SELECT COUNT(*) as total FROM heatmap_clicks WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;
  const scrollQuery = `SELECT COUNT(*) as total FROM heatmap_scrolls WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;
  const hoverQuery = `SELECT COUNT(*) as total FROM heatmap_hovers WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;
  const snapshotQuery = `SELECT COUNT(*) as total FROM heatmap_page_snapshots WHERE page_url = $1 AND captured_at >= $2 AND captured_at <= $3`;
  const uniqueUsersClickQuery = `SELECT COUNT(DISTINCT user_id) as total FROM heatmap_clicks WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;
  const uniqueUsersScrollQuery = `SELECT COUNT(DISTINCT user_id) as total FROM heatmap_scrolls WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;
  const uniqueUsersHoverQuery = `SELECT COUNT(DISTINCT user_id) as total FROM heatmap_hovers WHERE page_url = $1 AND created_at >= $2 AND created_at <= $3`;

  const values = [page_url, start_date, end_date];

  try {
    const [
      clickCount,
      scrollCount,
      hoverCount,
      snapshotCount,
      uniqueClickUsers,
      uniqueScrollUsers,
      uniqueHoverUsers,
    ] = await Promise.all([
      pool.query(clickQuery, values),
      pool.query(scrollQuery, values),
      pool.query(hoverQuery, values),
      pool.query(snapshotQuery, values),
      pool.query(uniqueUsersClickQuery, values),
      pool.query(uniqueUsersScrollQuery, values),
      pool.query(uniqueUsersHoverQuery, values),
    ]);

    return {
      total_clicks: clickCount.rows[0]?.total || 0,
      total_scrolls: scrollCount.rows[0]?.total || 0,
      total_hovers: hoverCount.rows[0]?.total || 0,
      total_snapshots: snapshotCount.rows[0]?.total || 0,
      unique_users_clicks: uniqueClickUsers.rows[0]?.total || 0,
      unique_users_scrolls: uniqueScrollUsers.rows[0]?.total || 0,
      unique_users_hovers: uniqueHoverUsers.rows[0]?.total || 0,
    };
  } catch (error) {
    console.error("Error fetching heatmap stats:", error.message);
    throw error;
  }
}

module.exports = {
  recordClick,
  recordHover,
  recordScroll,
  recordPageSnapshot,
  getClickHeatmap,
  getHoverHeatmap,
  getClickHeatmapAggregated,
  getScrollHeatmap,
  getScrollHeatmapAggregated,
  getLatestPageSnapshot,
  getPageUrls,
  getHeatmapStats,
};