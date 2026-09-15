const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, "app");
const output = path.join(root, ".expo", "types");
fs.mkdirSync(output, { recursive: true });
const cli = require.resolve("@expo/cli/package.json", {
  paths: [require.resolve("expo/package.json")],
});
const generator = require.resolve("@expo/router-server/build/typed-routes", {
  paths: [cli],
});
require(generator).regenerateDeclarations(output, {});
