require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { orderActivityState } = require("../src/native/order-activity-state.ts");

test("Live Activity does not turn payment processing into invented kitchen progress", () => {
  assert.equal(orderActivityState("processing").label, "Order confirmed");
  assert.equal(orderActivityState("pending").label, "Awaiting payment");
  assert.equal(orderActivityState("baking").compact, "Baking");
  assert.equal(orderActivityState("quality-check"), null);
});
test("Live Activity normalises delivery status and ends for all terminal outcomes", () => {
  assert.equal(orderActivityState("OUT_FOR_DELIVERY").compact, "On the way");
  for (const status of [
    "completed",
    "delivered",
    "cancelled",
    "canceled",
    "refunded",
    "failed",
  ]) {
    assert.equal(orderActivityState(status).terminal, true, status);
  }
  assert.equal(orderActivityState("completed").label, "Order complete");
  assert.equal(orderActivityState("on_hold").terminal, false);
});
