import { getStoredUserId } from "@/utils/userIdentity";

const TRACK_ENDPOINT = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT || "http://localhost:4001/track";
const FALLBACK_ENDPOINTS = [
  "http://localhost:4001/track",
  "http://localhost:4002/track",
  "http://localhost:4003/track",
  "http://localhost:4004/track",
  "http://localhost:4005/track",
  "http://localhost:4006/track",
];
const PROJECT_ID = process.env.NEXT_PUBLIC_ANALYTICS_PROJECT_ID || "8b2b11d0-ad4f-4d90-b046-aacb789f2ba3";
const USER_ID_KEY = "user_id";
const SESSION_ID_KEY = "session_id";

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getUserId() {
  const existing = getStoredUserId();
  if (existing) return existing;

  const next = createId("usr");
  window.localStorage.setItem(USER_ID_KEY, next);
  return next;
}

function getSessionId() {
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const next = createId("ses");
  window.sessionStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

const analytics = {
  async track(eventName, properties = {}) {
    if (typeof window === "undefined") return;

    const payload = {
      project_id: PROJECT_ID,
      user_id: getUserId(),
      session_id: getSessionId(),
      event_name: eventName,
      page: window.location.pathname,
      properties,
      timestamp: new Date().toISOString(),
    };

    const endpoints = [TRACK_ENDPOINT, ...FALLBACK_ENDPOINTS].filter(
      (endpoint, index, list) => Boolean(endpoint) && list.indexOf(endpoint) === index
    );

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          continue;
        }

        return;
      } catch {
        continue;
      }
    }

    console.error("Analytics track failed: no backend endpoint reachable");
  },
};

export default analytics;
