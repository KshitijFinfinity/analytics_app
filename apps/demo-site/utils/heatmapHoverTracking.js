import { getOrCreateUserId, getOrCreateSessionId } from "./sessionMonitoring";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const HOVER_SAMPLE_INTERVAL_MS = 250;
const HOVER_BATCH_MAX_EVENTS = 120;
const HOVER_BATCH_FLUSH_INTERVAL_MS = 5000;
const MIN_MOVE_DISTANCE_PX = 24;

let hoverBatch = [];
let batchFlushTimer = null;
let isInitialized = false;
let lastSampleTime = 0;
let lastPoint = null;

function getDeviceType() {
  const width = window.innerWidth || 0;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function getDocumentMetrics() {
  const root = document.documentElement;
  const body = document.body;

  return {
    viewportWidth: window.innerWidth || root?.clientWidth || 0,
    viewportHeight: window.innerHeight || root?.clientHeight || 0,
    documentWidth: Math.max(
      root?.scrollWidth || 0,
      root?.offsetWidth || 0,
      root?.clientWidth || 0,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0,
      body?.clientWidth || 0
    ),
    documentHeight: Math.max(
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      root?.clientHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      body?.clientHeight || 0
    ),
    scrollX: window.scrollX || root?.scrollLeft || 0,
    scrollY: window.scrollY || root?.scrollTop || 0,
  };
}

function shouldSample(event) {
  const now = Date.now();
  if (now - lastSampleTime < HOVER_SAMPLE_INTERVAL_MS) {
    return false;
  }

  if (!lastPoint) {
    lastSampleTime = now;
    lastPoint = { x: event.clientX, y: event.clientY };
    return true;
  }

  const deltaX = event.clientX - lastPoint.x;
  const deltaY = event.clientY - lastPoint.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance < MIN_MOVE_DISTANCE_PX) {
    return false;
  }

  lastSampleTime = now;
  lastPoint = { x: event.clientX, y: event.clientY };
  return true;
}

function buildHoverPayload(event) {
  const metrics = getDocumentMetrics();
  const pageX = Number.isFinite(event.pageX) ? event.pageX : event.clientX + metrics.scrollX;
  const pageY = Number.isFinite(event.pageY) ? event.pageY : event.clientY + metrics.scrollY;

  return {
    user_id: getOrCreateUserId(),
    session_id: getOrCreateSessionId(),
    page_url: window.location.pathname,
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
  };
}

async function flushHoverBatch() {
  if (hoverBatch.length === 0) {
    return;
  }

  const batch = [...hoverBatch];
  hoverBatch = [];

  try {
    try {
      const response = await fetch(`${BASE_URL}/api/heatmap/hover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (response.ok) {
        return;
      }
    } catch {}
  } catch (error) {
    console.error("Failed to flush hover batch:", error);
    hoverBatch = batch;
  }
}

function queueFlush() {
  if (hoverBatch.length >= HOVER_BATCH_MAX_EVENTS) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
    void flushHoverBatch();
    return;
  }

  if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(() => {
      void flushHoverBatch();
      batchFlushTimer = null;
    }, HOVER_BATCH_FLUSH_INTERVAL_MS);
  }
}

function handleHoverCapture(event) {
  if (!isInitialized || typeof window === "undefined") {
    return;
  }

  try {
    if (!shouldSample(event)) {
      return;
    }

    hoverBatch.push(buildHoverPayload(event));
    queueFlush();
  } catch (error) {
    console.error("Error handling hover capture:", error);
  }
}

function flushHoverBatchOnUnload() {
  try {
    if (hoverBatch.length === 0 || !navigator.sendBeacon) {
      return;
    }

    const payload = JSON.stringify({ events: hoverBatch });
    navigator.sendBeacon(
      `${BACKEND_BASES[0]}/heatmap/hover`,
      new Blob([payload], { type: "application/json" })
    );
    hoverBatch = [];
  } catch (error) {
    console.error("Failed to flush hover batch on unload:", error);
  }
}

export function initializeHoverTracking() {
  if (isInitialized || typeof window === "undefined") {
    return;
  }

  document.addEventListener("mousemove", handleHoverCapture, { passive: true, capture: true });
  window.addEventListener("beforeunload", flushHoverBatchOnUnload);
  isInitialized = true;
}

export function stopHoverTracking() {
  if (!isInitialized) {
    return;
  }

  document.removeEventListener("mousemove", handleHoverCapture, true);
  window.removeEventListener("beforeunload", flushHoverBatchOnUnload);
  clearTimeout(batchFlushTimer);
  batchFlushTimer = null;
  void flushHoverBatch();
  hoverBatch = [];
  lastPoint = null;
  lastSampleTime = 0;
  isInitialized = false;
}

export function isHoverTrackingActive() {
  return isInitialized;
}