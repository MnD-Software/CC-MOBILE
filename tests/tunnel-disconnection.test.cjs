const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function cli(supervised = true) {
  const output = [],
    messages = [];
  const stdout = {
    write: (...args) => {
      output.push(args);
      return true;
    },
  };
  const stderr = {
    write: (...args) => {
      output.push(args);
      return false;
    },
  };
  const process = {
    env: supervised ? { CAKECITY_TUNNEL_SUPERVISOR: "1" } : {},
    platform: "linux",
    stdout,
    stderr,
    connected: true,
    send: (message) => messages.push(message),
  };
  const fakeRequire = (name) => (name === "node:path" ? path : undefined);
  fakeRequire.resolve = () => "/expo/package.json";
  vm.runInNewContext(fs.readFileSync("scripts/expo.cjs", "utf8"), {
    require: fakeRequire,
    process,
    __dirname: path.resolve("scripts"),
  });
  return { process, output, messages };
}

test("supervised CLI forwards split tunnel errors unchanged and signals recovery once", () => {
  const s = cli();
  assert.equal(s.process.stderr.write("Tunnel connection has "), false);
  assert.equal(s.messages.length, 0);
  s.process.stderr.write("been closed. Restart the dev server.\n");
  s.process.stdout.write("Tunnel connection has been closed\n");
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].type, "cakecity:tunnel-disconnected");
  assert.equal(s.output[0][0], "Tunnel connection has ");
  assert.equal(s.output[1][0], "been closed. Restart the dev server.\n");
});

test("ordinary bundle errors and unsupervised Expo do not trigger tunnel recovery", () => {
  const s = cli();
  s.process.stderr.write("Unable to resolve module\n");
  assert.equal(s.messages.length, 0);
  const live = cli(false);
  live.process.stderr.write("Tunnel connection has been closed\n");
  assert.equal(live.messages.length, 0);
});
