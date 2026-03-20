const heatmapService = require("../services/heatmapService");

async function recordClickEvent(req, res) {
  try {
    const { events, ...singleEvent } = req.body;
    const clickEvents = events || [singleEvent];

    if (!Array.isArray(clickEvents) || clickEvents.length === 0) {
      return res.status(400).json({ error: "No click events to record" });
    }

    const results = [];

    for (const clickEvent of clickEvents) {
      const {
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
      } = clickEvent;

      if (!user_id || !session_id || !page_url || x_coordinate === undefined || y_coordinate === undefined) {
        continue;
      }

      try {
        const result = await heatmapService.recordClick({
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
        });
        results.push(result);
      } catch (error) {
        console.error("Error recording individual click:", error.message);
      }
    }

    if (results.length === 0) {
      return res.status(400).json({ error: "Failed to record any click events" });
    }

    return res.status(200).json({ success: true, recorded: results.length });
  } catch (error) {
    console.error("Record click event error:", error.message);
    return res.status(500).json({ error: "Failed to record click event" });
  }
}

async function recordHoverEvent(req, res) {
  try {
    const { events, ...singleEvent } = req.body;
    const hoverEvents = events || [singleEvent];

    if (!Array.isArray(hoverEvents) || hoverEvents.length === 0) {
      return res.status(400).json({ error: "No hover events to record" });
    }

    const results = [];

    for (const hoverEvent of hoverEvents) {
      const {
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
      } = hoverEvent;

      if (!user_id || !session_id || !page_url || x_coordinate === undefined || y_coordinate === undefined) {
        continue;
      }

      try {
        const result = await heatmapService.recordHover({
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
        });
        results.push(result);
      } catch (error) {
        console.error("Error recording individual hover:", error.message);
      }
    }

    if (results.length === 0) {
      return res.status(400).json({ error: "Failed to record any hover events" });
    }

    return res.status(200).json({ success: true, recorded: results.length });
  } catch (error) {
    console.error("Record hover event error:", error.message);
    return res.status(500).json({ error: "Failed to record hover event" });
  }
}

async function recordScrollEvent(req, res) {
  try {
    const {
      user_id,
      session_id,
      page_url,
      scroll_depth_percentage,
      viewport_height,
      document_height,
    } = req.body;

    if (!user_id || !session_id || !page_url || scroll_depth_percentage === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await heatmapService.recordScroll({
      user_id,
      session_id,
      page_url,
      scroll_depth_percentage,
      viewport_height,
      document_height,
    });

    return res.status(200).json({ success: true, id: result.id });
  } catch (error) {
    console.error("Record scroll event error:", error.message);
    return res.status(500).json({ error: "Failed to record scroll event" });
  }
}

async function recordPageSnapshotEvent(req, res) {
  try {
    const {
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
    } = req.body;

    if (!user_id || !session_id || !page_url || !dom_snapshot) {
      return res.status(400).json({ error: "Missing required snapshot fields" });
    }

    const result = await heatmapService.recordPageSnapshot({
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
    });

    return res.status(200).json({ success: true, id: result.id });
  } catch (error) {
    console.error("Record page snapshot error:", error.message);
    return res.status(500).json({ error: "Failed to record page snapshot" });
  }
}

async function getClickHeatmap(req, res) {
  try {
    const { page_url, start_date, end_date, date, device_type, bucket_size } = req.query;

    if (!page_url) {
      return res.status(400).json({ error: "Missing page_url parameter" });
    }

    const startDate = date
      ? `${date}T00:00:00Z`
      : start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = date ? `${date}T23:59:59Z` : end_date || new Date().toISOString();

    const heatmapData = await heatmapService.getClickHeatmap({
      page_url,
      start_date: startDate,
      end_date: endDate,
      device_type: device_type || null,
      bucket_size: bucket_size || undefined,
    });

    return res.status(200).json({ success: true, data: heatmapData || [] });
  } catch (error) {
    console.error("Get click heatmap error:", error.message);
    return res.status(200).json({ success: true, data: [] });
  }
}

async function getHoverHeatmap(req, res) {
  try {
    const { page_url, start_date, end_date, date, device_type, bucket_size } = req.query;

    if (!page_url) {
      return res.status(400).json({ error: "Missing page_url parameter" });
    }

    const startDate = date
      ? `${date}T00:00:00Z`
      : start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = date ? `${date}T23:59:59Z` : end_date || new Date().toISOString();

    const heatmapData = await heatmapService.getHoverHeatmap({
      page_url,
      start_date: startDate,
      end_date: endDate,
      device_type: device_type || null,
      bucket_size: bucket_size || undefined,
    });

    return res.status(200).json({ success: true, data: heatmapData || [] });
  } catch (error) {
    console.error("Get hover heatmap error:", error.message);
    return res.status(200).json({ success: true, data: [] });
  }
}

async function getScrollHeatmap(req, res) {
  try {
    const { page_url, start_date, end_date, date } = req.query;

    if (!page_url) {
      return res.status(400).json({ error: "Missing page_url parameter" });
    }

    let heatmapData;

    if (date) {
      heatmapData = await heatmapService.getScrollHeatmapAggregated({
        page_url,
        date,
      });
    } else {
      const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = end_date || new Date().toISOString();

      heatmapData = await heatmapService.getScrollHeatmap({
        page_url,
        start_date: startDate,
        end_date: endDate,
      });
    }

    return res.status(200).json({ success: true, data: heatmapData || [] });
  } catch (error) {
    console.error("Get scroll heatmap error:", error.message);
    return res.status(200).json({ success: true, data: [] });
  }
}

async function getLatestPageSnapshot(req, res) {
  try {
    const { page_url, start_date, end_date, date, device_type } = req.query;

    if (!page_url) {
      return res.status(400).json({ error: "Missing page_url parameter" });
    }

    const startDate = date
      ? `${date}T00:00:00Z`
      : start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = date ? `${date}T23:59:59Z` : end_date || new Date().toISOString();

    const snapshot = await heatmapService.getLatestPageSnapshot({
      page_url,
      start_date: startDate,
      end_date: endDate,
      device_type: device_type || null,
    });

    return res.status(200).json({ success: true, data: snapshot });
  } catch (error) {
    console.error("Get page snapshot error:", error.message);
    return res.status(200).json({ success: true, data: null });
  }
}

async function getPageUrls(req, res) {
  try {
    const startDate = req.query.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.end_date || new Date().toISOString();

    const pages = await heatmapService.getPageUrls({
      start_date: startDate,
      end_date: endDate,
    });

    return res.status(200).json({ success: true, data: pages || [] });
  } catch (error) {
    console.error("Get page URLs error:", error.message);
    return res.status(200).json({ success: true, data: [] });
  }
}

async function getHeatmapStats(req, res) {
  try {
    const { page_url, start_date, end_date } = req.query;

    if (!page_url) {
      return res.status(400).json({ error: "Missing page_url parameter" });
    }

    const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();

    const stats = await heatmapService.getHeatmapStats({
      page_url,
      start_date: startDate,
      end_date: endDate,
    });

    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    console.error("Get heatmap stats error:", error.message);
    return res.status(200).json({
      success: true,
      data: {
        total_clicks: 0,
        total_scrolls: 0,
        total_hovers: 0,
        total_snapshots: 0,
        unique_users_clicks: 0,
        unique_users_scrolls: 0,
        unique_users_hovers: 0,
      },
    });
  }
}

module.exports = {
  recordClickEvent,
  recordHoverEvent,
  recordScrollEvent,
  recordPageSnapshotEvent,
  getClickHeatmap,
  getHoverHeatmap,
  getScrollHeatmap,
  getLatestPageSnapshot,
  getPageUrls,
  getHeatmapStats,
};