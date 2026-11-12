const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Expo Go tunnel launches without conflicting LAN mode or review settings", () => {
  let launch;
  const env = {
    EXPO_PUBLIC_LOCAL_REVIEW: "1",
    EXPO_PUBLIC_PURCHASE_TEST_URL: "http://localhost:8010",
    EXPO_PUBLIC_API_URL: "https://example.com",
    EXPO_PUBLIC_REVIEW_TUNNEL: "1",
    CAKECITY_REVIEW_PROXY: "1",
  };
  vm.runInNewContext(fs.readFileSync("scripts/start-go.cjs", "utf8"), {
    __dirname: path.resolve("scripts"),
    process: {
      execPath: process.execPath,
      env,
      argv: ["node", "start-go.cjs", "--tunnel", "--port", "8083"],
    },
    require: (name) =>
      name === "node:child_process"
        ? {
            spawn: (command, args, options) => {
              launch = { command, args: Array.from(args), options };
              return { on() {} };
            },
          }
        : require(name),
  });
  assert.deepEqual(launch.args, [
    path.resolve("scripts/expo.cjs"),
    "start",
    "--go",
    "--tunnel",
    "--port",
    "8083",
  ]);
  assert.equal(launch.options.env.EXPO_PUBLIC_LOCAL_REVIEW, undefined);
  assert.equal(launch.options.env.EXPO_PUBLIC_PURCHASE_TEST_URL, undefined);
  assert.equal(launch.options.env.EXPO_PUBLIC_REVIEW_TUNNEL, undefined);
  assert.equal(launch.options.env.CAKECITY_REVIEW_PROXY, undefined);
  assert.equal(launch.options.env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_API_URL);
  assert.equal(env.EXPO_PUBLIC_LOCAL_REVIEW, "1");
});
