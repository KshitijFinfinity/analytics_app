const sessionMonitoringService = require("../services/sessionMonitoringService");
const { getRequestIp, getLocationByIp } = require("../services/ipLocationService");

async function createSessionRecording(req, res) {
  try {
    const { user_id, session_id, events, timestamp, start_timestamp, end_timestamp, session_finished, end_reason } = req.body || {};

    if (!user_id || !session_id) {
      return res.status(400).json({ error: "user_id and session_id are required" });
    }

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "events must be an array" });
    }

    const ipAddress = getRequestIp(req);
    const location = await getLocationByIp(ipAddress);

    await sessionMonitoringService.recordSessionBatch({
      user_id,
      session_id,
      events,
      timestamp,
      start_timestamp,
      end_timestamp,
      session_finished,
      end_reason,
      ip_address: ipAddress || null,
      country: location.country,
      city: location.city,
      region: location.region,
      timezone: location.timezone,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Session record error:", error.message);
    return res.status(500).json({ error: "Failed to store session recording" });
  }
}

async function createFrontendError(req, res) {
  try {
    const {
      user_id,
      session_id,
      message,
      stack,
      page,
      page_url,
      page_path,
      source,
      line,
      column,
      error_type,
      user_agent,
      timestamp,
    } = req.body || {};

    if (!user_id || !session_id || !message) {
      return res.status(400).json({ error: "user_id, session_id and message are required" });
    }

    await sessionMonitoringService.recordFrontendError({
      user_id,
      session_id,
      message,
      stack,
      page,
      page_url,
      page_path,
      source_file: source,
      line_number: line,
      column_number: column,
      error_type,
      user_agent,
      timestamp,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Frontend error ingest failed:", error.message);
    return res.status(500).json({ error: "Failed to store frontend error" });
  }
}

async function createDeadClick(req, res) {
  try {
    const { session_id, user_id, page, element, x, y, timestamp } = req.body || {};

    if (!session_id || !user_id) {
      return res.status(400).json({ error: "session_id and user_id are required" });
    }

    await sessionMonitoringService.recordDeadClick({ session_id, user_id, page, element, x, y, timestamp });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Dead click ingest failed:", error.message);
    return res.status(500).json({ error: "Failed to store dead click" });
  }
}

async function getDeadClicksForSession(req, res) {
  try {
    const sessionId = String(req.params.sessionId || "").trim();
    const userId = String(req.query.user_id || "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const clicks = await sessionMonitoringService.getDeadClicks(sessionId, userId || undefined);
    return res.json(clicks);
  } catch (error) {
    console.error("Dead clicks fetch error:", error.message);
    return res.status(500).json({ error: "Failed to fetch dead clicks" });
  }
}

async function listSessionRecordings(req, res) {
  try {
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    const includeMetadataOnly = String(req.query.includeMetadataOnly || "false").toLowerCase() === "true";

    const sessions = await sessionMonitoringService.listSessions(limit);
    const rows = sessions
      .filter((item) => {
        if (includeMetadataOnly) return true;
        const eventCount = Number(item?.event_count || 0);
        const errorCount = Number(item?.error_count || 0);
        // Hide heartbeat/metadata-only sessions from default replay listing.
        return eventCount > 0 || errorCount > 0;
      })
      .map((item) => {
      const replayStart = item.replay_start_timestamp ? new Date(item.replay_start_timestamp).getTime() : null;
      const replayEnd = item.replay_end_timestamp ? new Date(item.replay_end_timestamp).getTime() : null;
      const wallStart = item.start_timestamp ? new Date(item.start_timestamp).getTime() : null;
      const wallEnd = item.end_timestamp ? new Date(item.end_timestamp).getTime() : null;

      const replayDurationMs = replayStart && replayEnd && replayEnd >= replayStart ? replayEnd - replayStart : 0;
      const wallDurationMs = wallStart && wallEnd && wallEnd >= wallStart ? wallEnd - wallStart : 0;
      const durationMs = replayDurationMs > 0 ? replayDurationMs : wallDurationMs;

      return {
        ...item,
        replay_duration_ms: replayDurationMs,
        wall_duration_ms: wallDurationMs,
        duration_ms: durationMs,
      };
    });

    return res.json(rows);
  } catch (error) {
    console.error("Session recordings fetch error:", error.message);
    return res.status(500).json({ error: "Failed to fetch session recordings" });
  }
}

async function getSessionReplay(req, res) {
  try {
    const sessionId = String(req.params.sessionId || "").trim();
    const userId = String(req.query.user_id || "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const replay = await sessionMonitoringService.getSessionReplay(sessionId, userId || undefined);
    return res.json({
      session_id: sessionId,
      user_id: userId || null,
      events: replay.events,
      errors: replay.errors,
    });
  } catch (error) {
    console.error("Session replay fetch error:", error.message);
    return res.status(500).json({ error: "Failed to fetch session replay" });
  }
}

async function deleteAllSessionRecordings(req, res) {
  try {
    const result = await sessionMonitoringService.deleteAllReplays();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Session recordings delete error:", error.message);
    return res.status(500).json({ error: "Failed to delete session recordings" });
  }
}

async function deleteSessionRecording(req, res) {
  try {
    const sessionId = String(req.params.sessionId || "").trim();
    const userId = String(req.query.user_id || "").trim();

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const result = await sessionMonitoringService.deleteReplay(sessionId, userId || undefined);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Session recording delete error:", error.message);
    return res.status(500).json({ error: "Failed to delete session recording" });
  }
}

module.exports = {
  createSessionRecording,
  createFrontendError,
  createDeadClick,
  getDeadClicksForSession,
  listSessionRecordings,
  getSessionReplay,
  deleteAllSessionRecordings,
  deleteSessionRecording,
};
