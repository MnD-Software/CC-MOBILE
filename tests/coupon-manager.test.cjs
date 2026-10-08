require("./register.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const storage = new Map();
const storagePath = require.resolve("../src/auth/secure-storage.ts");
require.cache[storagePath] = {
  id: storagePath,
  filename: storagePath,
  loaded: true,
  exports: {
    getStorageItem: async (key) => storage.get(key) ?? null,
    setStorageItem: async (key, value) => storage.set(key, value),
    deleteStorageItem: async (key) => storage.delete(key),
  },
};
const networkPath = require.resolve("../src/platform/connectivity.ts");
require.cache[networkPath] = {
  id: networkPath,
  filename: networkPath,
  loaded: true,
  exports: {
    reportNetworkSuccess() {},
    reportNetworkFailure() {},
  },
};
const {
  normalizeCouponCode,
  cartHasRequestedCoupon,
} = require("../src/features/commerce/website-cart.ts");
const {
  setWebsiteCartCoupon,
  submitWebsiteCheckout,
} = require("../src/features/commerce/website-checkout.ts");
const {
  couponWalletScope,
  loadCouponWallet,
  saveCouponCode,
  selectCouponCode,
  removeCouponCode,
  readCouponWallet,
} = require("../src/features/commerce/coupon-wallet.ts");
const {
  loadWebsiteCheckoutSession,
} = require("../src/features/commerce/website-checkout-session.ts");
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
const cart = (coupons = [], total = "100000") => ({
  items: [{ id: 123, quantity: 1, name: "Test cake" }],
  coupons: coupons.map((code) => ({ code })),
  totals: {
    total_price: total,
    total_discount: coupons.length ? "10000" : "0",
    currency_code: "KES",
    currency_minor_unit: 2,
  },
});
const session = (coupons = []) => ({
  cart: cart(coupons),
  cartToken: "test-only-cart-token",
});
function transport(responses) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({
      path: new URL(url).pathname,
      method: options.method ?? "GET",
      body: options.body,
      headers: options.headers,
    });
    const next = responses.shift();
    assert.ok(next, "Unexpected transport call");
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: {
        "Content-Type": "application/json",
        "Cart-Token": "test-only-cart-token",
      },
    });
  };
  return calls;
}

test("coupon codes normalize safely without manufacturing eligibility", () => {
  assert.equal(normalizeCouponCode("  Welcome-20 "), "welcome-20");
  for (const value of ["", " ", "x\ninvalid", "a".repeat(101)])
    assert.throws(() => normalizeCouponCode(value));
  assert.equal(cartHasRequestedCoupon(cart(), "welcome"), false);
  assert.equal(cartHasRequestedCoupon(cart(["WELCOME"]), "welcome"), true);
  assert.equal(
    cartHasRequestedCoupon(cart(["welcome", "unexpected"]), "welcome"),
    false,
  );
  assert.equal(cartHasRequestedCoupon(cart(["welcome"]), null), false);
});

test("gift checkout separates recipient contact from buyer payment details", async () => {
  const calls = transport([
    { body: cart() },
    {
      body: {
        order_id: 456,
        order_key: "test-order-key",
        order_number: "456",
        status: "pending",
        payment_result: {
          payment_status: "pending",
          redirect_url: "https://cakecity.co.ke/pay",
        },
      },
    },
  ]);
  await submitWebsiteCheckout(session(), {
    firstName: "Buyer",
    lastName: "Customer",
    email: "buyer@example.com",
    phone: "0712345678",
    address: "Building",
    area: "Westlands",
    city: "Nairobi",
    notes: "Call first",
    gift: {
      firstName: "Gift",
      lastName: "Recipient",
      phone: "0798765432",
      message: "Happy birthday",
    },
  });
  const body = JSON.parse(calls[1].body);
  assert.equal(body.billing_address.first_name, "Buyer");
  assert.equal(body.billing_address.email, "buyer@example.com");
  assert.equal(body.shipping_address.first_name, "Gift");
  assert.equal(body.shipping_address.phone, "0798765432");
  assert.equal(body.shipping_address.email, "");
  assert.equal(body.customer_note, "Call first\nGift message: Happy birthday");
  assert.equal(body.payment_method, "pesapal");
});

test("applying a code verifies authoritative totals and preserves scoped recovery", async () => {
  const calls = transport([
    { body: cart() },
    { body: { code: "welcome" } },
    { body: cart(["welcome"], "90000") },
  ]);
  const verified = await setWebsiteCartCoupon(
    session(),
    " Welcome ",
    "cc-cart-v1:12345678",
    "customer:coupon-test",
  );
  assert.equal(verified.cart.totals.total_price, "90000");
  assert.deepEqual(
    calls.map((call) => call.method),
    ["GET", "POST", "GET"],
  );
  assert.equal(calls[1].body, JSON.stringify({ code: "welcome" }));
  assert.ok(
    calls.every(
      (call) => call.headers.get("Cart-Token") === "test-only-cart-token",
    ),
  );
  assert.equal(
    (
      await loadWebsiteCheckoutSession(
        "cc-cart-v1:12345678",
        "customer:coupon-test",
      )
    ).cart.coupons[0].code,
    "welcome",
  );
  assert.equal(
    await loadWebsiteCheckoutSession(
      "cc-cart-v1:12345678",
      "customer:someone-else",
    ),
    null,
  );
});

test("rejected or ignored coupon can never be represented as applied", async () => {
  transport([
    { body: cart() },
    { status: 400, body: { message: "This coupon has expired." } },
  ]);
  await assert.rejects(
    setWebsiteCartCoupon(session(), "expired", "cc-cart-v1:22222222", null),
    /expired/,
  );
  transport([
    { body: cart() },
    { body: { code: "ignored" } },
    { body: cart() },
  ]);
  await assert.rejects(
    setWebsiteCartCoupon(session(), "ignored", "cc-cart-v1:22222222", null),
    /did not accept/,
  );
});

test("coupon removal uses DELETE and requires the server cart to confirm removal", async () => {
  const calls = transport([
    { body: cart(["old/code"]) },
    { body: [] },
    { body: cart() },
  ]);
  const verified = await setWebsiteCartCoupon(
    session(["old/code"]),
    null,
    "cc-cart-v1:33333333",
    null,
  );
  assert.deepEqual(verified.cart.coupons, []);
  assert.equal(calls[1].method, "DELETE");
  assert.match(calls[1].path, /old%2Fcode$/);
  transport([{ body: cart(["old"]) }, { body: [] }, { body: cart(["old"]) }]);
  await assert.rejects(
    setWebsiteCartCoupon(session(["old"]), null, "cc-cart-v1:33333333", null),
    /not confirmed coupon removal/,
  );
});

test("payment does not POST when a coupon disappears or the verified price changes", async () => {
  let calls = transport([{ body: cart() }]);
  await assert.rejects(
    submitWebsiteCheckout(session(["welcome"]), {}, "welcome"),
    /coupon is not confirmed/,
  );
  assert.equal(calls.length, 1);
  calls = transport([{ body: cart([], "120000") }]);
  await assert.rejects(
    submitWebsiteCheckout(session(), {}, null),
    /total has changed/,
  );
  assert.equal(calls.length, 1);
});

test("coupon wallet is account-isolated; guest selection is never persisted or transferred", async () => {
  const alice = couponWalletScope("coupon-alice");
  const bob = couponWalletScope("coupon-bob");
  await saveCouponCode(alice, "  MY-CODE  ", true);
  assert.deepEqual(readCouponWallet(alice), {
    codes: ["my-code"],
    selected: "my-code",
  });
  await saveCouponCode(alice, "my-code");
  assert.equal(readCouponWallet(alice).codes.length, 1);
  await loadCouponWallet(bob);
  assert.deepEqual(readCouponWallet(bob), { codes: [], selected: null });
  await saveCouponCode("guest", "guest-only", true);
  assert.equal(
    [...storage.keys()].some((key) => key.endsWith(".guest")),
    false,
  );
  await loadCouponWallet(alice);
  assert.deepEqual(readCouponWallet("guest"), { codes: [], selected: null });
  await selectCouponCode(alice, null);
  assert.equal(readCouponWallet(alice).selected, null);
  await removeCouponCode(alice, "my-code");
  assert.deepEqual(readCouponWallet(alice), { codes: [], selected: null });
});
