const path = require("node:path");
require("./windows-fs.cjs");
if (process.platform === "win32") {
  const preload = path.join(__dirname, "windows-fs.cjs").replace(/\\/g, "/");
  process.env.NODE_OPTIONS = (
    (process.env.NODE_OPTIONS || "") +
    " --require=" +
    JSON.stringify(preload)
  ).trim();
}
require(
  path.join(path.dirname(require.resolve("expo/package.json")), "bin/cli"),
);
