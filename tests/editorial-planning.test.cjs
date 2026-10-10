require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  nextCelebration,
  suggestedOrderDate,
  planningRecommendations,
  combinedPlanTotal,
} = require("../src/features/celebrations/planning.ts");

const product = (id, price, extra = {}) => ({
  id,
  name: "Vanilla cake",
  is_in_stock: true,
  is_purchasable: true,
  attributes: [],
  prices: {
    price: String(price * 100),
    currency_code: "KES",
    currency_minor_unit: 2,
  },
  ...extra,
});
test("celebrations keep today and safely handle February 29", () => {
  assert.equal(nextCelebration(2, 29, new Date(2027, 0, 1)).getDate(), 28);
  assert.equal(nextCelebration(2, 29, new Date(2028, 0, 1)).getDate(), 29);
  assert.equal(
    nextCelebration(10, 10, new Date(2026, 9, 10, 17)).getFullYear(),
    2026,
  );
  assert.equal(
    nextCelebration(10, 9, new Date(2026, 9, 10)).getFullYear(),
    2027,
  );
  assert.throws(() => nextCelebration(2, 30));
});
test("order-by suggestions require confirmed preparation time", () => {
  assert.equal(
    suggestedOrderDate("2026-10-15T09:00:00+03:00", 24).toISOString(),
    "2026-10-14T06:00:00.000Z",
  );
  assert.equal(suggestedOrderDate("2026-10-15T09:00:00Z", null), null);
  assert.equal(suggestedOrderDate("invalid", 24), null);
});
test("planner excludes unavailable and out-of-budget cakes, ranks confirmed servings", () => {
  const rows = [
    product(1, 1000),
    product(2, 1500, {
      attributes: [{ name: "Servings", terms: [{ name: "10-15" }] }],
    }),
    product(3, 8000),
    product(4, 500, { is_in_stock: false }),
    product(5, 600, { name: "Candle stand" }),
  ];
  const recommendations = planningRecommendations(rows, "Vanilla", 2000, 12);
  assert.deepEqual(
    recommendations.map((r) => r.product.id),
    [2, 1],
  );
  assert.match(recommendations[1].explanation, /Confirm servings/);
});
test("cake and extras share a total and unpriced options cannot be added", () => {
  assert.equal(
    combinedPlanTotal(2500, [product(2, 250), product(3, 350)]),
    3100,
  );
  assert.equal(combinedPlanTotal(null, [product(2, 250)]), null);
  assert.equal(
    combinedPlanTotal(2500, [
      product(2, 0, {
        prices: {
          price: "unknown",
          currency_code: "KES",
          currency_minor_unit: 2,
        },
      }),
    ]),
    null,
  );
});
