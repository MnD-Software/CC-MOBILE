import { useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseTest, purchaseTestOrigin } from "./client";

export function usePurchasePreview() {
  const origin = purchaseTestOrigin();
  return useQuery({
    queryKey: ["purchase-preview", origin],
    queryFn: async () =>
      (await purchaseTest.connected()) ? purchaseTest.state() : null,
    enabled: Boolean(origin),
    retry: false,
    staleTime: 0,
  });
}

export function useRefreshPurchase() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["purchase-preview"] }),
      cache.invalidateQueries({ queryKey: ["club"] }),
      cache.invalidateQueries({ queryKey: ["club-transactions"] }),
      cache.invalidateQueries({ queryKey: ["purchase-receipt"] }),
    ]);
  };
}
