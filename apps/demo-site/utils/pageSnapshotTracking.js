import { getOrCreateSessionId, getOrCreateUserId } from "./sessionMonitoring";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const SNAPSHOT_PATH = "/api/heatmap/snapshot";
const CAPTURE_DEBOUNCE_MS = 1200;
const MIN_CAPTURE_INTERVAL_MS = 8000;

let captureTimer = null;
let isInitialized = false;
let isCapturing = false;
let lastCaptureAt = 0;
let lastFingerprint = "";
let onWindowLoad = null;
let onWindowResize = null;

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

function absolutizeUrl(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    return new URL(trimmed, window.location.href).toString();
  } catch {
    return trimmed;
  }
}

function absolutizeSrcSet(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  return value
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) {
        return trimmed;
      }

      const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
      const resolvedUrl = absolutizeUrl(urlPart);
      return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
    })
    .join(", ");
}

function syncFormState(sourceRoot, cloneRoot) {
  const sourceFields = sourceRoot.querySelectorAll("input, textarea, select");
  const cloneFields = cloneRoot.querySelectorAll("input, textarea, select");

  sourceFields.forEach((field, index) => {
    const clone = cloneFields[index];
    if (!clone) {
      return;
    }

    if (field instanceof HTMLInputElement) {
      if (field.type === "checkbox" || field.type === "radio") {
        if (field.checked) {
          clone.setAttribute("checked", "checked");
        } else {
          clone.removeAttribute("checked");
        }
      } else {
        clone.setAttribute("value", field.value);
      }
    }

    if (field instanceof HTMLTextAreaElement) {
      clone.textContent = field.value;
    }

    if (field instanceof HTMLSelectElement) {
      Array.from(clone.options).forEach((option, optionIndex) => {
        option.selected = field.options[optionIndex]?.selected || false;
      });
    }
  });
}

function sanitizeSnapshotHtml() {
  const documentClone = document.documentElement.cloneNode(true);
  syncFormState(document.documentElement, documentClone);

  documentClone.querySelectorAll("script, noscript, iframe, object, embed").forEach((node) => {
    node.remove();
  });

  documentClone.querySelectorAll("[src], [href], [poster], [action], [srcset]").forEach((node) => {
    if (node.hasAttribute("src")) {
      node.setAttribute("src", absolutizeUrl(node.getAttribute("src")));
    }
    if (node.hasAttribute("href")) {
      node.setAttribute("href", absolutizeUrl(node.getAttribute("href")));
    }
    if (node.hasAttribute("poster")) {
      node.setAttribute("poster", absolutizeUrl(node.getAttribute("poster")));
    }
    if (node.hasAttribute("action")) {
      node.setAttribute("action", absolutizeUrl(node.getAttribute("action")));
    }
    if (node.hasAttribute("srcset")) {
      node.setAttribute("srcset", absolutizeSrcSet(node.getAttribute("srcset")));
    }
  });

  documentClone.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name === "src" || name === "action") && /^javascript:/i.test(value.trim())) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  const head = documentClone.querySelector("head");
  if (head && !head.querySelector("base")) {
    const base = document.createElement("base");
    base.setAttribute("href", `${window.location.origin}/`);
    head.prepend(base);
  }

  return `<!DOCTYPE html>${documentClone.outerHTML}`;
}

async function sendSnapshot(payload) {
  try {
    const response = await fetch(`${BASE_URL}${SNAPSHOT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (response.ok) {
      return true;
    }
  } catch {}
  return false;
}

async function captureSnapshot(reason = "manual") {
  if (typeof window === "undefined" || document.hidden || isCapturing) {
    return;
  }

  const now = Date.now();
  if (now - lastCaptureAt < MIN_CAPTURE_INTERVAL_MS && reason !== "route_change") {
    return;
  }

  isCapturing = true;

  try {
    const metrics = getDocumentMetrics();
    const domSnapshot = sanitizeSnapshotHtml();
    const fingerprint = [
      window.location.pathname,
      getDeviceType(),
      metrics.documentWidth,
      metrics.documentHeight,
      domSnapshot.length,
    ].join(":");

    if (fingerprint === lastFingerprint && reason !== "route_change") {
      return;
    }

    const didSend = await sendSnapshot({
      user_id: getOrCreateUserId(),
      session_id: getOrCreateSessionId(),
      page_url: window.location.pathname,
      dom_snapshot: domSnapshot,
      viewport_width: metrics.viewportWidth,
      viewport_height: metrics.viewportHeight,
      document_width: metrics.documentWidth,
      document_height: metrics.documentHeight,
      scroll_x: metrics.scrollX,
      scroll_y: metrics.scrollY,
      device_type: getDeviceType(),
      reason,
      timestamp: new Date().toISOString(),
    });

    if (didSend) {
      lastCaptureAt = now;
      lastFingerprint = fingerprint;
    }
  } catch (error) {
    console.error("Failed to capture page snapshot:", error);
  } finally {
    isCapturing = false;
  }
}

function scheduleCapture(reason = "scheduled") {
  if (typeof window === "undefined") {
    return;
  }

  window.clearTimeout(captureTimer);
  captureTimer = window.setTimeout(() => {
    void captureSnapshot(reason);
  }, CAPTURE_DEBOUNCE_MS);
}

function handleVisibilityChange() {
  if (!document.hidden) {
    scheduleCapture("visible");
  }
}

export function capturePageSnapshot(reason = "manual") {
  scheduleCapture(reason);
}

export function initializeSnapshotTracking() {
  if (isInitialized || typeof window === "undefined") {
    return;
  }

  onWindowLoad = () => scheduleCapture("load");
  onWindowResize = () => scheduleCapture("resize");

  window.addEventListener("load", onWindowLoad, { once: true });
  window.addEventListener("resize", onWindowResize, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  isInitialized = true;
  scheduleCapture("init");
}

export function stopSnapshotTracking() {
  if (!isInitialized || typeof window === "undefined") {
    return;
  }

  window.clearTimeout(captureTimer);
  captureTimer = null;

  if (onWindowLoad) {
    window.removeEventListener("load", onWindowLoad);
    onWindowLoad = null;
  }

  if (onWindowResize) {
    window.removeEventListener("resize", onWindowResize);
    onWindowResize = null;
  }

  document.removeEventListener("visibilitychange", handleVisibilityChange);
  isInitialized = false;
}