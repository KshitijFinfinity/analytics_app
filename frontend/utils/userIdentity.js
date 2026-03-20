const AUTH_STORAGE_KEYS = {
  user: "fin_user",
  auth: "fin_auth",
};

const USER_ID_KEY = "user_id";

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function getAuthenticatedUserEmail() {
  if (typeof window === "undefined") return "";

  const isAuthenticated = window.localStorage.getItem(AUTH_STORAGE_KEYS.auth) === "true";
  if (!isAuthenticated) return "";

  const storedUser = safeParse(window.localStorage.getItem(AUTH_STORAGE_KEYS.user));
  return normalizeEmail(storedUser?.email);
}

export function syncUserIdWithAuthenticatedEmail(explicitEmail) {
  if (typeof window === "undefined") return "";

  const email = normalizeEmail(explicitEmail) || getAuthenticatedUserEmail();
  if (!email) return window.localStorage.getItem(USER_ID_KEY) || "";

  window.localStorage.setItem(USER_ID_KEY, email);
  return email;
}

export function getStoredUserId() {
  if (typeof window === "undefined") return "";

  return syncUserIdWithAuthenticatedEmail() || window.localStorage.getItem(USER_ID_KEY) || "";
}
