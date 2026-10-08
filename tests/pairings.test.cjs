require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rankPairings } = require("../src/features/commerce/pairings.ts");
const { storeProductSchema } = require("../src/features/commerce/contracts.ts");
const product = (id, name, extra = {}) =>
  storeProductSchema.parse({
    id,
    name,
    slug: `p-${id}`,
    is_in_stock: true,
    is_purchasable: true,
    prices: {
      price: "10000",
      regular_price: "10000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
    ...extra,
  });

test("cake pairings prioritise accessories and matching treats, excluding unsafe records", () => {
  const cake = product(1, "Chocolate Cake");
  const candle = product(2, "Birthday candle");
  const results = rankPairings(cake, [
    cake,
    product(3, "Vanilla cupcake"),
    product(4, "Chocolate cupcake"),
    candle,
    candle,
    product(5, "Candle", { is_in_stock: false }),
    product(6, "Candle", { is_purchasable: false }),
    product(7, "Another cake"),
  ]);
  assert.deepEqual(
    results.map((r) => r.product.id),
    [2, 4, 3],
  );
  assert.equal(results[0].reason, "Finish your cake celebration");
});

test("accessories recommend cakes, and an empty live catalogue stays empty", () => {
  assert.deepEqual(
    rankPairings(product(1, "Topper"), [
      product(2, "Lemon cake"),
      product(3, "Candle"),
    ]).map((r) => r.product.id),
    [2],
  );
  assert.deepEqual(rankPairings(product(1, "Cake"), []), []);
});
