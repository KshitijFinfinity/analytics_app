const ipLocationCache = Object.create(null);

function normalizeIp(rawIp) {
  const value = String(rawIp || "").trim();
  if (!value) return "";

  let ip = value.split(",")[0].trim();
  if (!ip) return "";

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }

  // Handle IPv4 values that include an origin port (e.g. 1.2.3.4:12345).
  if (ip.includes(".") && ip.includes(":")) {
    ip = ip.split(":")[0].trim();
  }

  return ip;
}

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return normalizeIp(forwardedIp || req.socket?.remoteAddress || "");
}

function isLocalOrPrivateIp(ip) {
  if (!ip) return true;

  return (
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

function emptyLocation() {
  return {
    country: null,
    city: null,
    region: null,
    timezone: null,
  };
}

async function getLocationByIp(ip) {
  if (!ip) return emptyLocation();

  if (ipLocationCache[ip]) {
    return ipLocationCache[ip];
  }

  if (isLocalOrPrivateIp(ip) || typeof fetch !== "function") {
    const fallback = emptyLocation();
    ipLocationCache[ip] = fallback;
    return fallback;
  }

  const fallback = emptyLocation();

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,regionName,timezone`
    );

    if (!response.ok) {
      ipLocationCache[ip] = fallback;
      return fallback;
    }

    const payload = await response.json();
    if (payload?.status !== "success") {
      ipLocationCache[ip] = fallback;
      return fallback;
    }

    const location = {
      country: payload.country || null,
      city: payload.city || null,
      region: payload.regionName || null,
      timezone: payload.timezone || null,
    };

    ipLocationCache[ip] = location;
    return location;
  } catch (_error) {
    ipLocationCache[ip] = fallback;
    return fallback;
  }
}

module.exports = {
  getRequestIp,
  getLocationByIp,
};
