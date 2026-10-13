require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const { storeProductSchema } = require("../src/features/commerce/contracts.ts");

test("offline catalogue expires in memory as well as on disk, including future timestamps", async () => {
  let now = 1000000;
  let saved = null;
  const product = storeProductSchema.parse({
    id: 1,
    name: "Cake",
    slug: "cake",
    is_in_stock: true,
    prices: {
      price: "100000",
      regular_price: "100000",
      currency_code: "KES",
      currency_minor_unit: 2,
    },
  });
  const source = ts.transpileModule(
    fs.readFileSync("src/features/commerce/catalogue-cache.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const context = {
    exports: {},
    Date: { now: () => now },
    require(name) {
      if (name === "@react-native-async-storage/async-storage")
        return {
          getItem: async () => saved,
          setItem: async (_key, value) => {
            saved = value;
          },
          removeItem: async () => {
            saved = null;
          },
        };
      if (name === "zod") return require("zod");
      if (name === "./contracts") return { storeProductSchema };
      if (name === "@/observability/commerce-events")
        return { recordPerformanceMetric() {} };
      throw new Error(name);
    },
  };
  vm.runInNewContext(source, context);
  const cache = context.exports;
  cache.rememberLiveCatalogueProducts([product]);
  const query = { page: 1, perPage: 24 };
  assert.equal((await cache.cachedLiveCatalogueProducts(query)).length, 1);
  now += 86400000;
  assert.equal(await cache.cachedLiveCatalogueProducts(query), null);
  assert.equal(saved, null);
  saved = JSON.stringify({ savedAt: now + 1000, products: [product] });
  assert.equal(await cache.cachedLiveCatalogueProducts(query), null);
});
