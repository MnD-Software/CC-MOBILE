require("./register.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const saved = new Map();
let failWrite = false;
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "expo-crypto")
    return { randomUUID: require("node:crypto").randomUUID };
  if (request === "@/auth/secure-storage")
    return {
      getStorageItem: async (key) => saved.get(key) ?? null,
      setStorageItem: async (key, value) => {
        if (failWrite) throw new Error("Keychain unavailable");
        saved.set(key, value);
      },
      deleteStorageItem: async (key) => {
        saved.delete(key);
      },
    };
  return originalLoad.call(this, request, ...rest);
};
const {
  createAttempt,
  restoreAttempt,
} = require("../src/features/commerce/payment-recovery.ts");
Module._load = originalLoad;
const {
  settleBag,
  lineKey,
  quoteSchema,
} = require("../src/features/commerce/contracts.ts");
const { releaseProblems } = require("../scripts/release-config.cjs");
const {
  storeProductSchema,
  selectableVariations,
  variationLabel,
} = require("../src/features/commerce/contracts.ts");
afterEach(() => {
  saved.clear();
  failWrite = false;
});
const selection = {
  size: "1kg",
  message: "Happy birthday",
  add_ons: ["candles", "topper"],
};
const payload = {
  method: "mpesa",
  checkout: {
    fulfilment: "pickup",
    items: [{ product_slug: "cake", quantity: 2, ...selection }],
  },
  customer: {
    name: "Test fixture",
    email: "test@example.invalid",
    phone: "0700000000",
  },
};

test("an interrupted payment restores its exact request and original idempotency key", async () => {
  const attempt = await createAttempt("customer-1", payload);
  assert.deepEqual(await restoreAttempt("customer-1"), attempt);
  assert.equal(await restoreAttempt("customer-2"), null);
  assert.equal(saved.size, 1);
});
test("payment recovery refuses corrupted or cross-account records without deleting evidence", async () => {
  await createAttempt("customer-1", payload);
  const key = [...saved.keys()][0];
  for (const value of [
    "invalid JSON",
    JSON.stringify({ key: "x", owner: "customer-2", payload }),
    JSON.stringify({
      key: "x",
      owner: "customer-1",
      payload: {
        ...payload,
        checkout: {
          ...payload.checkout,
          items: [{ ...payload.checkout.items[0], quantity: -1 }],
        },
      },
    }),
  ]) {
    saved.set(key, value);
    await assert.rejects(restoreAttempt("customer-1"), /could not be verified/);
    assert.equal(saved.get(key), value);
  }
});
test("an attempt cannot be started when durable storage fails", async () => {
  failWrite = true;
  await assert.rejects(
    createAttempt("customer-1", payload),
    /Keychain unavailable/,
  );
  assert.equal(saved.size, 0);
});
test("confirmed payment removes the purchased configuration exactly once across restarts", () => {
  const lines = [
    {
      key: lineKey("cake", selection),
      slug: "cake",
      name: "Test fixture",
      image: null,
      price: 1000,
      quantity: 3,
      selection: {
        add_ons: ["topper", "candles"],
        message: "Happy birthday",
        size: "1kg",
      },
    },
    {
      key: "other",
      slug: "cake",
      name: "Other message",
      image: null,
      price: 1000,
      quantity: 1,
      selection: { ...selection, message: "Different" },
    },
  ];
  const once = settleBag(lines, [], "intent-1", payload.checkout.items);
  assert.equal(once.lines[0].quantity, 1);
  assert.equal(once.lines[1].quantity, 1);
  const restored = JSON.parse(JSON.stringify(once));
  assert.deepEqual(
    settleBag(
      restored.lines,
      restored.settled,
      "intent-1",
      payload.checkout.items,
    ),
    once,
  );
});
test("a reconciled overall total cannot hide invalid individual line prices", () => {
  const value = {
    currency: "KES",
    lines: [
      {
        product_slug: "cake",
        name: "Test fixture",
        quantity: 2,
        unit_price: 1000,
        line_total: 50,
        available: true,
      },
    ],
    subtotal: 50,
    delivery_fee: 0,
    discount: 0,
    total: 50,
    fulfilment: "pickup",
    requires_address: false,
    quote_version: "v1",
  };
  assert.equal(quoteSchema.safeParse(value).success, false);
});
test("release profiles reject insecure or missing production configuration", () => {
  const base = {
    EXPO_PUBLIC_EAS_PROJECT_ID: "12345678-1234-1234-1234-123456789012",
  };
  for (const url of [
    "",
    "http://api.cakecity.co.ke",
    "https://localhost",
    "https://user:pass@api.cakecity.co.ke",
    "https://api.cakecity.co.ke?secret=x",
  ]) {
    assert.ok(
      releaseProblems({ ...base, EXPO_PUBLIC_API_URL: url }, "production")
        .length,
    );
  }
  assert.deepEqual(
    releaseProblems(
      { ...base, EXPO_PUBLIC_API_URL: "https://api.cakecity.co.ke" },
      "production",
    ),
    [],
  );
  assert.deepEqual(releaseProblems({}, "preview"), []);
});
test("WooCommerce wildcard attributes do not break browsing or become ambiguous order choices", () => {
  const product = storeProductSchema.parse({
    id: 1,
    name: "Fixture",
    slug: "fixture",
    type: "variable",
    is_in_stock: true,
    is_purchasable: true,
    prices: {
      price: "100000",
      regular_price: "100000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
    attributes: [
      {
        id: 1,
        name: "Cake Size",
        has_variations: true,
        terms: [{ id: 1, name: "1.5kg (serves 15)", slug: "1-5kg-serves-15" }],
      },
    ],
    variations: [
      { id: 2, attributes: [{ name: "Cake Size", value: null }] },
      { id: 3, attributes: [{ name: "Cake Size", value: "1-5kg-serves-15" }] },
    ],
  });
  assert.equal(product.variations.length, 2);
  const options = selectableVariations(product);
  assert.deepEqual(
    options.map((v) => v.id),
    [3],
  );
  assert.equal(variationLabel(product, options[0]), "1.5kg (serves 15)");
});
