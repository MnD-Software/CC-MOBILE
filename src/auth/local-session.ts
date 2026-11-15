import type { QueryClient } from "@tanstack/react-query";
import { forgetAccountUnlock } from "./session-unlock";
import { clearPrivateQueryCache } from "./query-privacy";
import {
  clearWebsiteCheckoutSession,
  clearWebsitePaymentAttempt,
} from "@/features/commerce/website-checkout-session";
import { clearLegacyWebsiteOrderHistory } from "@/features/commerce/website-order-history";
import {
  claimDeviceState,
  releaseDeviceState,
} from "@/features/commerce/store";

export { claimDeviceState };

/**
 * One cleanup for every way a session ends (manual sign-out, revoked or
 * expired refresh). Memory is cleared synchronously so nothing private stays
 * visible; the returned promise settles once device storage is cleared and
 * never rejects, so callers can still revoke the server session.
 */
export function wipeLocalSession(
  cache: QueryClient,
  owner: string | null,
): Promise<void> {
  if (owner) forgetAccountUnlock(owner);
  releaseDeviceState();
  clearPrivateQueryCache(cache);
  return Promise.allSettled([
    clearWebsiteCheckoutSession(),
    clearWebsitePaymentAttempt(),
    clearLegacyWebsiteOrderHistory(),
  ]).then(() => undefined);
}

