const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Generated exports and downloaded APKs are never source files. Excluding them
// prevents repeated OneDrive scans and keeps release bundles out of dev caches.
const generated = ["artifacts", "dist", "downloads", "backend/.venv"].map(
  (folder) => {
    const absolute = path
      .resolve(__dirname, folder)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${absolute}(?:[/\\\\]|$)`);
  },
);
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...generated,
];
module.exports = config;
