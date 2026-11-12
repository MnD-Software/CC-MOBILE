const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function session(existing = false, failBackend = false) {
  const launches = [],
    killed = [],
    signals = {},
    files = [];
  let checks = 0;
  const fakeRequire = (name) => {
    if (name === "node:path") return path;
    if (name === "node:fs")
      return { writeFileSync: (...args) => files.push(args) };
    if (name === "qr") return { toQR: () => [true] };
    if (name === "node:child_process")
      return {
        spawn: (command, args, options) => {
          const handlers = {};
          const child = {
            pid: 100 + launches.length,
            exitCode: null,
            on: (name, callback) => {
              handlers[name] = callback;
            },
          };
          launches.push({ command, args: Array.from(args), options, child });
          if (failBackend && args.includes("--api-only"))
            setImmediate(() => handlers.error(new Error("Port occupied")));
          return child;
        },
        spawnSync: (command, args) =>
          killed.push({ command, args: Array.from(args) }),
      };
    throw new Error(name);
  };
  fakeRequire.resolve = (name) =>
    name === "expo/package.json"
      ? path.resolve("node_modules/expo/package.json")
      : "qr";
  const state = {
    env: {},
    execPath: process.execPath,
    platform: "win32",
    argv: ["node", "start-go-review.cjs"],
    on: (name, callback) => {
      signals[name] = callback;
    },
  };
  vm.runInNewContext(fs.readFileSync("scripts/start-go-review.cjs", "utf8"), {
    __dirname: path.resolve("scripts"),
    require: fakeRequire,
    process: state,
    console: { log() {}, error() {} },
    AbortSignal,
    setTimeout: (callback) => setTimeout(callback, 1),
    fetch: async (url) =>
      url.includes("local-preview/status")
        ? {
            ok: true,
            json: async () => ({
                local_preview: !failBackend && (existing || ++checks > 1),
              live_integrations: false,
            }),
          }
        : {
            ok: true,
            json: async () => ({
              extra: { expoClient: { hostUri: "review.expo.app" } },
            }),
          },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { launches, killed, signals, files, state };
}
test("one command starts the isolated API before Metro and saves the current QR", async () => {
  const s = await session();
  assert.equal(s.launches.length, 2);
  assert.ok(s.launches[0].args.includes("--api-only"));
  assert.ok(s.launches[1].args.includes("--tunnel"));
  assert.equal(s.launches[1].options.env.EXPO_PUBLIC_REVIEW_TUNNEL, "1");
  assert.ok(s.files.some(([name]) => name.endsWith("EXPO-GO-REVIEW-QR.svg")));
  s.signals.SIGINT();
  assert.equal(s.killed.length, 2);
  s.signals.SIGINT();
  assert.equal(s.killed.length, 2);
});
test("reusing an existing isolated API does not stop someone else's backend", async () => {
  const s = await session(true);
  assert.equal(s.launches.length, 1);
  assert.ok(s.launches[0].args.includes("--tunnel"));
  s.signals.SIGTERM();
  assert.equal(s.killed.length, 1);
});
test("backend startup failure prevents an orphaned Metro session", async () => {
  const s = await session(false, true);
  assert.equal(s.launches.length, 1);
  assert.equal(s.state.exitCode, 1);
});
