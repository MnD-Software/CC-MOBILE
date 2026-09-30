require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  COMMERCE_QUERY_SCHEMA_VERSION,
  parseCommerceQuery,
  toCommerceQueryRequest,
} = require("../src/features/commerce/commerce-intelligence.ts");

test("commerce intelligence extracts explicit birthday, flavour, budget and tomorrow preferences", () => {
  const intent = parseCommerceQuery(
    "I need a chocolate birthday cake under KES 2,500 for tomorrow",
  );

  assert.equal(intent.schemaVersion, COMMERCE_QUERY_SCHEMA_VERSION);
  assert.equal(intent.requiresServerValidation, true);
  assert.deepEqual(intent.facets, {
    budget: { maximumKes: 2500 },
    deliveryTiming: "tomorrow",
    occasions: ["birthday"],
    flavours: ["chocolate"],
    romance: false,
  });
});

test("commerce intelligence understands romance, typo-tolerant chocolate and same-day as preferences only", () => {
  const intent = parseCommerceQuery(
    "A romantic red velvet and choclate cake, same-day please, around KSh 3k",
  );

  assert.deepEqual(intent.facets, {
    budget: { targetKes: 3000 },
    deliveryTiming: "same_day",
    occasions: ["romance"],
    flavours: ["red_velvet", "chocolate"],
    romance: true,
  });
  assert.equal(intent.requiresServerValidation, true);
});

test("commerce intelligence supports a stated KES range without fabricating results", () => {
  const intent = parseCommerceQuery(
    "Wedding cake between KES 3,500 and KES 2,000",
  );

  assert.deepEqual(intent.facets.budget, {
    minimumKes: 2000,
    maximumKes: 3500,
  });
  assert.deepEqual(intent.facets.occasions, ["wedding"]);

  const request = toCommerceQueryRequest(intent);
  assert.deepEqual(Object.keys(request).sort(), [
    "facets",
    "normalizedQuery",
    "schemaVersion",
  ]);
  assert.equal("availability" in request, false);
  assert.equal("products" in request, false);
  assert.equal("price" in request, false);
});

test("commerce intelligence keeps unrelated text and blank input safe", () => {
  const blank = parseCommerceQuery(null);
  assert.equal(blank.normalizedQuery, "");
  assert.deepEqual(blank.facets, {
    occasions: [],
    flavours: [],
    romance: false,
  });

  const layers = parseCommerceQuery("Need a cake with 3 layers");
  assert.equal(layers.facets.budget, undefined);
});
