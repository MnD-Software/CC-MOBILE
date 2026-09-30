require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseOrderReceipt,
} = require("../src/features/commerce/order-receipt.ts");

test("receipt recovery accepts only official HTTPS order receipts and normalizes email", () => {
  const receipt =
    "https://cakecity.co.ke/checkout/order-received/123/?key=wc_order_test123";
  assert.deepEqual(parseOrderReceipt(receipt, " Customer@Example.com "), {
    id: 123,
    key: "wc_order_test123",
    billingEmail: "customer@example.com",
  });
  assert.equal(
    parseOrderReceipt(receipt.replace("//cakecity", "//www.cakecity"), "a@b.co")
      .id,
    123,
  );
});

test("receipt recovery rejects missing credentials, foreign links, invalid ids and duplicate keys", () => {
  const base =
    "https://cakecity.co.ke/checkout/order-received/123/?key=wc_order_test123";
  for (const link of [
    base.replace("https:", "http:"),
    base.replace("cakecity.co.ke", "cakecity.co.ke.evil.invalid"),
    base.replace("cakecity.co.ke", "user@cakecity.co.ke"),
    base.replace("cakecity.co.ke", "cakecity.co.ke:444"),
    base.replace("/123/", "/0/"),
    base.replace("/123/", "/9007199254740999/"),
    base.replace("order-received", "order-pay"),
    base.replace("wc_order_test123", "not-a-key"),
    base + "&key=wc_order_duplicate",
    base.split("?")[0],
    "not a url",
  ])
    assert.throws(() => parseOrderReceipt(link, "a@b.co"));
  assert.throws(() => parseOrderReceipt(base, "not an email"));
});

test("recovered history stays account-scoped and stale recovery cannot save", async () => {
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
  const apiPath = require.resolve(
    "../src/features/commerce/website-checkout.ts",
  );
  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: {
      websiteOrderUrl: ({ order_id, order_key }) =>
        `https://cakecity.co.ke/checkout/order-received/${order_id}/?key=${order_key}`,
    },
  };
  const {
    saveRecoveredWebsiteOrder,
    websiteOrderHistory,
  } = require("../src/features/commerce/website-order-history.ts");
  const access = { id: 123, key: "wc_order_test123", billingEmail: "a@b.co" };
  const verified = { id: 123, status: "pending" };
  assert.equal(
    await saveRecoveredWebsiteOrder(
      access,
      verified,
      "customer:1",
      () => false,
    ),
    null,
  );
  assert.equal(storage.size, 0);
  await assert.rejects(
    saveRecoveredWebsiteOrder(
      access,
      { ...verified, id: 99 },
      "customer:1",
      () => true,
    ),
  );
  const record = await saveRecoveredWebsiteOrder(
    access,
    verified,
    "customer:1",
    () => true,
  );
  assert.equal(record.source, "receipt");
  assert.equal(record.status, "pending");
  assert.equal(record.paymentStatus, "");
  assert.equal((await websiteOrderHistory("customer:1")).length, 1);
  assert.deepEqual(await websiteOrderHistory("customer:2"), []);
  assert.deepEqual(await websiteOrderHistory(null), []);
});
