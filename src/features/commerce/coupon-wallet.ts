import { useEffect } from "react";
import { create } from "zustand";
import { z } from "zod";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import { normalizeCouponCode } from "./website-cart";
import { websiteCheckoutOwnerScope } from "./website-checkout-session";

const walletSchema = z.object({
  codes: z.array(z.string().min(1).max(100)).max(20),
  selected: z.string().min(1).max(100).nullable(),
});
type Wallet = z.infer<typeof walletSchema>;
const EMPTY: Wallet = { codes: [], selected: null };
const wallets = create<{
  byScope: Record<string, Wallet>;
  ready: Record<string, boolean>;
}>(() => ({ byScope: {}, ready: {} }));
const loads = new Map<string, Promise<void>>();
const writes = new Map<string, Promise<void>>();
let activeScope: string | null = null;

export function couponWalletScope(customerId?: string | number | null) {
  return websiteCheckoutOwnerScope(customerId) ?? "guest";
}

function key(scope: string) {
  return `cakecity.coupons.v1.${scope.replace(":", ".")}`;
}

export async function loadCouponWallet(scope: string) {
  if (activeScope !== scope) {
    // Guest codes belong to this browsing session, never to the next account.
    wallets.setState((state) => ({
      byScope: { ...state.byScope, guest: EMPTY },
    }));
    activeScope = scope;
  }
  if (wallets.getState().ready[scope]) return;
  if (loads.has(scope)) return loads.get(scope);
  const load = (async () => {
    let wallet = EMPTY;
    if (scope !== "guest") {
      const raw = await getStorageItem(key(scope));
      if (raw) {
        try {
          const parsed = walletSchema.safeParse(JSON.parse(raw));
          if (parsed.success) {
            const codes = [
              ...new Set(parsed.data.codes.map(normalizeCouponCode)),
            ];
            const selected = parsed.data.selected
              ? normalizeCouponCode(parsed.data.selected)
              : null;
            wallet = {
              codes,
              selected: selected && codes.includes(selected) ? selected : null,
            };
          }
        } catch {
          /* Corrupt local data never becomes an accepted coupon. */
        }
      }
    }
    wallets.setState((state) => ({
      byScope: { ...state.byScope, [scope]: wallet },
      ready: { ...state.ready, [scope]: true },
    }));
  })();
  loads.set(scope, load);
  try {
    await load;
  } finally {
    loads.delete(scope);
  }
}

function changeWallet(scope: string, update: (wallet: Wallet) => Wallet) {
  const operation = (writes.get(scope) ?? Promise.resolve())
    .catch(() => undefined)
    .then(async () => {
      await loadCouponWallet(scope);
      const next = update(wallets.getState().byScope[scope] ?? EMPTY);
      if (scope !== "guest")
        await setStorageItem(key(scope), JSON.stringify(next));
      wallets.setState((state) => ({
        byScope: { ...state.byScope, [scope]: next },
      }));
    });
  writes.set(scope, operation);
  return operation;
}

export function saveCouponCode(scope: string, value: string, select = false) {
  const code = normalizeCouponCode(value);
  return changeWallet(scope, (wallet) => {
    if (!wallet.codes.includes(code) && wallet.codes.length >= 20)
      throw new Error(
        "Your wallet holds 20 codes. Remove an unused code first.",
      );
    return {
      codes: [...new Set([code, ...wallet.codes])],
      selected: select ? code : wallet.selected,
    };
  });
}

export function removeCouponCode(scope: string, value: string) {
  const code = normalizeCouponCode(value);
  return changeWallet(scope, (wallet) => ({
    codes: wallet.codes.filter((saved) => saved !== code),
    selected: wallet.selected === code ? null : wallet.selected,
  }));
}

export function selectCouponCode(scope: string, value: string | null) {
  if (value) return saveCouponCode(scope, value, true);
  return changeWallet(scope, (wallet) => ({ ...wallet, selected: null }));
}

export function readCouponWallet(scope: string) {
  return wallets.getState().byScope[scope] ?? EMPTY;
}

export function useCouponWallet(customerId?: string | number | null) {
  const scope = couponWalletScope(customerId);
  const wallet = wallets((state) => state.byScope[scope] ?? EMPTY);
  const ready = wallets((state) => state.ready[scope] ?? false);
  useEffect(() => {
    void loadCouponWallet(scope).catch(() => undefined);
  }, [scope]);
  return { ...wallet, ready, scope };
}
