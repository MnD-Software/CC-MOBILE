const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
require("./scripts/metro-cache.cjs").configureMetroCache(config, __dirname);
// Generated exports and downloaded APKs are never source files. Excluding them
// prevents repeated OneDrive scans and keeps release bundles out of dev caches.
const generated = [
  "artifacts",
  "dist",
  "downloads",
  ".venv",
  "backend/.venv",
  ".build-work",
  ".rebuild-backup",
].map((folder) => {
  const absolute = path
    .resolve(__dirname, folder)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${absolute}(?:[/\\\\]|$)`);
});
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...generated,
];
if (process.env.CAKECITY_REVIEW_PROXY === "1") {
  const { reviewApiProxy } = require("./scripts/review-api-proxy.cjs");
  const previous = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) =>
    reviewApiProxy(previous ? previous(middleware, server) : middleware);
}
module.exports = config;
