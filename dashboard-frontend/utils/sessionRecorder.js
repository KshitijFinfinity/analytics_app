const RECORD_ENDPOINT = "http://localhost:4001/session-record";
const BATCH_INTERVAL_MS = 5000;

let stopRecording = null;
let flushTimer = null;
let hasStarted = false;

function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateUserId() {
  const existing = localStorage.getItem("user_id");
  if (existing) return existing;

  const nextId = createId("user");
  localStorage.setItem("user_id", nextId);
  return nextId;
}

function getOrCreateSessionId() {
  const existing = sessionStorage.getItem("session_id");
  if (existing) return existing;

  const nextId = createId("session");
  sessionStorage.setItem("session_id", nextId);
  return nextId;
}

export function startSessionRecording() {
  if (typeof window === "undefined" || hasStarted) {
    return;
  }

  hasStarted = true;

  const userId = getOrCreateUserId();
  const sessionId = getOrCreateSessionId();
  const eventBuffer = [];

  const flushEvents = () => {
    if (!eventBuffer.length) return;

    const events = eventBuffer.splice(0, eventBuffer.length);

    fetch(RECORD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        events,
      }),
      keepalive: true,
    }).catch(() => {
      // Ignore network errors to avoid interrupting app usage.
    });
  };

  import("rrweb")
    .then(({ record }) => {
      stopRecording = record({
        emit(event) {
          eventBuffer.push(event);
        },
        // Capture enough mouse movement detail without creating excessive payload.
        sampling: {
          mousemove: 50,
        },
      });
    })
    .catch(() => {
      hasStarted = false;
    });

  flushTimer = window.setInterval(flushEvents, BATCH_INTERVAL_MS);

  const unloadHandler = () => {
    flushEvents();
  };

  window.addEventListener("beforeunload", unloadHandler);

  return () => {
    window.removeEventListener("beforeunload", unloadHandler);

    if (flushTimer) {
      window.clearInterval(flushTimer);
      flushTimer = null;
    }

    flushEvents();

    if (stopRecording) {
      stopRecording();
      stopRecording = null;
    }

    hasStarted = false;
  };
}
