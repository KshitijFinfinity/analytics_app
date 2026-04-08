(function () {
  "use strict";

  try {
    var USER_ID_KEY = "analytics_user_id";
    var SESSION_ID_KEY = "analytics_session_id";
    var RRWEB_CDN_URLS = [
      "https://cdn.jsdelivr.net/npm/rrweb@1/dist/record/rrweb-record.min.js",
      "https://unpkg.com/rrweb@1/dist/record/rrweb-record.min.js",
    ];
    var BATCH_SIZE = 10;
    var FLUSH_INTERVAL_MS = 2000;
    var SESSION_FLUSH_INTERVAL_MS = 5000;
    var SESSION_MAX_DURATION_MS = 10 * 60 * 1000;
    var CLICK_DEBOUNCE_MS = 150;
    var ROUTE_DEBOUNCE_MS = 250;
    var RAGE_WINDOW_MS = 1000;
    var RAGE_CLICK_COUNT = 3;
    var RAGE_AREA_PX = 48;
    var HOVER_SAMPLE_INTERVAL_MS = 250;
    var HOVER_BATCH_MAX_EVENTS = 120;
    var HOVER_BATCH_FLUSH_INTERVAL_MS = 5000;
    var MIN_HOVER_MOVE_DISTANCE_PX = 24;
    var SCROLL_HEATMAP_THROTTLE_MS = 2000;
    var SNAPSHOT_CAPTURE_DEBOUNCE_MS = 1200;
    var SNAPSHOT_MIN_CAPTURE_INTERVAL_MS = 8000;

    var scriptEl =
      document.currentScript ||
      document.querySelector("script[data-project-id][src*='analytics.js']") ||
      document.querySelector("script[data-project-id]");

    var scriptSrc = (scriptEl && scriptEl.getAttribute("src")) || "";

    function sanitizeProjectId(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    }

    function inferProjectId() {
      try {
        var host = String(window.location.hostname || "").trim();
        var cleaned = sanitizeProjectId(host);
        if (cleaned) return cleaned;
      } catch (_err) {
        // Fall through to default.
      }
      return "default-project";
    }

    var projectId = sanitizeProjectId(scriptEl && scriptEl.getAttribute("data-project-id")) || inferProjectId();
    var endpointAttr = scriptEl && scriptEl.getAttribute("data-endpoint");

    // Guard against duplicate script injection on SPAs/templated pages.
    if (typeof window !== "undefined") {
      window.__analyticsTrackerInitByProject = window.__analyticsTrackerInitByProject || {};
      if (window.__analyticsTrackerInitByProject[projectId]) {
        return;
      }
      window.__analyticsTrackerInitByProject[projectId] = true;
    }

    function trimTrailingSlash(value) {
      return String(value || "").replace(/\/+$/, "");
    }

    function inferDefaultEndpoint() {
      try {
        if (scriptSrc) {
          var srcUrl = new URL(scriptSrc, window.location.href);
          return trimTrailingSlash(srcUrl.origin) + "/track";
        }
      } catch (_err) {
        // Fall through to page origin fallback.
      }

      try {
        return trimTrailingSlash(window.location.origin) + "/track";
      } catch (_err2) {
        return "/track";
      }
    }

    function deriveEndpoints(rawEndpoint) {
      var normalized = trimTrailingSlash(rawEndpoint);
      if (/\/track$/i.test(normalized)) {
        return {
          trackEndpoint: normalized,
          sessionRecordEndpoint: normalized.replace(/\/track$/i, "/session-record"),
          frontendErrorEndpoint: normalized.replace(/\/track$/i, "/frontend-error"),
          heatmapClickEndpoint: normalized.replace(/\/track$/i, "/heatmap/click"),
          heatmapHoverEndpoint: normalized.replace(/\/track$/i, "/heatmap/hover"),
          heatmapScrollEndpoint: normalized.replace(/\/track$/i, "/heatmap/scroll"),
          heatmapSnapshotEndpoint: normalized.replace(/\/track$/i, "/heatmap/snapshot"),
        };
      }

      return {
        trackEndpoint: normalized + "/track",
        sessionRecordEndpoint: normalized + "/session-record",
        frontendErrorEndpoint: normalized + "/frontend-error",
        heatmapClickEndpoint: normalized + "/heatmap/click",
        heatmapHoverEndpoint: normalized + "/heatmap/hover",
        heatmapScrollEndpoint: normalized + "/heatmap/scroll",
        heatmapSnapshotEndpoint: normalized + "/heatmap/snapshot",
      };
    }

    function buildLocalFallbackCandidates(endpointUrl) {
      var candidates = [endpointUrl];

      try {
        var parsed = new URL(endpointUrl, window.location.href);
        var pathName = String(parsed.pathname || "").replace(/\/+$/, "") || "/";
        var altPath = "";

        if (/^\/api\//i.test(pathName)) {
          altPath = pathName.replace(/^\/api\//i, "/");
        } else {
          altPath = "/api" + (pathName.charAt(0) === "/" ? pathName : "/" + pathName);
        }

        if (altPath && altPath !== pathName) {
          var alt = new URL(parsed.toString());
          alt.pathname = altPath;
          candidates.push(alt.toString());
        }

        var isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (isLocalHost) {
          var pathVariants = altPath && altPath !== pathName ? [pathName, altPath] : [pathName];
          for (var port = 4001; port <= 4006; port += 1) {
            for (var j = 0; j < pathVariants.length; j += 1) {
              var fallback = new URL(parsed.toString());
              fallback.port = String(port);
              fallback.pathname = pathVariants[j];
              candidates.push(fallback.toString());
            }
          }
        }
      } catch (_err) {
        // Keep only provided endpoint when URL parsing fails.
      }

      var unique = [];
      for (var i = 0; i < candidates.length; i += 1) {
        var item = String(candidates[i] || "");
        if (item && unique.indexOf(item) === -1) {
          unique.push(item);
        }
      }

      return unique;
    }

    function postJsonWithFallback(candidates, body, useBeaconFirst) {
      if (!candidates || candidates.length === 0) return;

      function isSameOriginUrl(candidate) {
        try {
          var parsed = new URL(candidate, window.location.href);
          return parsed.origin === window.location.origin;
        } catch (_err) {
          return false;
        }
      }

      if (useBeaconFirst && navigator.sendBeacon) {
        for (var i = 0; i < candidates.length; i += 1) {
          if (!isSameOriginUrl(candidates[i])) continue;
          try {
            var blob = new Blob([body], { type: "application/json" });
            var beaconOk = navigator.sendBeacon(candidates[i], blob);
            if (beaconOk) return;
          } catch (_beaconErr) {
            // Fall through to fetch retry.
          }
        }
      }

      function tryFetchAt(index) {
        if (index >= candidates.length) return;

        try {
          window.fetch(candidates[index], {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: body,
            keepalive: true,
            credentials: "omit",
          })
            .then(function (response) {
              if (response && response.ok) return;
              tryFetchAt(index + 1);
            })
            .catch(function () {
              tryFetchAt(index + 1);
            });
        } catch (_err) {
          tryFetchAt(index + 1);
        }
      }

      tryFetchAt(0);
    }

    var endpoint = endpointAttr || inferDefaultEndpoint();
    var endpoints = deriveEndpoints(endpoint);
    var trackEndpoint = endpoints.trackEndpoint;
    var sessionRecordEndpoint = endpoints.sessionRecordEndpoint;
    var frontendErrorEndpoint = endpoints.frontendErrorEndpoint;
    var heatmapClickEndpoint = endpoints.heatmapClickEndpoint;
    var heatmapHoverEndpoint = endpoints.heatmapHoverEndpoint;
    var heatmapScrollEndpoint = endpoints.heatmapScrollEndpoint;
    var heatmapSnapshotEndpoint = endpoints.heatmapSnapshotEndpoint;
    var trackEndpointCandidates = buildLocalFallbackCandidates(trackEndpoint);
    var sessionRecordEndpointCandidates = buildLocalFallbackCandidates(sessionRecordEndpoint);
    var frontendErrorEndpointCandidates = buildLocalFallbackCandidates(frontendErrorEndpoint);
    var heatmapClickEndpointCandidates = buildLocalFallbackCandidates(heatmapClickEndpoint);
    var heatmapHoverEndpointCandidates = buildLocalFallbackCandidates(heatmapHoverEndpoint);
    var heatmapScrollEndpointCandidates = buildLocalFallbackCandidates(heatmapScrollEndpoint);
    var heatmapSnapshotEndpointCandidates = buildLocalFallbackCandidates(heatmapSnapshotEndpoint);

    function now() {
      return Date.now();
    }

    function safeJsonParse(raw, fallback) {
      try {
        if (!raw) return fallback;
        var parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
      } catch (_err) {
        return fallback;
      }
    }

    function randomId(prefix) {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return prefix ? prefix + "_" + window.crypto.randomUUID() : window.crypto.randomUUID();
      }
      var suffix = Math.random().toString(36).slice(2, 10);
      return (prefix ? prefix + "_" : "") + now() + "_" + suffix;
    }

    function getOrCreateStorageValue(storage, key, prefix) {
      try {
        var existing = storage.getItem(key);
        if (existing) return existing;
        var next = randomId(prefix);
        storage.setItem(key, next);
        return next;
      } catch (_err) {
        return randomId(prefix);
      }
    }

    var userId = getOrCreateStorageValue(window.localStorage, USER_ID_KEY, "u");
    var sessionId = getOrCreateStorageValue(window.sessionStorage, SESSION_ID_KEY, "s");
    var userProperties = safeJsonParse(window.localStorage.getItem("analytics_user_properties"), {});
    var queue = [];
    var sessionRecordingQueue = [];
    var flushTimer = null;
    var sessionFlushTimer = null;
    var stopSessionRecording = null;
    var sessionRecordHeartbeatSent = false;
    var sessionRecorderState = "initializing";
    var sessionStartMs = now();
    var sessionStartTimestamp = new Date(sessionStartMs).toISOString();
    var rrwebLoadState = {
      loading: false,
      callbacks: [],
    };
    var lastEventByKey = new Map();
    var clickHistory = [];
    var maxScrollDepthBucket = 0;
    var hoverBatch = [];
    var hoverFlushTimer = null;
    var lastHoverSampleTime = 0;
    var lastHoverPoint = null;
    var lastHeatmapScrollSentAt = 0;
    var lastHeatmapScrollDepth = 0;
    var snapshotCaptureTimer = null;
    var isCapturingSnapshot = false;
    var lastSnapshotAt = 0;
    var lastSnapshotFingerprint = "";

    function safeGetPathname() {
      try {
        return window.location.pathname;
      } catch (_err) {
        return "";
      }
    }

    function safeGetHref() {
      try {
        return window.location.href;
      } catch (_err) {
        return "";
      }
    }

    function safeGetHost() {
      try {
        return window.location.host || "";
      } catch (_err) {
        return "";
      }
    }

    function safeGetOrigin() {
      try {
        return window.location.origin || "";
      } catch (_err) {
        return "";
      }
    }

    function safeGetUserAgent() {
      try {
        return window.navigator.userAgent || "";
      } catch (_err) {
        return "";
      }
    }

    function getDeviceType() {
      var width = window.innerWidth || 0;
      if (width < 768) return "mobile";
      if (width < 1024) return "tablet";
      return "desktop";
    }

    function getDocumentMetrics() {
      var root = document.documentElement;
      var body = document.body;

      return {
        viewportWidth: window.innerWidth || (root && root.clientWidth) || 0,
        viewportHeight: window.innerHeight || (root && root.clientHeight) || 0,
        documentWidth: Math.max(
          (root && root.scrollWidth) || 0,
          (root && root.offsetWidth) || 0,
          (root && root.clientWidth) || 0,
          (body && body.scrollWidth) || 0,
          (body && body.offsetWidth) || 0,
          (body && body.clientWidth) || 0
        ),
        documentHeight: Math.max(
          (root && root.scrollHeight) || 0,
          (root && root.offsetHeight) || 0,
          (root && root.clientHeight) || 0,
          (body && body.scrollHeight) || 0,
          (body && body.offsetHeight) || 0,
          (body && body.clientHeight) || 0
        ),
        scrollX: window.scrollX || (root && root.scrollLeft) || 0,
        scrollY: window.scrollY || (root && root.scrollTop) || 0,
      };
    }

    function getCssSelector(el) {
      if (!el || el.nodeType !== 1) return "unknown";
      if (el === document.body) return "body";

      var parts = [];
      var current = el;

      while (current && current !== document.body && current.nodeType === 1 && parts.length < 4) {
        var part = String(current.tagName || "").toLowerCase();

        if (current.id) {
          part += "#" + String(current.id).replace(/[^\w-]/g, "_");
          parts.unshift(part);
          break;
        }

        var classes = Array.from(current.classList || []).slice(0, 2).join(".");
        if (classes) part += "." + classes;

        parts.unshift(part);
        current = current.parentElement;
      }

      return parts.join(" > ");
    }

    function getElementText(el) {
      if (!el) return "";
      var text = el.innerText || el.textContent || "";
      return String(text).trim().slice(0, 100);
    }

    function postHeatmapPayload(candidates, payload) {
      try {
        postJsonWithFallback(candidates, JSON.stringify(payload), true);
      } catch (_err) {
        // Ignore heatmap payload transport errors.
      }
    }

    function sendHeatmapClick(event) {
      try {
        var metrics = getDocumentMetrics();
        var pageX = Number.isFinite(event.pageX) ? event.pageX : event.clientX + metrics.scrollX;
        var pageY = Number.isFinite(event.pageY) ? event.pageY : event.clientY + metrics.scrollY;
        var target = (event && event.target) || {};

        postHeatmapPayload(heatmapClickEndpointCandidates, {
          user_id: userId,
          session_id: sessionId,
          page_url: safeGetPathname(),
          x_coordinate: event.clientX,
          y_coordinate: event.clientY,
          page_x: pageX,
          page_y: pageY,
          x_percent: metrics.viewportWidth > 0 ? event.clientX / metrics.viewportWidth : null,
          y_percent: metrics.viewportHeight > 0 ? event.clientY / metrics.viewportHeight : null,
          page_x_percent: metrics.documentWidth > 0 ? pageX / metrics.documentWidth : null,
          page_y_percent: metrics.documentHeight > 0 ? pageY / metrics.documentHeight : null,
          viewport_width: metrics.viewportWidth,
          viewport_height: metrics.viewportHeight,
          document_width: metrics.documentWidth,
          document_height: metrics.documentHeight,
          scroll_x: metrics.scrollX,
          scroll_y: metrics.scrollY,
          device_type: getDeviceType(),
          element_selector: getCssSelector(target),
          element_text: getElementText(target),
          timestamp: new Date().toISOString(),
        });
      } catch (_err) {
        // Ignore heatmap click tracking errors.
      }
    }

    function flushHoverBatch() {
      if (hoverBatch.length === 0) return;
      var events = hoverBatch.splice(0, hoverBatch.length);
      postHeatmapPayload(heatmapHoverEndpointCandidates, { events: events });
    }

    function queueHoverFlush() {
      if (hoverBatch.length >= HOVER_BATCH_MAX_EVENTS) {
        if (hoverFlushTimer) {
          window.clearTimeout(hoverFlushTimer);
          hoverFlushTimer = null;
        }
        flushHoverBatch();
        return;
      }

      if (!hoverFlushTimer) {
        hoverFlushTimer = window.setTimeout(function () {
          hoverFlushTimer = null;
          flushHoverBatch();
        }, HOVER_BATCH_FLUSH_INTERVAL_MS);
      }
    }

    function handleHoverCapture(event) {
      try {
        var nowTs = Date.now();
        if (nowTs - lastHoverSampleTime < HOVER_SAMPLE_INTERVAL_MS) return;

        if (lastHoverPoint) {
          var deltaX = event.clientX - lastHoverPoint.x;
          var deltaY = event.clientY - lastHoverPoint.y;
          var distance = Math.hypot(deltaX, deltaY);
          if (distance < MIN_HOVER_MOVE_DISTANCE_PX) return;
        }

        lastHoverSampleTime = nowTs;
        lastHoverPoint = { x: event.clientX, y: event.clientY };

        var metrics = getDocumentMetrics();
        var pageX = Number.isFinite(event.pageX) ? event.pageX : event.clientX + metrics.scrollX;
        var pageY = Number.isFinite(event.pageY) ? event.pageY : event.clientY + metrics.scrollY;

        hoverBatch.push({
          user_id: userId,
          session_id: sessionId,
          page_url: safeGetPathname(),
          x_coordinate: event.clientX,
          y_coordinate: event.clientY,
          page_x: pageX,
          page_y: pageY,
          x_percent: metrics.viewportWidth > 0 ? event.clientX / metrics.viewportWidth : null,
          y_percent: metrics.viewportHeight > 0 ? event.clientY / metrics.viewportHeight : null,
          page_x_percent: metrics.documentWidth > 0 ? pageX / metrics.documentWidth : null,
          page_y_percent: metrics.documentHeight > 0 ? pageY / metrics.documentHeight : null,
          viewport_width: metrics.viewportWidth,
          viewport_height: metrics.viewportHeight,
          document_width: metrics.documentWidth,
          document_height: metrics.documentHeight,
          scroll_x: metrics.scrollX,
          scroll_y: metrics.scrollY,
          device_type: getDeviceType(),
          timestamp: new Date().toISOString(),
        });

        queueHoverFlush();
      } catch (_err) {
        // Ignore heatmap hover tracking errors.
      }
    }

    function calculateScrollDepthPercentage() {
      var metrics = getDocumentMetrics();
      if (metrics.documentHeight <= metrics.viewportHeight) return 100;
      var depth = ((metrics.scrollY + metrics.viewportHeight) / metrics.documentHeight) * 100;
      return Math.max(0, Math.min(100, Math.round(depth)));
    }

    function handleHeatmapScroll() {
      try {
        var nowTs = Date.now();
        if (nowTs - lastHeatmapScrollSentAt < SCROLL_HEATMAP_THROTTLE_MS) return;

        var depth = calculateScrollDepthPercentage();
        if (depth <= lastHeatmapScrollDepth) return;

        lastHeatmapScrollSentAt = nowTs;
        lastHeatmapScrollDepth = depth;
        var metrics = getDocumentMetrics();

        postHeatmapPayload(heatmapScrollEndpointCandidates, {
          user_id: userId,
          session_id: sessionId,
          page_url: safeGetPathname(),
          scroll_depth_percentage: depth,
          viewport_height: metrics.viewportHeight,
          document_height: metrics.documentHeight,
          timestamp: new Date().toISOString(),
        });
      } catch (_err) {
        // Ignore heatmap scroll tracking errors.
      }
    }

    function buildSnapshotHtml() {
      try {
        var clone = document.documentElement.cloneNode(true);
        clone.querySelectorAll("script, noscript, iframe, object, embed").forEach(function (node) {
          node.remove();
        });
        return "<!DOCTYPE html>" + clone.outerHTML;
      } catch (_err) {
        return "";
      }
    }

    function capturePageSnapshot(reason) {
      if (typeof reason !== "string") reason = "manual";
      if (document.hidden || isCapturingSnapshot) return;

      var nowTs = Date.now();
      if (nowTs - lastSnapshotAt < SNAPSHOT_MIN_CAPTURE_INTERVAL_MS && reason !== "route_change") {
        return;
      }

      isCapturingSnapshot = true;
      try {
        var html = buildSnapshotHtml();
        if (!html) return;

        var metrics = getDocumentMetrics();
        var fingerprint = [safeGetPathname(), metrics.documentWidth, metrics.documentHeight, html.length].join(":");
        if (fingerprint === lastSnapshotFingerprint && reason !== "route_change") return;

        postHeatmapPayload(heatmapSnapshotEndpointCandidates, {
          user_id: userId,
          session_id: sessionId,
          page_url: safeGetPathname(),
          dom_snapshot: html,
          viewport_width: metrics.viewportWidth,
          viewport_height: metrics.viewportHeight,
          document_width: metrics.documentWidth,
          document_height: metrics.documentHeight,
          scroll_x: metrics.scrollX,
          scroll_y: metrics.scrollY,
          device_type: getDeviceType(),
          reason: reason,
          timestamp: new Date().toISOString(),
        });

        lastSnapshotAt = nowTs;
        lastSnapshotFingerprint = fingerprint;
      } finally {
        isCapturingSnapshot = false;
      }
    }

    function scheduleSnapshotCapture(reason) {
      if (snapshotCaptureTimer) {
        window.clearTimeout(snapshotCaptureTimer);
      }
      snapshotCaptureTimer = window.setTimeout(function () {
        snapshotCaptureTimer = null;
        capturePageSnapshot(reason || "scheduled");
      }, SNAPSHOT_CAPTURE_DEBOUNCE_MS);
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = window.setTimeout(function () {
        flushTimer = null;
        flushQueue();
      }, FLUSH_INTERVAL_MS);
    }

    function shouldDropFrequentEvent(eventName, properties) {
      if (eventName !== "click") return false;
      var key = "click:" + String((properties && properties.tag) || "") + ":" + String((properties && properties.id) || "");
      var lastAt = lastEventByKey.get(key) || 0;
      var ts = now();
      if (ts - lastAt < CLICK_DEBOUNCE_MS) {
        return true;
      }
      lastEventByKey.set(key, ts);
      return false;
    }

    function sendEvent(eventPayload) {
      if (!eventPayload) return;

      var body = JSON.stringify(eventPayload);
      postJsonWithFallback(trackEndpointCandidates, body, true);
    }

    function sendFrontendError(payload) {
      if (!payload || !payload.message) return;

      try {
        var normalizedLine = Number(payload.line);
        var normalizedColumn = Number(payload.column);
        var body = JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          message: String(payload.message || "Unknown frontend error"),
          stack: payload.stack ? String(payload.stack) : null,
          page: payload.page ? String(payload.page) : safeGetPathname(),
          page_path: safeGetPathname(),
          page_url: safeGetHref(),
          source: payload.source ? String(payload.source) : null,
          line: Number.isFinite(normalizedLine) ? Math.trunc(normalizedLine) : null,
          column: Number.isFinite(normalizedColumn) ? Math.trunc(normalizedColumn) : null,
          error_type: payload.error_type ? String(payload.error_type) : null,
          user_agent: safeGetUserAgent(),
          timestamp: new Date(now()).toISOString(),
        });

        postJsonWithFallback(frontendErrorEndpointCandidates, body, false);
      } catch (_err) {
        // Ignore frontend error transport failures.
      }
    }

    function sendBatch(events) {
      if (!events || events.length === 0) return;
      for (var i = 0; i < events.length; i += 1) {
        sendEvent(events[i]);
      }
    }

    function flushQueue() {
      try {
        if (queue.length === 0) return;
        var toSend = queue.splice(0, queue.length);
        sendBatch(toSend);
      } catch (_err) {
        // Never throw from analytics internals.
      }
    }

    function flushSessionRecording(finalize, endReason) {
      try {
        var hasEvents = sessionRecordingQueue.length > 0;
        if (!hasEvents && !finalize && sessionRecordHeartbeatSent) return;

        var events = sessionRecordingQueue.splice(0, sessionRecordingQueue.length);
        var endTimestamp = new Date(now()).toISOString();
        if (!hasEvents && !finalize) {
          sessionRecordHeartbeatSent = true;
        }
        var payload = {
          user_id: userId,
          session_id: sessionId,
          events: events,
          timestamp: endTimestamp,
          start_timestamp: sessionStartTimestamp,
          end_timestamp: endTimestamp,
          session_finished: Boolean(finalize),
          end_reason: finalize ? (endReason || "unknown") : null,
          recorder_state: sessionRecorderState,
        };

        var body = JSON.stringify(payload);

        postJsonWithFallback(sessionRecordEndpointCandidates, body, Boolean(finalize));
      } catch (_err) {
        // Ignore session recording flush errors.
      }
    }

    function hasSessionExpired() {
      return now() - sessionStartMs >= SESSION_MAX_DURATION_MS;
    }

    function resetSessionMetadata(nextSessionId) {
      sessionId = String(nextSessionId || randomId("s"));
      try {
        window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
      } catch (_storageErr) {
        // Ignore session storage failures.
      }

      sessionStartMs = now();
      sessionStartTimestamp = new Date(sessionStartMs).toISOString();
      sessionRecordHeartbeatSent = false;
      sessionRecordingQueue = [];
    }

    function stopSessionRecordingNow() {
      if (sessionFlushTimer) {
        window.clearInterval(sessionFlushTimer);
        sessionFlushTimer = null;
      }

      if (typeof stopSessionRecording === "function") {
        try {
          stopSessionRecording();
        } catch (_err) {
          // Ignore rrweb stop errors.
        }
      }

      stopSessionRecording = null;
    }

    function rolloverSession(reason) {
      try {
        flushQueue();
        flushSessionRecording(true, reason || "max_duration_reached");
      } catch (_flushErr) {
        // Ignore flush errors while rolling over session.
      }

      stopSessionRecordingNow();
      resetSessionMetadata(randomId("s"));
      startSessionRecording();
    }

    function withRrwebRecorder(callback) {
      try {
        var recordFn = window.rrwebRecord || window.__analyticsRrwebRecord;
        if (typeof recordFn === "function") {
          sessionRecorderState = "recording";
          callback(recordFn);
          return;
        }

        rrwebLoadState.callbacks.push(callback);
        if (rrwebLoadState.loading) return;

        rrwebLoadState.loading = true;

        var urls = RRWEB_CDN_URLS.slice();
        if (scriptSrc) {
          try {
            var sourceUrl = new URL(scriptSrc, window.location.href);
            var hostedCopy = sourceUrl.origin + sourceUrl.pathname.replace(/analytics\.js$/i, "rrweb-record.min.js");
            urls.unshift(hostedCopy);
          } catch (_urlErr) {
            // Ignore malformed script src.
          }
        }

        var uniqueUrls = [];
        for (var u = 0; u < urls.length; u += 1) {
          if (uniqueUrls.indexOf(urls[u]) === -1) {
            uniqueUrls.push(urls[u]);
          }
        }

        function completeRecorderLoad() {
          rrwebLoadState.loading = false;
          var loadedRecordFn = window.rrwebRecord || window.__analyticsRrwebRecord;
          if (typeof loadedRecordFn !== "function") {
            sessionRecorderState = "unavailable";
            rrwebLoadState.callbacks = [];
            flushSessionRecording(false, "rrweb_unavailable");
            return;
          }

          sessionRecorderState = "recording";

          var callbacks = rrwebLoadState.callbacks.splice(0, rrwebLoadState.callbacks.length);
          for (var i = 0; i < callbacks.length; i += 1) {
            try {
              callbacks[i](loadedRecordFn);
            } catch (_callbackErr) {
              // Ignore callback errors.
            }
          }
        }

        function loadUrlAt(index) {
          if (index >= uniqueUrls.length) {
            sessionRecorderState = "unavailable";
            rrwebLoadState.loading = false;
            rrwebLoadState.callbacks = [];
            flushSessionRecording(false, "rrweb_unavailable");
            return;
          }

          var script = document.createElement("script");
          script.src = uniqueUrls[index];
          script.async = true;
          script.crossOrigin = "anonymous";
          script.onload = completeRecorderLoad;
          script.onerror = function () {
            loadUrlAt(index + 1);
          };
          document.head.appendChild(script);
        }

        loadUrlAt(0);
      } catch (_err) {
        sessionRecorderState = "unavailable";
        flushSessionRecording(false, "rrweb_loader_exception");
        // Ignore rrweb loader errors.
      }
    }

    function startSessionRecording() {
      if (sessionFlushTimer) return;

      sessionFlushTimer = window.setInterval(function () {
        if (hasSessionExpired()) {
          rolloverSession("max_duration_reached");
          return;
        }
        flushSessionRecording(false, "interval");
      }, SESSION_FLUSH_INTERVAL_MS);

      withRrwebRecorder(function (recordFn) {
        try {
          stopSessionRecording = recordFn({
            emit: function (event) {
              sessionRecordingQueue.push(event);
            },
            sampling: {
              mousemove: 50,
            },
          });
        } catch (_err) {
          // Ignore rrweb runtime errors.
        }
      });
    }

    function enqueue(payload) {
      queue.push(payload);
      if (queue.length >= BATCH_SIZE) {
        flushQueue();
        return;
      }
      scheduleFlush();
    }

    function track(eventName, properties) {
      try {
        if (hasSessionExpired()) {
          rolloverSession("max_duration_reached");
        }

        var nextProps = properties && typeof properties === "object" ? properties : {};

        if (shouldDropFrequentEvent(eventName, nextProps)) {
          return;
        }

        var payload = {
          project_id: projectId,
          user_id: userId,
          session_id: sessionId,
          event_name: eventName,
          page: safeGetPathname(),
          url: safeGetHref(),
          timestamp: now(),
          properties: Object.assign(
            {
              site_host: safeGetHost(),
              site_origin: safeGetOrigin(),
              page_title: document.title || "",
            },
            userProperties,
            nextProps
          ),
        };

        enqueue(payload);
      } catch (_err) {
        // Never throw from public API.
      }
    }

    function identify(nextUserId) {
      try {
        if (!nextUserId) return;
        userId = String(nextUserId);
        window.localStorage.setItem(USER_ID_KEY, userId);
      } catch (_err) {
        // Ignore storage failures.
      }
    }

    function setUserProperties(props) {
      try {
        if (!props || typeof props !== "object") return;
        userProperties = Object.assign({}, userProperties, props);
        window.localStorage.setItem("analytics_user_properties", JSON.stringify(userProperties));
      } catch (_err) {
        // Ignore persistence failures.
      }
    }

    function onRouteChange() {
      track("page_view");
      scheduleSnapshotCapture("route_change");
      maxScrollDepthBucket = 0;
      lastHeatmapScrollDepth = 0;
      lastHeatmapScrollSentAt = 0;
    }

    function debounce(fn, wait) {
      var timeoutId = null;
      return function debounced() {
        var args = arguments;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        timeoutId = window.setTimeout(function () {
          timeoutId = null;
          try {
            fn.apply(null, args);
          } catch (_err) {
            // Ignore callback errors.
          }
        }, wait);
      };
    }

    var debouncedRouteChange = debounce(onRouteChange, ROUTE_DEBOUNCE_MS);

    function patchHistoryMethod(name) {
      try {
        var original = history[name];
        if (typeof original !== "function") return;

        history[name] = function patchedHistoryMethod() {
          var result = original.apply(this, arguments);
          debouncedRouteChange();
          return result;
        };
      } catch (_err) {
        // Ignore monkey-patch failures.
      }
    }

    function bucketClickArea(x, y) {
      var bx = Math.floor((x || 0) / RAGE_AREA_PX);
      var by = Math.floor((y || 0) / RAGE_AREA_PX);
      return bx + ":" + by;
    }

    function detectRageClick(event) {
      try {
        var ts = now();
        var area = bucketClickArea(event && event.clientX, event && event.clientY);

        clickHistory.push({ t: ts, area: area });
        clickHistory = clickHistory.filter(function (entry) {
          return ts - entry.t <= RAGE_WINDOW_MS;
        });

        var sameAreaCount = 0;
        for (var i = clickHistory.length - 1; i >= 0; i -= 1) {
          if (clickHistory[i].area === area) {
            sameAreaCount += 1;
          }
        }

        if (sameAreaCount >= RAGE_CLICK_COUNT) {
          track("rage_click", {
            area: area,
            click_count: sameAreaCount,
          });
          clickHistory = [];
        }
      } catch (_err) {
        // Ignore rage detection errors.
      }
    }

    document.addEventListener(
      "click",
      function (e) {
        try {
          var target = (e && e.target) || {};
          track("click", {
            tag: target.tagName || "",
            text: String((target.innerText || target.textContent || "")).slice(0, 50),
            id: target.id || "",
            class: target.className || "",
          });
          detectRageClick(e);
          sendHeatmapClick(e);
        } catch (_err) {
          // Ignore click tracking errors.
        }
      },
      { capture: true, passive: true }
    );

    document.addEventListener("mousemove", handleHoverCapture, { capture: true, passive: true });
    window.addEventListener("scroll", handleHeatmapScroll, { passive: true });

    document.addEventListener(
      "submit",
      function (e) {
        try {
          var form = (e && e.target) || {};
          track("form_submit", {
            id: form.id || "",
            name: form.name || "",
            action: form.action || "",
            method: String(form.method || "get").toLowerCase(),
          });
        } catch (_err) {
          // Ignore form tracking errors.
        }
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      "change",
      function (e) {
        try {
          var target = (e && e.target) || {};
          var tag = String(target.tagName || "").toLowerCase();
          if (tag !== "input" && tag !== "select" && tag !== "textarea") return;
          track("field_change", {
            tag: target.tagName || "",
            type: target.type || "",
            id: target.id || "",
            name: target.name || "",
          });
        } catch (_err) {
          // Ignore change tracking errors.
        }
      },
      { capture: true, passive: true }
    );

    window.addEventListener(
      "scroll",
      function () {
        try {
          var doc = document.documentElement || {};
          var body = document.body || {};
          var scrollTop = Number(doc.scrollTop || body.scrollTop || 0);
          var viewport = Number(window.innerHeight || doc.clientHeight || 0);
          var scrollHeight = Number(doc.scrollHeight || body.scrollHeight || 0);
          var denominator = Math.max(1, scrollHeight - viewport);
          var percent = Math.max(0, Math.min(100, Math.round((scrollTop / denominator) * 100)));
          var bucket = Math.floor(percent / 25) * 25;
          if (bucket <= maxScrollDepthBucket) return;
          maxScrollDepthBucket = bucket;
          track("scroll_depth", { percent: percent, bucket: bucket });
        } catch (_err) {
          // Ignore scroll depth errors.
        }
      },
      { passive: true }
    );

    window.addEventListener("error", function (e) {
      try {
        sendFrontendError({
          message: e && e.message,
          stack: e && e.error && e.error.stack,
          source: e && e.filename,
          line: e && e.lineno,
          column: e && e.colno,
          error_type: (e && e.error && e.error.name) || "Error",
        });
        track("error", {
          message: e && e.message,
          source: e && e.filename,
          line: e && e.lineno,
        });
      } catch (_err) {
        // Ignore.
      }
    });

    window.addEventListener("unhandledrejection", function (e) {
      try {
        var reason = e && e.reason;
        sendFrontendError({
          message: (reason && reason.message) || (typeof reason === "string" ? reason : "Unhandled promise rejection"),
          stack: reason && reason.stack,
          source: (reason && reason.fileName) || null,
          line: reason && reason.lineNumber,
          column: reason && reason.columnNumber,
          error_type: (reason && reason.name) || "UnhandledPromiseRejection",
        });
        track("promise_error", {
          message: typeof reason === "string" ? reason : (reason && reason.message) || String(reason),
        });
      } catch (_err) {
        // Ignore.
      }
    });

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
    window.addEventListener("popstate", debouncedRouteChange);
    window.addEventListener("hashchange", debouncedRouteChange);

    window.addEventListener("beforeunload", function () {
      flushQueue();
      flushSessionRecording(true, "page_unload");
      flushHoverBatch();
      handleHeatmapScroll();
      capturePageSnapshot("page_unload");
      if (typeof stopSessionRecording === "function") {
        try {
          stopSessionRecording();
        } catch (_err) {
          // Ignore teardown errors.
        }
      }
    });

    startSessionRecording();
    track("page_view");
    scheduleSnapshotCapture("initial_load");

    window.analytics = {
      track: track,
      identify: identify,
      setUserProperties: setUserProperties,
    };
  } catch (_fatalErr) {
    // Intentionally swallow all top-level failures.
  }
})();
