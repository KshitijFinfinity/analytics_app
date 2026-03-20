import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("./", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: frontendRoot,
  },
  async redirects() {
    return [
      {
        source: "/analytics-dashboard",
        destination: "http://localhost:3001/",
        permanent: false,
      },
      {
        source: "/charts-analysis",
        destination: "http://localhost:3001/charts-analysis",
        permanent: false,
      },
      {
        source: "/funnels",
        destination: "http://localhost:3001/funnels",
        permanent: false,
      },
      {
        source: "/session-replays",
        destination: "http://localhost:3001/session-replays",
        permanent: false,
      },
      {
        source: "/errors",
        destination: "http://localhost:3001/errors",
        permanent: false,
      },
      {
        source: "/settings",
        destination: "http://localhost:3001/settings",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
