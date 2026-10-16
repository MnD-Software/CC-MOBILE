require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const native = require("react-native-web");
const { storeProductSchema } = require("../src/features/commerce/contracts.ts");
const {
  cartSuggestions,
} = require("../src/features/commerce/cart-upselling.ts");
const item = (id, name, on_sale = false) =>
  storeProductSchema.parse({
    id,
    name,
    slug: `p-${id}`,
    on_sale,
    is_in_stock: true,
    is_purchasable: true,
    prices: {
      price: "10000",
      regular_price: "15000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
  });
function render(states, lines = []) {
  const queries = [];
  const code = ts.transpileModule(
    fs.readFileSync("src/features/commerce/CartSuggestions.tsx", "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name === "@tanstack/react-query")
        return {
          useQuery(options) {
            queries.push(options);
            return {
              isPending: false,
              isFetching: false,
              isError: false,
              ...states[options.queryKey[2]],
            };
          },
        };
      if (name === "react-native") return native;
      if (name.endsWith("/Typography")) return { Text: native.Text };
      if (name.endsWith("/Button"))
        return {
          Button: ({ label }) => React.createElement("button", null, label),
        };
      if (name.endsWith("/Commerce"))
        return {
          ProductTile: ({ product }) =>
            React.createElement(
              "button",
              { "data-product-id": product.id },
              product.name,
            ),
        };
      if (name.endsWith("/ThemeProvider"))
        return { useTheme: () => ({ colors: {} }) };
      if (name === "./api")
        return { shopApi: {}, CATALOGUE_STALE_TIME_MS: 300000 };
      if (name === "./cart-upselling") return { cartSuggestions };
      return require(name);
    },
  };
  vm.runInNewContext(code, context);
  return {
    html: renderToStaticMarkup(
      React.createElement(context.exports.CartSuggestions, { lines }),
    ),
    queries,
  };
}

test("empty-cart UI renders available offers even if popularity fails, with retry", () => {
  const { html, queries } = render({
    offers: { data: { data: [item(1, "Offer cake", true)] } },
    popular: { isError: true },
  });
  assert.match(html, /Offers for you/);
  assert.match(html, /Offer cake/);
  assert.match(html, /Retry suggestions/);
  assert.doesNotMatch(html, /Popular picks|Complete your celebration/);
  assert.equal(queries.find((q) => q.queryKey[2] === "extras").enabled, false);
});

test("cart UI shows loading and honest empty states without invented products", () => {
  assert.match(
    render({ offers: { isPending: true, isFetching: true } }).html,
    /Loading suggestions/,
  );
  assert.doesNotMatch(
    render({ offers: { isPending: true, isFetching: true } }).html,
    /No suggestions/,
  );
  const { html } = render({});
  assert.match(html, /No suggestions are available/);
  assert.doesNotMatch(html, /data-product-id/);
});

test("filled-cart UI recommends each complementary item once and removes it after adding", () => {
  const states = {
    offers: { data: { data: [item(2, "Birthday candle", true)] } },
    popular: {
      data: {
        data: [item(1, "Chocolate Cake"), item(2, "Birthday candle", true)],
      },
    },
    extras: { data: [item(2, "Birthday candle", true)] },
  };
  const lines = [{ product_id: 1, name: "Chocolate Cake" }];
  const { html, queries } = render(states, lines);
  assert.match(html, /Complete your celebration/);
  assert.equal((html.match(/data-product-id="2"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /data-product-id="1"/);
  assert.equal(queries.find((q) => q.queryKey[2] === "extras").enabled, true);
  assert.doesNotMatch(
    render(states, [...lines, { product_id: 2, name: "Birthday candle" }]).html,
    /data-product-id/,
  );
});
