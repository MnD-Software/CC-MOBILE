require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  matchesShopSelection,
  shopDepartments,
  departmentForCategory,
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

test("opening a category shows its whole range before applying flavour subfilters", () => {
  const signature = product("Signature Chocolate", [229, 168]);
  assert.equal(matchesShopSelection(signature, "signature", "all"), true);
  assert.equal(matchesShopSelection(signature, "signature", "vanilla"), false);
  assert.equal(
    matchesShopSelection(product("Signature cake", [229]), "signature", "all"),
    true,
  );
  for (const id of ["vanilla", "chocolate", "signature"])
    assert.equal(shopDepartments.find((d) => d.id === id).filters[0].id, "all");
  assert.equal(
    shopDepartments.find((d) => d.id === "all").categories.length,
    0,
  );
  assert.equal(
    matchesShopSelection(product("Floral cake", [249]), "all", "all"),
    true,
  );
});

test("original custom, pound and deals categories keep their exact category selection", () => {
  for (const [category, department] of [
    [123, "custom"],
    [170, "pound"],
    [206, "deals"],
  ]) {
    assert.equal(departmentForCategory(category), department);
    assert.deepEqual(
      shopDepartments.find((d) => d.id === department).categories,
      [category],
    );
    assert.equal(
      matchesShopSelection(product("Cake", [category]), department, "all"),
      true,
    );
    assert.equal(
      matchesShopSelection(product("Other cake", [229]), department, "all"),
      false,
    );
  }
  assert.equal(
    matchesShopSelection(product("Other offer", [98]), "deals", "all"),
    false,
  );
});
