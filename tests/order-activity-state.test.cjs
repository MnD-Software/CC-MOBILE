require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

test("Android order tracking uses the same verified status boundary", () => {
  const root = path.resolve(__dirname, "..");
  const tracking = fs.readFileSync(
    path.join(root, "src", "native", "order-tracking-notification.ts"),
    "utf8",
  );
  const control = fs.readFileSync(
    path.join(root, "src", "native", "OrderActivityControl.tsx"),
    "utf8",
  );
  const routes = fs.readFileSync(
    path.join(root, "src", "native", "notifications.ts"),
    "utf8",
  );

  assert.match(tracking, /ANDROID_ORDER_TRACKING_CHANNEL = "order-tracking"/);
  assert.match(tracking, /orderActivityState\(snapshot\.status\)/);
  assert.match(tracking, /state\.terminal/);
  assert.match(tracking, /Updated \$\{formatUpdatedAt\(snapshot\.checkedAt\)\}/);
  assert.match(tracking, /sound: false/);
  assert.match(tracking, /orderId: snapshot\.id/);
  assert.match(control, /startAndroidOrderTracking/);
  assert.match(control, /syncAndroidOrderTracking/);
  assert.match(routes, /cakeCityOrderTracking===true/);
});
