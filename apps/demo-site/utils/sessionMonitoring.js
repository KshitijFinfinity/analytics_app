import { getStoredUserId } from "@/utils/userIdentity";

const RECORD_PATH = "/session-record";
const ERROR_PATH = "/frontend-error";
const DEAD_CLICK_PATH = "/dead-click";
const DEAD_CLICK_DELAY_MS = 1000;
const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const RRWEB_CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/rrweb@1/dist/record/rrweb-record.min.js",
  "https://unpkg.com/rrweb@1/dist/record/rrweb-record.min.js",
];
const BATCH_INTERVAL_MS = 5000;
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVITY_CHECK_INTERVAL_MS = 10000;
const MAX_EVENTS_PER_SESSION = 20000;

let hasStarted = false;
let stopRecording = null;
let flushTimer = null;
let onUnloadHandler = null;
let onWindowErrorHandler = null;
let onUnhandledRejectionHandler = null;
let restoreConsoleError = null;
let rrwebRecordFn = null;
let isFlushing = false;
let durationTimer = null;
let inactivityCheckTimer = null;
let activityListenerCleanup = null;
let stopDeadClickDetection = null;

function getGlobalRecordFn() {
  if (typeof window === "undefined") return null;
  return window.rrwebRecord || window.__analyticsRrwebRecord || null;
}

function loadRecorderScriptFromUrls(urls, index = 0) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("Recorder script loading is only available in browser."));
      return;
    }

    const existing = getGlobalRecordFn();
    if (typeof existing === "function") {
      resolve(existing);
      return;
    }

    if (index >= urls.length) {
      reject(new Error("Failed to load rrweb recorder from all configured sources."));
      return;
    }

    const src = String(urls[index] || "").trim();
    if (!src) {
      loadRecorderScriptFromUrls(urls, index + 1).then(resolve).catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";

    script.onload = () => {
      const recordFn = getGlobalRecordFn();
      if (typeof recordFn === "function") {
        resolve(recordFn);
        return;
      }

      loadRecorderScriptFromUrls(urls, index + 1).then(resolve).catch(reject);
    };

    script.onerror = () => {
      loadRecorderScriptFromUrls(urls, index + 1).then(resolve).catch(reject);
    };

    document.head.appendChild(script);
  });
}

async function resolveRecorderFn() {
  const globalRecord = getGlobalRecordFn();
  if (typeof globalRecord === "function") {
    return globalRecord;
  }

  return loadRecorderScriptFromUrls(RRWEB_CDN_URLS);
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateUserId() {
  const existing = getStoredUserId();
  if (existing) return existing;

  const generated = createId("user");
  window.localStorage.setItem("user_id", generated);
  return generated;
}

export function getOrCreateSessionId() {
  const existing = window.sessionStorage.getItem("session_id");
  if (existing) return existing;

  const generated = createId("session");
  window.sessionStorage.setItem("session_id", generated);
  return generated;
}

function startFreshSession() {
  const generated = createId("session");
  window.sessionStorage.setItem("session_id", generated);
  return generated;
}

async function postWithFallback(path, payload, options = {}) {
  const keepalive = Boolean(options.keepalive);
  try {
    const response = await fetch(`${BASE_URL}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive,
    });
    if (!response.ok) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
  return parts.join(" > ") || (el.tagName ? el.tagName.toLowerCase() : "unknown");
}

function startDeadClickDetection(sessionId, userId) {
  let mutationCount = 0;
  let navigationCount = 0;
  let networkCount = 0;

  const observer = new MutationObserver(() => {
    mutationCount++;
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  const markNavigation = () => {
    navigationCount++;
  };
  window.addEventListener("popstate", markNavigation, { passive: true });
  window.addEventListener("hashchange", markNavigation, { passive: true });

  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);
  history.pushState = function (...args) {
    markNavigation();
    return origPushState(...args);
  };
  history.replaceState = function (...args) {
    markNavigation();
    return origReplaceState(...args);
  };

  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function (...args) {
      const url = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
      if (!BACKEND_BASES.some((base) => url.startsWith(base))) networkCount++;
      return origFetch.apply(this, args);
    };
  }

  const origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const urlStr = String(url || "");
    if (!BACKEND_BASES.some((base) => urlStr.startsWith(base))) networkCount++;
    return origXHROpen.call(this, method, url, ...rest);
  };

  const handleClick = (e) => {
    const clickX = Math.round(e.clientX);
    const clickY = Math.round(e.clientY);
    const element = getCssSelector(e.target);
    const page = window.location.pathname;
    const timestamp = new Date().toISOString();
    const snapMutation = mutationCount;
    const snapNavigation = navigationCount;
    const snapNetwork = networkCount;

    window.setTimeout(() => {
      if (
        mutationCount === snapMutation &&
        navigationCount === snapNavigation &&
        networkCount === snapNetwork
      ) {
        postWithFallback(DEAD_CLICK_PATH, {
          session_id: sessionId,
          user_id: userId,
          page,
          element,
          timestamp,
          x: clickX,
          y: clickY,
        });
      }
    }, DEAD_CLICK_DELAY_MS);
  };

  document.addEventListener("click", handleClick, true);

  return function stopDeadClickDetectionFn() {
    observer.disconnect();
    window.removeEventListener("popstate", markNavigation);
    window.removeEventListener("hashchange", markNavigation);
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
    if (origFetch) window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origXHROpen;
    document.removeEventListener("click", handleClick, true);
  };
}

export function startSessionRecording() {
  if (typeof window === "undefined" || hasStarted) return undefined;

  hasStarted = true;
  const userId = getOrCreateUserId();
  const sessionId = startFreshSession();
  const sessionStartedAtMs = Date.now();
  const startTimestamp = new Date(sessionStartedAtMs).toISOString();
  const eventBuffer = [];
  let totalCapturedEvents = 0;
  let isSessionEnding = false;
  let lastActivityAtMs = sessionStartedAtMs;
  let sessionEndedAtIso = null;

  const markActivity = () => {
    lastActivityAtMs = Date.now();
  };

  const registerActivityListeners = () => {
    const events = ["mousemove", "click", "scroll", "keydown"];
    const handler = () => markActivity();

    for (const eventName of events) {
      window.addEventListener(eventName, handler, { passive: true });
    }

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, handler);
      }
    };
  };

  const cleanupLifecycle = () => {
    if (flushTimer) {
      window.clearInterval(flushTimer);
      flushTimer = null;
    }

    if (durationTimer) {
      window.clearTimeout(durationTimer);
      durationTimer = null;
    }

    if (inactivityCheckTimer) {
      window.clearInterval(inactivityCheckTimer);
      inactivityCheckTimer = null;
    }

    if (activityListenerCleanup) {
      activityListenerCleanup();
      activityListenerCleanup = null;
    }

    if (stopDeadClickDetection) {
      stopDeadClickDetection();
      stopDeadClickDetection = null;
    }
  };

  const flushEvents = async (options = {}) => {
    const keepalive = Boolean(options.keepalive);
    const forceFinal = Boolean(options.forceFinal);
    const endReason = forceFinal ? options.endReason || null : null;

    if (isFlushing) return;
    if (!eventBuffer.length && !forceFinal) return;

    isFlushing = true;
    const now = new Date().toISOString();
    const events = eventBuffer.splice(0, eventBuffer.length);
    const finalTimestamp = sessionEndedAtIso || (forceFinal ? now : null);

    const payload = {
      user_id: getOrCreateUserId(),
      session_id: sessionId,
      events,
      timestamp: now,
      start_timestamp: startTimestamp,
      end_timestamp: finalTimestamp,
      session_finished: Boolean(forceFinal),
      end_reason: endReason,
    };

    const didSend = await postWithFallback(RECORD_PATH, payload, { keepalive });

    if (!didSend && !forceFinal) {
      eventBuffer.unshift(...events);
    }

    isFlushing = false;
  };

  const endSession = async (reason, options = {}) => {
    if (isSessionEnding) return;
    isSessionEnding = true;
    sessionEndedAtIso = new Date().toISOString();

    cleanupLifecycle();

    if (stopRecording) {
      stopRecording();
      stopRecording = null;
    }

    // Persist remaining events and explicit end-of-session marker.
    await flushEvents({ keepalive: Boolean(options.keepalive), forceFinal: true, endReason: reason });

    if (onUnloadHandler) window.removeEventListener("beforeunload", onUnloadHandler);
    if (onWindowErrorHandler) window.removeEventListener("error", onWindowErrorHandler);
    if (onUnhandledRejectionHandler) window.removeEventListener("unhandledrejection", onUnhandledRejectionHandler);
    if (restoreConsoleError) restoreConsoleError();

    hasStarted = false;
    rrwebRecordFn = null;
  };

  const sendError = async ({ message, stack }) => {
    await postWithFallback(ERROR_PATH, {
      user_id: getOrCreateUserId(),
      session_id: sessionId,
      message: String(message || "Unknown frontend error"),
      stack: stack || null,
      page: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  };

  resolveRecorderFn()
    .then((record) => {
      if (typeof record !== "function") {
        throw new Error("rrweb record() function not available");
      }

      rrwebRecordFn = record;
      stopRecording = record({
        emit(event) {
          if (isSessionEnding) return;

          eventBuffer.push(event);
          totalCapturedEvents += 1;

          if (totalCapturedEvents > MAX_EVENTS_PER_SESSION) {
            void endSession("event_limit_reached", { keepalive: false });
            return;
          }

          if (Number(event?.type) === 2) {
            flushEvents({ keepalive: false });
          }
        },
        // Ensure replay can always reconstruct DOM by emitting periodic full snapshots.
        checkoutEveryNms: 15000,
        sampling: {
          mousemove: 50,
        },
      });

      if (typeof record.takeFullSnapshot === "function") {
        record.takeFullSnapshot();
      }

      stopDeadClickDetection = startDeadClickDetection(sessionId, userId);
    })
    .catch(() => {
      // Persist a heartbeat so session visibility is not lost when rrweb is unavailable.
      void postWithFallback(RECORD_PATH, {
        user_id: getOrCreateUserId(),
        session_id: sessionId,
        events: [],
        timestamp: new Date().toISOString(),
        start_timestamp: startTimestamp,
        end_timestamp: null,
        session_finished: false,
        end_reason: "rrweb_unavailable",
      });

      cleanupLifecycle();
      hasStarted = false;
    });

  flushTimer = window.setInterval(() => {
    flushEvents({ keepalive: false });
  }, BATCH_INTERVAL_MS);

  durationTimer = window.setTimeout(() => {
    void endSession("max_duration_reached", { keepalive: false });
  }, MAX_SESSION_DURATION_MS);

  inactivityCheckTimer = window.setInterval(() => {
    const inactiveForMs = Date.now() - lastActivityAtMs;
    if (inactiveForMs >= INACTIVITY_TIMEOUT_MS) {
      void endSession("inactivity_timeout", { keepalive: false });
    }
  }, INACTIVITY_CHECK_INTERVAL_MS);

  activityListenerCleanup = registerActivityListeners();

  onUnloadHandler = () => {
    void endSession("page_exit", { keepalive: true });
  };

  onWindowErrorHandler = (event) => {
    sendError({
      message: event?.message,
      stack: event?.error?.stack,
    });
  };

  onUnhandledRejectionHandler = (event) => {
    const reason = event?.reason;
    sendError({
      message: reason?.message || String(reason || "Unhandled promise rejection"),
      stack: reason?.stack,
    });
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    try {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      sendError({ message, stack: null });
    } catch {}

    originalConsoleError(...args);
  };

  restoreConsoleError = () => {
    console.error = originalConsoleError;
  };

  window.addEventListener("beforeunload", onUnloadHandler);
  window.addEventListener("error", onWindowErrorHandler);
  window.addEventListener("unhandledrejection", onUnhandledRejectionHandler);

  return () => {
    void endSession("recorder_stopped", { keepalive: true });
  };
}

export function trackNavigationForReplay(url) {
  if (!rrwebRecordFn || typeof rrwebRecordFn.addCustomEvent !== "function") return;
  rrwebRecordFn.addCustomEvent("navigation", {
    url,
    path: window.location.pathname,
  });
}
