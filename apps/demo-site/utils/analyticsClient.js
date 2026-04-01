import { getStoredUserId } from "@/utils/userIdentity";

const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const TRACK_ENDPOINT = `${BASE_URL}/api/track`;
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

    try {
      const response = await fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Analytics track failed: backend error");
      }
    } catch (err) {
      console.error("Analytics track failed:", err);
    }
  },
};

export default analytics;
