const express = require("express");
const pool = require("../db");
const funnelService = require("../services/funnelAnalysisService");
const {
  listSessionRecordings,
  getSessionReplay,
  getDeadClicksForSession,
  deleteAllSessionRecordings,
  deleteSessionRecording,
} = require("../controllers/sessionRecordingController");
const {
  getClickHeatmap,
  getHoverHeatmap,
  getScrollHeatmap,
  getLatestPageSnapshot,
  getPageUrls,
  getHeatmapStats,
} = require("../controllers/heatmapController");

const router = express.Router();

async function tableExists(tableName) {
  const result = await pool.query(`SELECT to_regclass($1) AS table_ref`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_ref);
}

router.get("/session-recordings", listSessionRecordings);
router.get("/session-recordings/:sessionId/events", getSessionReplay);
router.get("/session-recordings/:sessionId/dead-clicks", getDeadClicksForSession);
router.delete("/session-recordings", deleteAllSessionRecordings);
router.delete("/session-recordings/:sessionId", deleteSessionRecording);

router.get("/overview", async (_req, res) => {
  try {
    const hasEvents = await tableExists("events");
    const hasFrontendErrors = await tableExists("frontend_errors");
    const hasSessionRecordings = await tableExists("session_recordings");

    const totalEvents = hasEvents
      ? Number((await pool.query(`SELECT COUNT(*)::int AS value FROM events`)).rows[0]?.value || 0)
      : 0;

    const totalUsers = hasEvents
      ? Number((await pool.query(`SELECT COUNT(DISTINCT user_id)::int AS value FROM events`)).rows[0]?.value || 0)
      : 0;

    const totalSessions = hasSessionRecordings
      ? Number((await pool.query(`SELECT COUNT(DISTINCT session_id)::int AS value FROM session_recordings`)).rows[0]?.value || 0)
      : 0;

    const totalErrors = hasFrontendErrors
      ? Number((await pool.query(`SELECT COUNT(*)::int AS value FROM frontend_errors`)).rows[0]?.value || 0)
      : 0;

    const recentActivity = hasEvents
      ? (
          await pool.query(`
            SELECT
              event_name,
              user_id,
              session_id,
              page,
              created_at
            FROM events
            ORDER BY created_at DESC
            LIMIT 20
          `)
        ).rows
      : [];

    return res.json({
      metrics: {
        total_events: totalEvents,
        total_users: totalUsers,
        sessions: totalSessions,
        errors: totalErrors,
      },
      recent_activity: recentActivity,
    });
  } catch (error) {
    console.error("Overview query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch overview analytics" });
  }
});

router.get("/heatmap/click", getClickHeatmap);
router.get("/heatmap/hover", getHoverHeatmap);
router.get("/heatmap/scroll", getScrollHeatmap);
router.get("/heatmap/snapshot", getLatestPageSnapshot);
router.get("/heatmap/pages", getPageUrls);
router.get("/heatmap/stats", getHeatmapStats);

router.get("/frontend-errors/summary", async (_req, res) => {
  try {
    const hasFrontendErrors = await tableExists("frontend_errors");
    if (!hasFrontendErrors) {
      return res.json({
        top_errors: [],
        frequency: [],
        replay_sessions: [],
        sessions_affected: 0,
        total_errors: 0,
      });
    }

    const [topErrorsResult, frequencyResult, sessionsResult, replaySessionsResult] = await Promise.all([
      pool.query(`
        SELECT
          message,
          COUNT(*)::int AS count,
          COUNT(DISTINCT session_id)::int AS sessions_affected
        FROM frontend_errors
        GROUP BY message
        ORDER BY count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT
          DATE(COALESCE(timestamp, created_at))::text AS date,
          COUNT(*)::int AS count
        FROM frontend_errors
        GROUP BY DATE(COALESCE(timestamp, created_at))
        ORDER BY DATE(COALESCE(timestamp, created_at)) DESC
        LIMIT 14
      `),
      pool.query(`
        SELECT
          COUNT(DISTINCT session_id)::int AS sessions_affected,
          COUNT(*)::int AS total_errors
        FROM frontend_errors
      `),
      pool.query(`
        SELECT
          session_id,
          user_id,
          COUNT(*)::int AS error_count,
          MAX(COALESCE(timestamp, created_at)) AS last_seen
        FROM frontend_errors
        WHERE session_id IS NOT NULL
        GROUP BY session_id, user_id
        ORDER BY error_count DESC, last_seen DESC
        LIMIT 20
      `),
    ]);

    return res.json({
      top_errors: topErrorsResult.rows,
      frequency: frequencyResult.rows,
      replay_sessions: replaySessionsResult.rows,
      sessions_affected: Number(sessionsResult.rows[0]?.sessions_affected || 0),
      total_errors: Number(sessionsResult.rows[0]?.total_errors || 0),
    });
  } catch (error) {
    console.error("Frontend error summary query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch frontend error summary" });
  }
});

router.get("/user-journeys", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json({ top_paths: [], transitions: [] });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 15), 5), 50);

    const transitionsResult = await pool.query(
      `
        WITH ordered_events AS (
          SELECT
            user_id,
            session_id,
            COALESCE(NULLIF(TRIM(page::text), ''), '(unknown)') AS page,
            created_at,
            LEAD(COALESCE(NULLIF(TRIM(page::text), ''), '(unknown)')) OVER (
              PARTITION BY user_id, session_id
              ORDER BY created_at ASC
            ) AS next_page
          FROM events
          WHERE user_id IS NOT NULL
        )
        SELECT
          page AS source,
          next_page AS target,
          COUNT(*)::int AS count
        FROM ordered_events
        WHERE next_page IS NOT NULL AND page <> next_page
        GROUP BY source, target
        ORDER BY count DESC
        LIMIT $1
      `,
      [limit]
    );

    const topPathsResult = await pool.query(
      `
        SELECT
          COALESCE(NULLIF(TRIM(page::text), ''), '(unknown)') AS page,
          COUNT(*)::int AS views,
          COUNT(DISTINCT user_id)::int AS users
        FROM events
        GROUP BY page
        ORDER BY views DESC
        LIMIT $1
      `,
      [limit]
    );

    return res.json({
      top_paths: topPathsResult.rows,
      transitions: transitionsResult.rows,
    });
  } catch (error) {
    console.error("User journeys query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch user journeys" });
  }
});

router.get("/events", async (req, res) => {
  try {
    const hasEvents = await tableExists("events");
    if (!hasEvents) {
      return res.json([]);
    }

    const allowedGroups = new Set(["event_name", "page", "user_id", "session_id"]);
    const requestedGroup = String(req.query.groupBy || "event_name").trim();
    const groupBy = allowedGroups.has(requestedGroup) ? requestedGroup : "event_name";

    const rawEvents = String(req.query.events || "").trim();
    const selectedEvents = rawEvents
      ? rawEvents
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const whereParts = [];
    const values = [];

    if (selectedEvents.length > 0) {
      values.push(selectedEvents);
      whereParts.push(`event_name = ANY($${values.length}::text[])`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const query = `
      SELECT
        COALESCE(NULLIF(TRIM(${groupBy}::text), ''), '(unknown)') AS label,
        COUNT(*)::int AS count
      FROM events
      ${whereSql}
      GROUP BY label
      ORDER BY count DESC, label ASC
      LIMIT 100
    `;

    const result = await pool.query(query, values);
    return res.json(result.rows);
  } catch (error) {
    console.error("Events query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch analytics events" });
  }
});

router.get("/funnels", async (_req, res) => {
  try {
    const rows = await funnelService.listSavedFunnels();
    return res.json(rows);
  } catch (error) {
    console.error("Funnels list query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch saved funnels" });
  }
});

router.post("/funnels/analyze", async (req, res) => {
  try {
    const metrics = await funnelService.analyzeFunnel(req.body || {});
    return res.json(metrics);
  } catch (error) {
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to analyze funnel" });
  }
});

router.post("/funnels", async (req, res) => {
  try {
    const funnel = await funnelService.createSavedFunnel(req.body || {});
    return res.status(201).json(funnel);
  } catch (error) {
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to save funnel" });
  }
});

router.put("/funnels/:id", async (req, res) => {
  try {
    const funnel = await funnelService.updateSavedFunnel(req.params.id, req.body || {});
    return res.json(funnel);
  } catch (error) {
    if (/not found/i.test(error.message || "")) {
      return res.status(404).json({ error: "Funnel not found" });
    }
    const code = /required|at least/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to update funnel" });
  }
});

router.delete("/funnels/:id", async (req, res) => {
  try {
    const result = await funnelService.deleteSavedFunnel(req.params.id);
    return res.json(result);
  } catch (error) {
    const code = /required/i.test(error.message || "") ? 400 : 500;
    return res.status(code).json({ error: error.message || "Failed to delete funnel" });
  }
});

module.exports = router;