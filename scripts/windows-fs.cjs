// OneDrive can return a symlink Dirent for an ordinary hydrated file while
// lstat correctly identifies it. Metro and Expo Router both trust Dirents.
// Correct only that discrepancy; real links and all non-Windows reads retain
// their original behavior. This is a development-tool preload, not app code.
if (process.platform === "win32") {
  const fs = require("node:fs");
  const path = require("node:path");
  const { fileURLToPath } = require("node:url");
  const methods = [
    "isFile",
    "isDirectory",
    "isSymbolicLink",
    "isBlockDevice",
    "isCharacterDevice",
    "isFIFO",
    "isSocket",
  ];
  function normalize(directory, entries) {
    const base =
      directory instanceof URL ? fileURLToPath(directory) : String(directory);
    for (const entry of entries) {
      if (!entry?.isSymbolicLink?.()) continue;
      try {
        const stats = fs.lstatSync(
          path.join(entry.parentPath || entry.path || base, String(entry.name)),
        );
        if (!stats.isSymbolicLink()) {
          for (const method of methods)
            entry[method] = stats[method].bind(stats);
        }
      } catch {
        /* Preserve normal consumer handling if the entry disappeared. */
      }
    }
    return entries;
  }
  const readdirSync = fs.readdirSync;
  fs.readdirSync = function (directory, options) {
    return normalize(directory, readdirSync.call(this, directory, options));
  };
  const readdir = fs.readdir;
  fs.readdir = function (directory, ...args) {
    const callback = args.pop();
    return readdir.call(this, directory, ...args, (error, entries) =>
      callback(error, error ? entries : normalize(directory, entries)),
    );
  };
  const readPromise = fs.promises.readdir;
  fs.promises.readdir = async function (directory, options) {
    return normalize(
      directory,
      await readPromise.call(this, directory, options),
    );
  };
  require("node:module").syncBuiltinESMExports();
}
