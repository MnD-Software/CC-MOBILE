require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const contracts = require("../src/features/commerce/contracts.ts");

test("cold product links use targeted lookups and subsequent taps reuse validated records", async () => {
  const calls = [];
  const product = contracts.storeProductSchema.parse({
    id: 42,
    name: "Chocolate cake",
    slug: "chocolate-cake",
    is_in_stock: true,
    prices: {
      price: "100000",
      regular_price: "100000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
  });
  const client = {
    api: {
      get: async (path, options) => {
        calls.push({ path, options });
        return path.includes("missing") ? [] : [product];
      },
    },
    ApiError: class extends Error {},
    isApiError: () => false,
  };
  const context = {
    exports: {},
    URLSearchParams,
    require(name) {
      if (name === "zod") return require("zod");
      if (name === "./contracts") return contracts;
      if (name === "@/api/client") return client;
      if (name === "./catalogue-cache")
        return {
          rememberLiveCatalogueProducts() {},
          cachedLiveCatalogueProducts: async () => null,
        };
      if (name === "./shop-browse")
        return require("../src/features/commerce/shop-browse.ts");
      throw new Error(name);
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/features/commerce/api.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    context,
  );
  const shop = context.exports.shopApi;
  const signal = new AbortController().signal;
  assert.equal((await shop.product("42", signal)).id, 42);
  assert.match(calls[0].path, /include=42/);
  assert.equal(calls[0].options.signal, signal);
  assert.equal((await shop.product("chocolate-cake")).id, 42);
  assert.equal(
    calls.length,
    1,
    "ID and slug should share the same validated cache record",
  );
  await assert.rejects(shop.product("missing-cake"));
  assert.match(calls[1].path, /slug=missing-cake/);
  assert.equal(
    calls.length,
    2,
    "A missing product must not scan catalogue pages",
  );
});
