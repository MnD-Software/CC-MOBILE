import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import type { AppOrder } from "./app-orders";
import type { CheckoutInput } from "./contracts";
import { isVerifiedPayment, paymentCelebrationKey } from "./checkout-success";
import { useBag } from "./store";

/** The checkout and resumed-payment screen share one verified success path. */
export function usePaymentSuccess(
  order: AppOrder | null | undefined,
  owner: string,
  onError: (message: string) => void,
) {
  const settle = useBag((s) => s.settle);
  const queryClient = useQueryClient();
  const [celebrate, setCelebrate] = useState(false);
  const celebrated = useRef(new Set<string>());
  const endCelebration = useCallback(() => setCelebrate(false), []);
  useEffect(() => {
    if (!order || !isVerifiedPayment(order)) return;
    let active = true;
    const items = (order.snapshot?.lines || []).map((l) => ({
      product_slug: l.slug,
      quantity: l.quantity,
      ...l.selection,
    })) as CheckoutInput["items"];
    void settle(order.reference, items).catch(() => {
      if (active)
        onError(
          "Your payment is confirmed. Reopen Your orders if the bag has not refreshed.",
        );
    });
    void queryClient.invalidateQueries({ queryKey: ["app-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["club"] });
    const key = paymentCelebrationKey(owner, order.reference);
    if (!celebrated.current.has(key)) {
      void getStorageItem(key)
        .then(async (seen) => {
          if (seen || !active) return;
          celebrated.current.add(key);
          await setStorageItem(key, "confirmed");
          if (active) setCelebrate(true);
        })
        .catch(() => {
          if (active) setCelebrate(true);
        });
    }
    return () => {
      active = false;
    };
  }, [
    owner,
    order?.reference,
    order?.payment_state,
    order?.paid_at,
    settle,
    queryClient,
    onError,
  ]);
  return { celebrate, endCelebration };
}
