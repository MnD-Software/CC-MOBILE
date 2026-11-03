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
// Normalize before the generator removes trailing /index. On Windows its
// default context supplies backslashes, which would retain an incorrect
// /information/index route in the generated navigation types.
const { requireContext } = require("expo-router/internal/testing");
const { EXPO_ROUTER_CTX_IGNORE } = require("expo-router/_ctx-shared");
const context = requireContext(
  process.env.EXPO_ROUTER_APP_ROOT,
  true,
  EXPO_ROUTER_CTX_IGNORE,
);
const routeKeys = new Map(
  context.keys().map((key) => [key.replace(/\\/g, "/"), key]),
);
const normalized = (key) => context(routeKeys.get(key) || key);
normalized.keys = () => [...routeKeys.keys()];
normalized.resolve = (key) => context.resolve(routeKeys.get(key) || key);
normalized.id = context.id;
require(generator).regenerateDeclarations(output, {}, normalized);
