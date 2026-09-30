require("./register.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { orderJourney } = require("../src/features/commerce/order-journey.ts");

test("processing only advances the order through its authoritative preparation state", () => {
  const journey = orderJourney("processing");

  assert.deepEqual(
    journey.slice(0, 3).map(({ id, state }) => ({ id, state })),
    [
      { id: "received", state: "complete" },
      { id: "payment-confirmed", state: "complete" },
      { id: "preparing", state: "current" },
    ],
  );
  assert.equal(journey.find((step) => step.id === "baking")?.state, "upcoming");
});

test("explicit kitchen and delivery statuses advance only the reported journey stage", () => {
  const baking = orderJourney("baking");
  assert.equal(baking.find((step) => step.id === "baking")?.state, "current");
  assert.equal(
    baking.find((step) => step.id === "decorating")?.state,
    "upcoming",
  );

  const delivery = orderJourney("out for delivery");
  assert.equal(
    delivery.find((step) => step.id === "out-for-delivery")?.state,
    "current",
  );
  assert.equal(
    delivery.find((step) => step.id === "delivered")?.state,
    "upcoming",
  );
});

test("unknown and blocked states do not fabricate kitchen progress", () => {
  const unknown = orderJourney("quality-check");
  assert.deepEqual(
    unknown.map(({ id, state }) => ({ id, state })),
    [
      { id: "received", state: "complete" },
      { id: "outcome", state: "current" },
    ],
  );

  const held = orderJourney("on-hold");
  assert.deepEqual(
    held.map(({ id, state }) => ({ id, state })),
    [
      { id: "received", state: "complete" },
      { id: "outcome", state: "blocked" },
    ],
  );
});
