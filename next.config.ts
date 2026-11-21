import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/node-only packages the bundler must leave alone.
  serverExternalPackages: ["better-sqlite3", "puppeteer", "pdf-parse", "mammoth", "archiver"],
};

export default nextConfig;
