const CONFIGURED_BACKEND_BASE = process.env.NEXT_PUBLIC_ANALYTICS_BASE;
const FALLBACK_BACKEND_BASES = [4001, 4002, 4003, 4004, 4005, 4006, 4000].map(
  (port) => `http://localhost:${port}`
);

const BACKEND_BASES = [CONFIGURED_BACKEND_BASE, ...FALLBACK_BACKEND_BASES].filter(
  (base, index, values) => Boolean(base) && values.indexOf(base) === index
);

let resolvedBackendBase = null;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchAnalytics(path, options = {}) {
  const timeout = Number(options.timeout || 10000);
  const attempts = Number(options.attempts || 2);
  const candidateBases = [resolvedBackendBase, ...BACKEND_BASES].filter(
    (base, index, values) => Boolean(base) && values.indexOf(base) === index
  );

  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const base of candidateBases) {
      let timeoutId;
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${base}/analytics${path}`, {
          ...options,
          signal: controller.signal,
        });

        if (!response.ok) {
          lastError = new Error(`Server ${base} returned status ${response.status}`);
          continue;
        }

        resolvedBackendBase = base;
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (attempt < attempts - 1) {
      await sleep(500);
    }
  }

  throw lastError || new Error("Could not reach any backend server");
}

export function toQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  return query.toString();
}
