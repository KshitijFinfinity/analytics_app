
const BASE_URL = "https://analyticsapp2-production.up.railway.app";
const GET_CACHE_TTL_MS = 15000;
const getResponseCache = new Map();

function buildGetCacheKey(path, options) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") return null;

  if (options.skipCache === true) return null;
  if (String(options.cache || "").toLowerCase() === "no-store") return null;

  if (options.body != null) return null;

  const headers = options.headers ? JSON.stringify(options.headers) : "";
  return `${method}:${path}:${headers}`;
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchAnalytics(path, options = {}) {
  if (options.skipCache === true || String(options.cache || "").toLowerCase() === "no-store") {
    const cacheKeyToDelete = `GET:${path}:${options.headers ? JSON.stringify(options.headers) : ""}`;
    getResponseCache.delete(cacheKeyToDelete);
  }

  const cacheKey = buildGetCacheKey(path, options);
  if (cacheKey) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GET_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const timeout = Number(options.timeout || 10000);
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timeoutId;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${BASE_URL}/api${path}`, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = new Error(`Server returned status ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (cacheKey) {
        getResponseCache.set(cacheKey, { data, timestamp: Date.now() });
      }
      return data;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
    if (attempt < 1) {
      await sleep(500);
    }
  }
  throw lastError || new Error("Could not reach backend server");
}

export function toQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  return query.toString();
}
