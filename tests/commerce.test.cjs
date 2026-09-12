require("./register.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  quoteSchema,
  checkoutBlock,
  lineKey,
  studioEstimate,
  activeCampaigns,
  productPrice,
  moneyValue,
} = require("../src/features/commerce/contracts.ts");
const { api, setSessionRefresher } = require("../src/api/client.ts");
const { payments } = require("../src/features/commerce/api.ts");
const { authApi } = require("../src/auth/api.ts");
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  api.clearAccessToken();
  setSessionRefresher(null);
});
const input = {
  items: [
    {
      product_slug: "test-cake",
      quantity: 2,
      size: "1kg",
      message: "",
      add_ons: [],
    },
  ],
  fulfilment: "pickup",
};
function quote(extra = {}) {
  return {
    currency: "KES",
    lines: [
      {
        product_slug: "test-cake",
        name: "Test fixture",
        quantity: 2,
        unit_price: 1000,
        line_total: 2000,
        available: true,
      },
    ],
    subtotal: 2000,
    delivery_fee: 0,
    discount: 0,
    total: 2000,
    fulfilment: "pickup",
    requires_address: false,
    quote_version: "2026-07",
    ...extra,
  };
}
test("refuses inconsistent, negative and malformed money from the server", () => {
  assert.equal(quoteSchema.safeParse(quote({ total: 1 })).success, false);
  for (const value of [-1, "NaN", "", null, "1e5"])
    assert.equal(moneyValue.safeParse(value).success, false);
  assert.equal(moneyValue.parse("4200.00"), 4200);
});
test("checkout checks every line, quantity and configuration", () => {
  assert.equal(checkoutBlock(input, quote(), null), null);
  assert.ok(
    checkoutBlock(
      { ...input, items: [{ ...input.items[0], quantity: 3 }] },
      quote(),
      null,
    ),
  );
  assert.ok(
    checkoutBlock(
      { ...input, items: [{ ...input.items[0], variation_id: 123 }] },
      quote(),
      null,
    ),
  );
  assert.ok(
    checkoutBlock(
      { ...input, items: [{ ...input.items[0], studio_quote_id: "custom" }] },
      quote(),
      null,
    ),
  );
  assert.ok(
    checkoutBlock(input, quote({ expires_at: "2000-01-01T00:00:00Z" }), null),
  );
});
test("flat delivery, expired routes and a changed branch cannot authorize checkout", () => {
  const delivery = {
    id: "route-1",
    branch_id: "branch-1",
    distance_km: 8.4,
    delivery_fee: 350,
    currency: "KES",
    estimated_delivery_minutes: 45,
    expires_at: "2099-01-01T00:00:00Z",
    provider: "test",
  };
  const i = {
    ...input,
    fulfilment: "delivery",
    delivery_quote_id: delivery.id,
  };
  const q = quote({ fulfilment: "delivery", delivery_fee: 350, total: 2350 });
  assert.ok(checkoutBlock(i, q, null));
  assert.ok(checkoutBlock(i, q, delivery));
  assert.equal(
    checkoutBlock(i, { ...q, delivery_quote_id: delivery.id }, delivery),
    null,
  );
  assert.ok(
    checkoutBlock(
      i,
      { ...q, delivery_quote_id: delivery.id },
      { ...delivery, expires_at: "2000-01-01T00:00:00Z" },
    ),
  );
});
test("a coupon ignored by the legacy backend never appears accepted", () => {
  assert.ok(checkoutBlock({ ...input, coupon_code: "TEST" }, quote(), null));
  assert.equal(
    checkoutBlock(
      { ...input, coupon_code: "TEST" },
      quote({ applied_coupon: "test" }),
      null,
    ),
    null,
  );
});
test("cake messages, variations and extras retain distinct bag identities", () => {
  const s = { size: "1kg", message: "A", add_ons: ["x", "y"] };
  assert.equal(
    lineKey("cake", s),
    lineKey("cake", { ...s, add_ons: ["y", "x"] }),
  );
  assert.notEqual(lineKey("cake", s), lineKey("cake", { ...s, message: "B" }));
  assert.notEqual(
    lineKey("cake", s),
    lineKey("cake", { ...s, variation_id: 7 }),
  );
});
test("studio pricing uses configured materials and rejects invalid combinations", () => {
  const c = {
    base_price: 100,
    groups: [
      {
        id: "finish",
        required: true,
        multiple: false,
        options: [
          {
            id: "a",
            name: "A",
            price: 20,
            available: true,
            incompatible_with: ["b"],
          },
          {
            id: "b",
            name: "B",
            price: 40,
            available: true,
            incompatible_with: [],
          },
        ],
      },
    ],
  };
  assert.equal(studioEstimate(c, { finish: ["b"] }).total, 140);
  assert.equal(studioEstimate(c, {}), null);
  assert.equal(studioEstimate(c, { finish: ["a", "b"] }), null);
  assert.equal(studioEstimate(c, { finish: ["fake"] }), null);
  assert.equal(studioEstimate(c, { finish: ["a"], unrecognized: ["b"] }), null);
});
test("campaigns require active dates, eligibility, branch and remaining usage", () => {
  const p = {
    id: "test",
    eligible: true,
    starts_at: "2020-01-01T00:00:00Z",
    ends_at: "2099-01-01T00:00:00Z",
    usage_remaining: 1,
    branch_ids: ["A"],
  };
  assert.equal(activeCampaigns([p], "A").length, 1);
  assert.equal(activeCampaigns([p], "B").length, 0);
  assert.equal(activeCampaigns([{ ...p, usage_remaining: 0 }], "A").length, 0);
  assert.equal(activeCampaigns([{ ...p, eligible: false }], "A").length, 0);
});
test("WooCommerce minor-unit prices never become unvalidated or wrong-currency totals", () => {
  assert.equal(
    productPrice({
      prices: { price: "420000", currency_minor_unit: 2, currency_code: "KES" },
    }),
    4200,
  );
  assert.equal(
    productPrice({
      prices: { price: "420000", currency_minor_unit: 2, currency_code: "USD" },
    }),
    null,
  );
  assert.equal(
    productPrice({
      prices: { price: "", currency_minor_unit: 2, currency_code: "KES" },
    }),
    null,
  );
});
test("concurrent expired bearer requests rotate once and preserve request bodies", async () => {
  api.setAccessToken("expired");
  let refreshes = 0;
  let accepted = 0;
  setSessionRefresher(async () => {
    refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    api.setAccessToken("new");
  });
  global.fetch = async (_url, options) => {
    if (options.headers.Authorization === "Bearer expired")
      return new Response("{}", { status: 401 });
    accepted++;
    assert.equal(options.body, '{"quantity":2}');
    return Response.json({ ok: true });
  };
  await Promise.all([
    api.post("/test", { quantity: 2 }, { auth: true }),
    api.post("/test", { quantity: 2 }, { auth: true }),
  ]);
  assert.equal(refreshes, 1);
  assert.equal(accepted, 2);
});
test("failed payment transport is not automatically retried", async () => {
  api.setAccessToken("token");
  let calls = 0;
  global.fetch = async () => {
    calls++;
    throw new TypeError("offline");
  };
  await assert.rejects(
    payments.create(
      {
        method: "mpesa",
        checkout: input,
        customer: {
          name: "Test fixture",
          email: "test@example.invalid",
          phone: "0700000000",
        },
      },
      "test-idempotency-key",
    ),
    /Unable to reach/,
  );
  assert.equal(calls, 1);
});
test("payment handoff preserves existing providers, exact checkout and idempotency", async () => {
  api.setAccessToken("token");
  const payload = {
    method: "card",
    checkout: input,
    customer: {
      name: "Test fixture",
      email: "test@example.invalid",
      phone: "0700000000",
    },
  };
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith("/v1/payments/intents"));
    assert.equal(options.headers["Idempotency-Key"], "test-idempotency-key");
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(JSON.parse(options.body).amount, undefined);
    return Response.json({
      id: "intent",
      order_reference: "CC-TEST",
      state: "pending",
      method: "card",
      amount: "2000.00",
      currency: "KES",
      client_secret: "test-client-secret-123456",
      action: {
        type: "redirect",
        redirect_url: "https://payment.test.invalid",
      },
    });
  };
  const result = await payments.create(payload, "test-idempotency-key");
  assert.equal(result.state, "pending");
  assert.equal(result.amount, 2000);
});
test("logout handles the actual HTTP 204 response and failed auth never creates a session", async () => {
  global.fetch = async () => new Response(null, { status: 204 });
  await authApi.logout("test-refresh-token");
  global.fetch = async () =>
    Response.json({ access_token: "fake" }, { status: 200 });
  await assert.rejects(authApi.login("test@example.invalid", "password"));
});
