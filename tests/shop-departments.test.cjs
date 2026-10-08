require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  matchesShopSelection,
} = require("../src/features/commerce/shop-departments.ts");
const product = (name, categories, description = "", attributes = []) => ({
  name,
  categories: categories.map((id) => ({ id, name: "" })),
  description,
  short_description: "",
  attributes,
});
test("flavour and cake-base filters cannot leak other pound cakes or signatures", () => {
  assert.equal(
    matchesShopSelection(
      product("Vanilla Pound Cake", [170]),
      "vanilla",
      "pound",
    ),
    true,
  );
  assert.equal(
    matchesShopSelection(
      product("Chocolate Orange", [170]),
      "vanilla",
      "pound",
    ),
    false,
  );
  assert.equal(
    matchesShopSelection(
      product("Chocolate Orange", [170]),
      "chocolate",
      "pound",
    ),
    true,
  );
  assert.equal(
    matchesShopSelection(
      product("Milk Chocolate", [168, 229]),
      "signature",
      "chocolate",
    ),
    true,
  );
  assert.equal(
    matchesShopSelection(
      product("Milk Chocolate", [168]),
      "signature",
      "chocolate",
    ),
    false,
  );
  assert.equal(
    matchesShopSelection(
      product("Vanilla sponge", [169]),
      "signature",
      "vanilla",
    ),
    false,
  );
});
test("prep-time and cupcake filters require published evidence", () => {
  assert.equal(
    matchesShopSelection(product("Cheesecake", [171]), "cheesecakes", "24"),
    false,
  );
  assert.equal(
    matchesShopSelection(
      product("Cheesecake", [171], "", [
        { name: "Preparation time", terms: [{ name: "48 hours" }] },
      ]),
      "cheesecakes",
      "48",
    ),
    true,
  );
  assert.equal(
    matchesShopSelection(
      product("Cheesecake", [171], "48 hours"),
      "cheesecakes",
      "24",
    ),
    false,
  );
  assert.equal(
    matchesShopSelection(
      product("Assorted (Plain)", [110]),
      "cupcakes",
      "plain",
    ),
    true,
  );
  assert.equal(
    matchesShopSelection(
      product("Assorted (Frosted)", [110]),
      "cupcakes",
      "plain",
    ),
    false,
  );
  assert.equal(
    matchesShopSelection(
      product("Custom Cupcakes", [110]),
      "cupcakes",
      "filled",
    ),
    false,
  );
});
