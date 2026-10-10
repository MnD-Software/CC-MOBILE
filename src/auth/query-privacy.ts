import type { QueryClient } from "@tanstack/react-query";

const publicQueries = new Set([
  "catalogue",
  "product",
  "product-variations",
  "editorial-campaigns",
  "product-editorial",
  "campaign-products",
  "planner-cakes",
  "planner-extras",
  "planner-variants",
]);

/** Keep public browsing alive while removing account-scoped caches. Clearing
 * the entire client cancels mounted guest catalogue observers mid-request. */
export function clearPrivateQueryCache(client: QueryClient) {
  client.removeQueries({
    predicate: (query) => !publicQueries.has(String(query.queryKey[0])),
  });
  client.getMutationCache().clear();
}
