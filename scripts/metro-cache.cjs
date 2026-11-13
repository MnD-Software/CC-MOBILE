const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");

function cacheDirectory(projectRoot, mode, runtime = process.versions) {
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        path.resolve(projectRoot),
        runtime.node,
        runtime.v8,
        runtime.bun || "",
        mode,
      ]),
    )
    .digest("hex");
  return path.join(os.tmpdir(), "cakecity-metro", identity);
}

function recoverSnapshot(manager, warn = console.warn) {
  const read = manager.read.bind(manager);
  const write = manager.write.bind(manager);
  let recovered = false;
  manager.read = async () => {
    try {
      return await read();
    } catch (error) {
      // Only V8 snapshot decoding failures are disposable cache misses. Keep
      // permission, disk and other unexpected failures visible to Metro.
      if (
        !/Unable to deserialize|Invalid or unsupported version/i.test(
          error?.message || "",
        )
      ) {
        throw error;
      }
      recovered = true;
      warn(
        "[Metro] Rebuilding an unreadable file cache. Your app data is unchanged.",
      );
      return null;
    }
  };
  manager.write = (snapshot, options) =>
    write(snapshot, {
      ...options,
      changedSinceCacheRead: recovered || options.changedSinceCacheRead,
    });
  return manager;
}

function configureMetroCache(config, projectRoot) {
  const { DiskCacheManager } = require("metro-file-map");
  // Export and development processes must not overwrite each other's snapshots.
  const mode = process.argv.includes("export") ? "export" : "development";
  const directory = cacheDirectory(projectRoot, mode);
  fs.mkdirSync(directory, { recursive: true });
  config.fileMapCacheDirectory = directory;
  const { enabled, ...autoSave } = config.watcher.unstable_autoSaveCache || {};
  const ci = process.env.CI;
  const watching = mode !== "export" && !(ci && ci !== "0" && ci !== "false");
  config.unstable_fileMapCacheManagerFactory = (params) =>
    recoverSnapshot(
      new DiskCacheManager(params, {
        cacheDirectory: directory,
        autoSave: watching && enabled ? autoSave : false,
      }),
    );
}

module.exports = { cacheDirectory, configureMetroCache, recoverSnapshot };
