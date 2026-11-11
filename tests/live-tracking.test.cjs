require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  visibleRiderPoint,
  tripStageLabel,
} = require("../src/features/commerce/live-tracking.ts");
const {
  shouldRememberProduct,
} = require("../src/features/commerce/recently-viewed.ts");
test("viewing history requires a visible matching product, excluding retained and prefetched screens", () => {
  const product = { id: 12, slug: "chocolate" };
  assert.equal(shouldRememberProduct(false, "chocolate", product), false);
  assert.equal(shouldRememberProduct(true, "vanilla", product), false);
  assert.equal(shouldRememberProduct(true, "12", product), true);
  assert.equal(shouldRememberProduct(true, "chocolate", product), true);
});
test("rider markers become stale and expire even when subsequent network polls fail", () => {
  const now = Date.now();
  const point = {
    latitude: -1.2,
    longitude: 36.8,
    accuracy: 12,
    recorded_at: new Date(now).toISOString(),
    stale: false,
  };
  assert.equal(visibleRiderPoint(point, now).stale, false);
  assert.equal(visibleRiderPoint(point, now + 91_000).stale, true);
  assert.equal(visibleRiderPoint(point, now + 901_000), null);
  assert.equal(
    visibleRiderPoint({ ...point, recorded_at: "invalid" }, now),
    null,
  );
  assert.equal(visibleRiderPoint(null, now), null);
  assert.equal(tripStageLabel("collected"), "Collected from the kitchen");
  assert.equal(tripStageLabel("in_transit"), "On the way");
});
