import { getOrCreateUserId, getOrCreateSessionId } from "./sessionMonitoring";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const BATCH_MAX_EVENTS = 50;
const BATCH_FLUSH_INTERVAL_MS = 5000;

let clickBatch = [];
let batchFlushTimer = null;
let isInitialized = false;

function getCssSelector(el) {
  if (!el || el.nodeType !== 1) return "unknown";
  if (el === document.body) return "body";

  const parts = [];
  let current = el;

  while (current && current !== document.body && current.nodeType === 1 && parts.length < 4) {
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part += "#" + current.id.replace(/[^\w-]/g, "_");
      parts.unshift(part);
      break;
    }

    const classes = Array.from(current.classList || []).slice(0, 2).join(".");
    if (classes) part += "." + classes;

    parts.unshift(part);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function getElementText(el) {
  if (!el) return "";

  const text = el.innerText || el.textContent || "";
  return text.trim().slice(0, 100);
}

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

function buildClickPayload(event) {
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
    element_selector: getCssSelector(event.target),
    element_text: getElementText(event.target),
    timestamp: new Date().toISOString(),
  };
}

async function flushClickBatch() {
  if (clickBatch.length === 0) {
    return;
  }

  const batch = [...clickBatch];
  clickBatch = [];

  try {
    try {
      const response = await fetch(`${BASE_URL}/api/heatmap/click`, {
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
    console.error("Failed to flush click batch:", error);
    clickBatch = batch;
  }
}

function flushClickBatchOnUnload() {
  if (clickBatch.length === 0 || !navigator.sendBeacon) {
    return;
  }

  const payload = JSON.stringify({ events: clickBatch });
  navigator.sendBeacon(
    `${BASE_URL}/api/heatmap/click`,
    new Blob([payload], { type: "application/json" })
  );
  clickBatch = [];
}

function handleClickCapture(event) {
  try {
    clickBatch.push(buildClickPayload(event));

    if (clickBatch.length >= BATCH_MAX_EVENTS) {
      clearTimeout(batchFlushTimer);
      batchFlushTimer = null;
      void flushClickBatch();
      return;
    }

    if (!batchFlushTimer) {
      batchFlushTimer = setTimeout(() => {
        void flushClickBatch();
        batchFlushTimer = null;
      }, BATCH_FLUSH_INTERVAL_MS);
    }
  } catch (error) {
    console.error("Error handling click capture:", error);
  }
}

export function initializeClickTracking() {
  if (isInitialized || typeof window === "undefined") {
    return;
  }

  document.addEventListener("click", handleClickCapture, true);
  window.addEventListener("beforeunload", flushClickBatchOnUnload);
  isInitialized = true;
}

export function stopClickTracking() {
  if (!isInitialized) {
    return;
  }

  document.removeEventListener("click", handleClickCapture, true);
  window.removeEventListener("beforeunload", flushClickBatchOnUnload);
  clearTimeout(batchFlushTimer);
  batchFlushTimer = null;
  void flushClickBatch();
  isInitialized = false;
}

export function isClickTrackingActive() {
  return isInitialized;
}

export function getClickBatch() {
  return [...clickBatch];
}

export function manualFlushClickBatch() {
  return flushClickBatch();
}