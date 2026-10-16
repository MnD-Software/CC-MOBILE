require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  cartSuggestions,
} = require("../src/features/commerce/cart-upselling.ts");
const { storeProductSchema } = require("../src/features/commerce/contracts.ts");
const { shopBrowseQuery } = require("../src/features/commerce/shop-browse.ts");
const product = (id, name = "Cake", extra = {}) =>
  storeProductSchema.parse({
    id,
    name,
    slug: `p-${id}`,
    is_in_stock: true,
    is_purchasable: true,
    prices: {
      price: "10000",
      regular_price: "15000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
    ...extra,
  });

test("empty cart shows genuine sale records and preserves server popularity order without duplicate rails", () => {
  const sale = product(1, "Offer cake", { on_sale: true });
  const results = cartSuggestions(
    [],
    [sale, sale, product(9)],
    [sale, product(5), product(3), product(5)],
  );
  assert.deepEqual(
    results.offers.map((p) => p.id),
    [1],
  );
  assert.deepEqual(
    results.popular.map((p) => p.id),
    [5, 3],
  );
  assert.deepEqual(results.pairings, []);
  const query = shopBrowseQuery({ sort: "popular", onSale: true });
  assert.equal(query.get("on_sale"), "true");
  assert.equal(query.get("orderby"), "popularity");
  assert.equal(shopBrowseQuery({}).has("on_sale"), false);
});

test("cart suggestions exclude existing items, unsafe prices and unavailable products", () => {
  const invalid = [
    product(1),
    product(2, "Cake", { is_in_stock: false }),
    product(3, "Cake", { is_purchasable: false }),
    product(4, "Cake", {
      prices: {
        price: "bad",
        regular_price: "100",
        currency_code: "KES",
        currency_minor_unit: 2,
      },
    }),
    product(5, "Cake", {
      prices: {
        price: "100",
        regular_price: "100",
        currency_code: "USD",
        currency_minor_unit: 2,
      },
    }),
  ];
  const result = cartSuggestions(
    [{ product_id: 1, name: "Chocolate Cake" }],
    invalid,
    invalid,
    invalid,
  );
  assert.deepEqual(result, { offers: [], popular: [], pairings: [] });
});

test("filled bags suggest complementary extras and deduplicate across bag lines", () => {
  const cake = product(1, "Chocolate Cake");
  const cupcake = product(3, "Chocolate cupcake");
  const candle = product(2, "Birthday candle");
  const result = cartSuggestions(
    [
      { product_id: 1, name: cake.name },
      { product_id: 4, name: "Vanilla cake" },
    ],
    [],
    [cake],
    [cupcake, candle, candle],
  );
  assert.deepEqual(
    result.pairings.map((p) => p.id),
    [2, 3],
  );
  assert.deepEqual(cartSuggestions([], [], []), {
    offers: [],
    popular: [],
    pairings: [],
  });
});

test("each rail is bounded without suppressing unseen popular records", () => {
  const offers = Array.from({ length: 10 }, (_, i) =>
    product(i + 1, "Offer cake", { on_sale: true }),
  );
  const result = cartSuggestions([], offers, offers.toReversed());
  assert.equal(result.offers.length, 6);
  assert.deepEqual(
    result.popular.map((p) => p.id),
    [10, 9, 8, 7],
  );
});

test("Deals and Steals remain offers without a sale flag and legacy bag slugs are excluded", () => {
  const deal = product(8, "Deal cake", {
    categories: [{ id: 206, name: "Deals & Steals", slug: "deals" }],
  });
  assert.deepEqual(
    cartSuggestions([], [deal], []).offers.map((p) => p.id),
    [8],
  );
  assert.deepEqual(
    cartSuggestions([{ name: "Deal cake", slug: "p-8" }], [deal], [deal])
      .offers,
    [],
  );
  assert.deepEqual(
    cartSuggestions([{ name: "Deal cake", slug: "p-8" }], [deal], [deal])
      .popular,
    [],
  );
});
