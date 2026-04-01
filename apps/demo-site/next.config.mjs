import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("./", import.meta.url));
const configuredBasePath = (process.env.NEXT_BASE_PATH || "").trim();
const basePath = configuredBasePath
  ? configuredBasePath.startsWith("/")
    ? configuredBasePath
    : `/${configuredBasePath}`
  : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  reactStrictMode: true,
  turbopack: {
    root: frontendRoot,
  },
  async redirects() {
    return [
      {
        source: "/analytics-dashboard",
        destination: "https://your-production-dashboard-url.com/",
        permanent: false,
      },
      {
        source: "/charts-analysis",
        destination: "https://your-production-dashboard-url.com/charts-analysis",
        permanent: false,
      },
      {
        source: "/funnels",
        destination: "https://your-production-dashboard-url.com/funnels",
        permanent: false,
      },
      {
        source: "/session-replays",
        destination: "https://your-production-dashboard-url.com/session-replays",
        permanent: false,
      },
      {
        source: "/errors",
        destination: "https://your-production-dashboard-url.com/errors",
        permanent: false,
      },
      {
        source: "/settings",
        destination: "https://your-production-dashboard-url.com/settings",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
