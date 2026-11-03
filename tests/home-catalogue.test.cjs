require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  dealCarouselProducts,
  isDealsAndSteals,
} = require("../src/features/commerce/home-catalogue.ts");
const cake = (id, categories, available = true) => ({
  id,
  name: "Cake",
  categories: categories.map((id) => ({ id, name: "", slug: "" })),
  is_in_stock: available,
  is_purchasable: available,
  prices: {
    price: "250000",
    regular_price: "250000",
    currency_minor_unit: 2,
    currency_code: "KES",
  },
});

test("carousel shows Deals & Steals only, with no Signature or generic offer substitution", () => {
  const deal = cake(1, [206]),
    signature = cake(2, [229]),
    offer = cake(3, [98]);
  assert.deepEqual(
    dealCarouselProducts([signature, deal, offer]).map((p) => p.id),
    [1],
  );
  assert.deepEqual(dealCarouselProducts([signature, offer]), []);
});
test("a catalogue deal remains browsable while app ordering is disabled", () => {
  const deal = cake(1, [206], false);
  assert.deepEqual(dealCarouselProducts([deal]), [deal]);
  assert.equal(deal.is_purchasable, false);
  assert.equal(
    isDealsAndSteals({
      ...cake(2, []),
      categories: [
        { id: 900, name: "Deals &amp; Steals", slug: "deals-and-steals" },
      ],
    }),
    true,
  );
});
