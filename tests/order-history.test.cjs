require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isPastOrder,
  orderHistoryAction,
} = require("../src/features/commerce/order-history.ts");
test("completed, cancelled and reversed orders show View instead of live tracking", () => {
  for (const order of [
    { status: "completed", payment_state: "completed" },
    { status: "cancelled", payment_state: "cancelled" },
    { status: "paid", payment_state: "reversed" },
  ]) {
    assert.equal(isPastOrder(order), true);
    assert.equal(orderHistoryAction(order), "View order");
  }
  assert.equal(
    orderHistoryAction({ status: "preparing", payment_state: "completed" }),
    "Track order",
  );
  assert.equal(
    orderHistoryAction({
      status: "awaiting_payment",
      payment_state: "pending",
    }),
    "View order",
  );
});
