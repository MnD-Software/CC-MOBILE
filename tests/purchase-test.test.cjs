const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { releaseProblems } = require("../scripts/release-config.cjs");
function load(file, fetch, storage = new Map(), options = {}) {
  let uuid = 0;
  const context = {
    exports: {},
    __DEV__: options.dev ?? true,
    process: {
      env: {
        EXPO_PUBLIC_PURCHASE_TEST_URL:
          options.origin ?? "http://192.168.0.38:8011",
      },
    },
    URL,
    AbortController: require("abort-controller").AbortController,
    setTimeout,
    clearTimeout,
    Date,
    fetch,
    require(name) {
      if (name === "zod") return require("zod");
      if (name === "./model")
        return load("src/features/purchase-test/model.ts");
      if (name === "expo-crypto")
        return { randomUUID: () => `unique-test-request-${++uuid}` };
      if (name === "@/auth/secure-storage")
        return {
          getStorageItem: async (key) => storage.get(key) ?? null,
          setStorageItem: async (key, value) => {
            assert.match(key, /^[A-Za-z0-9._-]+$/);
            storage.set(key, value);
          },
          deleteStorageItem: async (key) => {
            storage.delete(key);
          },
        };
      throw new Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
const file = "src/features/purchase-test/client.ts";
const billing = {
  name: "Test buyer",
  email: "buyer@example.com",
  address: "Test collection",
};
test("preview state and saved receipts accept Diamond and Platinum upgrades", () => {
  const { testStateSchema, testReceiptSchema } = load(file);
  for (const [purchases, tier, next] of [
    [5, "Diamond", { name: "Platinum", purchases_remaining: 1 }],
    [6, "Platinum", null],
  ]) {
    const membership = {
      simulated: true,
      points: purchases * 25,
      purchases,
      tier,
      next_tier: next,
      milestones: [
        { purchases: 0, name: "Bronze" },
        { purchases: 2, name: "Silver" },
        { purchases: 4, name: "Gold" },
        { purchases: 5, name: "Diamond" },
        { purchases: 6, name: "Platinum" },
      ],
    };
    const product = {
      name: "TEST reward cupcake",
      sku: "TEST-REWARD-CAKE",
      unit_minor: 10000,
      test_points: 25,
    };
    const state = testStateSchema.parse({
      simulated: true,
      membership,
      product,
      history: [],
    });
    assert.equal(state.membership.tier, tier);
    const receipt = testReceiptSchema.parse({
      id: "TEST-upgrade",
      simulated: true,
      status: "succeeded",
      amount_minor: 10000,
      refunded_minor: 0,
      currency: "KES",
      created_at: "2026-10-24T10:00:00Z",
      items: [{ ...product, quantity: 1 }],
      receipt_id: "TEST-upgrade-RECEIPT",
      issued_at: "2026-10-24T10:00:00Z",
      label: "TEST - NOT A TAX INVOICE",
      payment_method: "Simulated payment",
      billing,
      points_earned: 25,
      membership_at_purchase: membership,
      current_refunded_minor: 0,
      fiscalized: false,
      funds_settled: false,
      real_revenue_minor: 0,
    });
    assert.equal(receipt.membership_at_purchase.tier, tier);
    assert.equal(receipt.membership_at_purchase.points, purchases * 25);
  }
});
function reply(value, marked = true) {
  return new Response(JSON.stringify(value), {
    headers: marked ? { "X-CakeCity-Simulated": "true" } : {},
  });
}
test("purchase preview is restricted to development LAN and rejected in releases", () => {
  for (const options of [
    { dev: false },
    { origin: "https://cc-mobile-1.onrender.com" },
    { origin: "http://example.com" },
    { origin: "http://192.168.0.38:8011/path" },
    { origin: "http://user:secret@192.168.0.38:8011" },
  ])
    assert.equal(
      load(
        file,
        () => {
          throw Error("No network");
        },
        new Map(),
        options,
      ).purchaseTestOrigin(),
      null,
    );
  assert.ok(
    releaseProblems({
      EXPO_PUBLIC_PURCHASE_TEST_URL: "http://192.168.0.38:8011",
    }).some((error) => error.includes("local-only")),
  );
});
test("pairing refuses an unmarked server before sending the private test code", async () => {
  let calls = 0;
  const api = load(file, async () => {
    calls++;
    return reply({ status: "ok" }, false);
  }).purchaseTest;
  await assert.rejects(api.connect("12345678"), /isolated test service/);
  assert.equal(calls, 1);
});
test("payment retry after app restart retains the original billing, request key and outcome", async () => {
  const store = new Map(),
    created = [],
    completed = [];
  let loseResponse = true;
  const payment = {
    simulated: true,
    id: "TEST-one",
    status: "pending",
    amount_minor: 10000,
    refunded_minor: 0,
    currency: "KES",
    created_at: "2026-10-24T10:00:00Z",
    items: [],
  };
  const fetch = async (url, init) => {
    if (url.endsWith("/health"))
      return reply({ simulated: true, schema: "sandbox-v1" });
    if (url.endsWith("/session"))
      return reply({
        simulated: true,
        token: "test.session.signature",
        expires_at: Date.now() / 1000 + 3600,
      });
    assert.match(init.headers.Authorization, /^Bearer test\./);
    const body = JSON.parse(init.body);
    if (url.endsWith("/purchases")) {
      created.push(body);
      return reply(payment);
    }
    if (url.endsWith("/complete")) {
      completed.push(body);
      payment.status = body.outcome;
      if (loseResponse) {
        loseResponse = false;
        throw new Error("Connection dropped after server recorded success");
      }
      return reply(payment);
    }
    throw Error(url);
  };
  const first = load(file, fetch, store).purchaseTest;
  await first.connect("12345678");
  await assert.rejects(first.pay(billing), /Connection dropped/);
  assert.ok(await first.pending());
  const recovered = load(file, fetch, store).purchaseTest;
  assert.equal(await recovered.connected(), true);
  const result = await recovered.pay(
    { ...billing, name: "Changed after restart" },
    "cancelled",
  );
  assert.equal(result.status, "succeeded");
  assert.equal(created.length, 1);
  assert.equal(created[0].billing.name, "Test buyer");
  assert.deepEqual(completed, [
    { outcome: "succeeded" },
    { outcome: "succeeded" },
  ]);
  assert.equal(await recovered.pending(), null);
});
test("test receipt HTML escapes billing input and identifies zero real funds", () => {
  const { receiptHtml } = load("src/features/purchase-test/receipt.ts");
  const html = receiptHtml({
    receipt_id: "TEST-one-RECEIPT",
    label: "TEST - NOT A TAX INVOICE",
    issued_at: "2026-10-24T10:00:00Z",
    billing: { ...billing, name: '<script>alert("bad")</script>' },
    items: [{ quantity: 1, name: "TEST cupcake", unit_minor: 10000 }],
    amount_minor: 10000,
    points_earned: 25,
    membership_at_purchase: { points: 25, tier: "Bronze" },
    current_refunded_minor: 0,
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /no money charged/);
  assert.match(html, /Preview receipt/);
});
