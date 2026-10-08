require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseBudget,
  shopBrowseQuery,
} = require("../src/features/commerce/shop-browse.ts");

test("shop orders every page on the server and sends KES budget in minor units", () => {
  for (const page of [1, 2, 10]) {
    const query = shopBrowseQuery({
      page,
      sort: "price-asc",
      categories: [168],
      minimumKes: 1000,
      maximumKes: 3000.5,
    });
    assert.equal(query.get("page"), String(page));
    assert.equal(query.get("orderby"), "price");
    assert.equal(query.get("order"), "asc");
    assert.equal(query.get("min_price"), "100000");
    assert.equal(query.get("max_price"), "300050");
    assert.equal(query.get("category"), "168");
  }
});
test("budget validates empty, zero, invalid, and inverted ranges", () => {
  assert.deepEqual(parseBudget("", ""), {
    minimumKes: undefined,
    maximumKes: undefined,
  });
  assert.deepEqual(parseBudget("0", "2500"), {
    minimumKes: 0,
    maximumKes: 2500,
  });
  for (const value of ["-1", "NaN", "2,500", "1.123", "Infinity", "1000001"])
    assert.throws(() => parseBudget("", value));
  assert.throws(() => parseBudget("4000", "2500"));
});
test("menu is an explicit live category union and malformed ids cannot reach the API", () => {
  const query = shopBrowseQuery({
    categories: [229, 168, 229],
    search: " vanilla ",
  });
  assert.equal(query.get("category"), "229,168");
  assert.equal(query.get("category_operator"), "in");
  assert.equal(query.get("search"), "vanilla");
  assert.throws(() => shopBrowseQuery({ categories: [NaN] }));
  assert.throws(() => shopBrowseQuery({ page: 0 }));
  assert.throws(() => shopBrowseQuery({ maximumKes: Infinity }));
});

test("sorting stays server-wide across pages and rejects unsupported choices", () => {
  const cases = [
    ["popular", "popularity", "desc"],
    ["price-asc", "price", "asc"],
    ["price-desc", "price", "desc"],
    ["newest", "date", "desc"],
    ["name", "title", "asc"],
  ];
  for (const [sort, orderby, order] of cases)
    for (const page of [1, 2]) {
      const query = shopBrowseQuery({ sort, page });
      assert.equal(query.get("orderby"), orderby);
      assert.equal(query.get("order"), order);
      assert.equal(query.get("page"), String(page));
    }
  assert.throws(() => shopBrowseQuery({ sort: "unknown" }));
});
