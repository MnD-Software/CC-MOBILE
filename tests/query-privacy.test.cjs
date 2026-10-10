require("./register.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { QueryClient } = require("@tanstack/react-query");
const { clearPrivateQueryCache } = require("../src/auth/query-privacy.ts");

test("session restoration does not cancel an in-flight public catalogue request", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let complete;
  let aborted = false;
  const request = client.fetchQuery({
    queryKey: ["catalogue", "shop"],
    queryFn: ({ signal }) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  clearPrivateQueryCache(client);
  complete([{ id: 1 }]);
  assert.deepEqual(await request, [{ id: 1 }]);
  assert.equal(aborted, false);
  client.clear();
});

test("switching accounts removes all private queries and mutations, preserving only public records", () => {
  const client = new QueryClient();
  for (const key of [
    "catalogue",
    "product",
    "product-variations",
    "editorial-campaigns",
    "product-editorial",
    "campaign-products",
    "planner-cakes",
    "planner-extras",
    "planner-variants",
    "website-order",
    "website-order-history",
    "addresses",
    "studio-quote",
    "unknown-account-feature",
    "staff-content",
  ]) {
    client.setQueryData([key], { value: true });
  }
  clearPrivateQueryCache(client);
  assert.deepEqual(
    client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey[0])
      .sort(),
    [
      "catalogue",
      "product",
      "product-variations",
      "editorial-campaigns",
      "product-editorial",
      "campaign-products",
      "planner-cakes",
      "planner-extras",
      "planner-variants",
    ].sort(),
  );
  assert.equal(client.getMutationCache().getAll().length, 0);
  client.clear();
});
