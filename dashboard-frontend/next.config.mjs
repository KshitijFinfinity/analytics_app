import { fileURLToPath } from "node:url";

const dashboardRoot = fileURLToPath(new URL("./", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: dashboardRoot,
  },
};

export default nextConfig;
