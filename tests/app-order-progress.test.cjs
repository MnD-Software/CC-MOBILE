const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function load(path) {
  const ctx = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    ctx,
  );
  return ctx.exports;
}
const success = load("src/features/commerce/checkout-success.ts");
const { orderTracking } = load("src/features/commerce/order-tracking.ts");
test("celebrations require verified positive payment and paid timestamp", () => {
  for (const payment_state of [
    "pending",
    "creating",
    "uncertain",
    "failed",
    "reversed",
    "not_started",
  ])
    assert.equal(
      success.isVerifiedPayment({
        payment_state,
        paid_at: "2026-11-03",
        total_minor: 250000,
      }),
      false,
    );
  assert.equal(
    success.isVerifiedPayment({
      payment_state: "completed",
      paid_at: null,
      total_minor: 250000,
    }),
    false,
  );
  assert.equal(
    success.isVerifiedPayment({
      payment_state: "completed",
      paid_at: "2026-11-03",
      total_minor: 0,
    }),
    false,
  );
  assert.equal(
    success.isVerifiedPayment({
      payment_state: "completed",
      paid_at: "2026-11-03",
      total_minor: 250000,
    }),
    true,
  );
});
test("larger and fractional cake weights survive variation selection", () => {
  for (const weight of ["0.5", "1", "1.5", "2", "3", "5", "10", "20"])
    assert.equal(
      success.selectionWeight(`Cake Size: ${weight} kg`),
      `${weight}kg`,
    );
  assert.equal(success.selectionWeight("Standard slice", "1kg"), "1kg");
});
test("tracking uses recorded events and distinguishes pickup and delivery", () => {
  const order = {
    created_at: "received",
    paid_at: null,
    snapshot: { checkout: { fulfilment: "pickup" } },
    events: [],
  };
  let steps = orderTracking(order);
  assert.equal(steps.length, 5);
  assert.equal(steps[1].at, null);
  assert.equal(steps[2].at, undefined);
  assert.equal(steps[4].label, "Collected");
  order.snapshot.checkout.fulfilment = "delivery";
  order.events = [
    { kind: "fulfilment_out_for_delivery", created_at: "dispatch" },
  ];
  steps = orderTracking(order);
  assert.equal(steps.length, 6);
  assert.equal(steps[4].at, "dispatch");
  assert.equal(steps[5].label, "Delivered");
});

test("pending payment cannot settle a bag or trigger a success celebration", async () => {
  const effects = [],
    settled = [],
    celebrations = [],
    invalidations = [];
  const ctx = {
    exports: {},
    require(name) {
      if (name === "react")
        return {
          useCallback: (f) => f,
          useRef: (v) => ({ current: v }),
          useState: () => [false, (v) => celebrations.push(v)],
          useEffect: (f) => effects.push(f),
        };
      if (name === "@tanstack/react-query")
        return {
          useQueryClient: () => ({
            invalidateQueries: async (q) => invalidations.push(q),
          }),
        };
      if (name === "@/auth/secure-storage")
        return {
          getStorageItem: async () => null,
          setStorageItem: async () => {},
        };
      if (name === "./checkout-success") return success;
      if (name === "./store")
        return {
          useBag: (selector) =>
            selector({ settle: async (...args) => settled.push(args) }),
        };
      throw Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/usePaymentSuccess.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    ctx,
  );
  const order = {
    reference: "APP-TEST",
    payment_state: "pending",
    paid_at: null,
    total_minor: 390000,
    snapshot: {
      lines: [
        {
          slug: "cake",
          quantity: 1,
          selection: { variation_id: 123, size: "3kg" },
        },
      ],
    },
  };
  ctx.exports.usePaymentSuccess(order, "buyer", () => {});
  effects.pop()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled.length, 0);
  assert.equal(celebrations.length, 0);
  assert.equal(invalidations.length, 0);
  order.payment_state = "completed";
  order.paid_at = "2026-11-03T10:00:00Z";
  ctx.exports.usePaymentSuccess(order, "buyer", () => {});
  effects.pop()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled.length, 1);
  assert.equal(settled[0][0], "APP-TEST");
  assert.equal(settled[0][1][0].variation_id, 123);
  assert.equal(settled[0][1][0].size, "3kg");
  assert.equal(celebrations[0], true);
});
