require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("track order button has a steady status dot, not a pulsing halo", () => {
  const source = fs.readFileSync("src/features/commerce/TrackOrderAction.tsx", "utf8");
  // The only animated element left is the arrow nudge; no animated opacity halo.
  assert.equal((source.match(/<Animated\.View/g) || []).length, 1);
  assert.doesNotMatch(source, /opacity:\s*motion\.interpolate/);
  assert.match(source, /translateX:\s*motion\.interpolate/);
});
