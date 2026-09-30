import { z } from "zod";
import { websiteCartSchema as cartSchema } from "./website-cart";
import {
  deleteStorageItem,
  getStorageItem,
  setStorageItem,
} from "@/auth/secure-storage";
import type {
  WebsiteCheckoutResult,
  WebsiteCheckoutSession,
} from "./website-checkout";

const LEGACY_CART_SESSION_KEY = "cakecity.website-checkout-session.v1";
const LEGACY_PAYMENT_ATTEMPT_KEY = "cakecity.website-payment-attempt.v1";
const CART_SESSION_KEY = "cakecity.website-checkout-session.v2";
const PAYMENT_ATTEMPT_KEY = "cakecity.website-payment-attempt.v2";

// WooCommerce owns the lifetime of a Cart-Token. This is deliberately shorter
// than a normal shopping session so an abandoned token cannot be revived days
// later. A checkout attempt is retained longer because it is the customer's
// recovery route after leaving for Pesapal.
const CART_SESSION_MAX_AGE_MS = 90 * 60_000;
const PAYMENT_ATTEMPT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const checkoutResultSchema = z.object({
  order_id: z.number().int().positive(),
  order_key: z.string().min(1),
  order_number: z.string().min(1),
  status: z.string(),
  payment_result: z.object({
    payment_status: z.string(),
    redirect_url: z.string().url().nullable().optional(),
  }),
});

const ownerScopeSchema = z.string().regex(/^customer:[A-Za-z0-9._-]{1,128}$/);

const cartSessionSchema = z.object({
  version: z.literal(1),
  ownerScope: ownerScopeSchema,
  fingerprint: z.string().regex(/^cc-cart-v1:[a-f0-9]{8}$/),
  createdAt: z.string().datetime(),
  cartToken: z.string().min(1),
  cart: cartSchema,
});

const paymentAttemptSchema = z.object({
  version: z.literal(1),
  ownerScope: ownerScopeSchema,
  fingerprint: z.string().regex(/^cc-cart-v1:[a-f0-9]{8}$/),
  createdAt: z.string().datetime(),
  order: checkoutResultSchema,
});

type StoredCartSession = z.infer<typeof cartSessionSchema>;
type StoredPaymentAttempt = z.infer<typeof paymentAttemptSchema>;

/**
 * Recovery records contain a Cart-Token or private order key, so they belong
 * only to a signed-in account. Guest checkout remains possible, but its
 * sensitive handoff never survives an app/account boundary on a shared device.
 */
export function websiteCheckoutOwnerScope(
  customerId: string | number | null | undefined,
) {
  const normalized = String(customerId ?? "").trim();
  return ownerScopeSchema.safeParse(`customer:${normalized}`).success
    ? `customer:${normalized}`
    : null;
}

function isFresh(isoDate: string, maxAgeMs: number) {
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) && Date.now() - timestamp < maxAgeMs;
}

async function readStored<T>(
  key: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const raw = await getStorageItem(key);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // A corrupt recovery record is never a reason to block a fresh checkout.
  }
  await deleteStorageItem(key);
  return null;
}

async function removeLegacyRecoveryRecords() {
  await Promise.all([
    deleteStorageItem(LEGACY_CART_SESSION_KEY),
    deleteStorageItem(LEGACY_PAYMENT_ATTEMPT_KEY),
  ]);
}

/**
 * A compact, non-reversible identity for the exact local bag and account
 * scope. It is only used to decide whether a saved Cart-Token may be reused;
 * token access is still protected by SecureStore.
 */
export function websiteCheckoutFingerprint(
  lines: ReadonlyArray<{
    key: string;
    product_id?: number;
    quantity: number;
    selection: { variation_id?: number };
  }>,
  customerScope: string | null,
) {
  const source = JSON.stringify([
    customerScope ?? "guest-ephemeral",
    lines.map((line) => [
      line.key,
      line.product_id ?? null,
      line.selection.variation_id ?? null,
      line.quantity,
    ]),
  ]);

  // FNV-1a is used as an identifier, not a security primitive. No customer
  // message, email, address, or raw line key is persisted with the session.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `cc-cart-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function loadWebsiteCheckoutSession(
  fingerprint: string,
  ownerScope: string | null,
) {
  if (!ownerScope) return null;
  await removeLegacyRecoveryRecords();
  const stored = await readStored(CART_SESSION_KEY, cartSessionSchema);
  if (!stored) return null;
  if (
    stored.ownerScope !== ownerScope ||
    stored.fingerprint !== fingerprint ||
    !isFresh(stored.createdAt, CART_SESSION_MAX_AGE_MS)
  ) {
    await deleteStorageItem(CART_SESSION_KEY);
    return null;
  }
  const session: WebsiteCheckoutSession = {
    cart: stored.cart,
    cartToken: stored.cartToken,
  };
  return session;
}

export async function saveWebsiteCheckoutSession(
  fingerprint: string,
  session: WebsiteCheckoutSession,
  ownerScope: string | null,
) {
  if (!ownerScope) {
    await clearWebsiteCheckoutSession();
    return;
  }
  const record: StoredCartSession = {
    version: 1,
    ownerScope,
    fingerprint,
    createdAt: new Date().toISOString(),
    cartToken: session.cartToken,
    cart: session.cart,
  };
  await setStorageItem(CART_SESSION_KEY, JSON.stringify(record));
}

export function clearWebsiteCheckoutSession() {
  return Promise.all([
    deleteStorageItem(CART_SESSION_KEY),
    deleteStorageItem(LEGACY_CART_SESSION_KEY),
  ]).then(() => undefined);
}

export async function loadWebsitePaymentAttempt(
  fingerprint: string,
  ownerScope: string | null,
) {
  if (!ownerScope) return null;
  await removeLegacyRecoveryRecords();
  const stored = await readStored(PAYMENT_ATTEMPT_KEY, paymentAttemptSchema);
  if (!stored) return null;
  if (
    stored.ownerScope !== ownerScope ||
    stored.fingerprint !== fingerprint ||
    !isFresh(stored.createdAt, PAYMENT_ATTEMPT_MAX_AGE_MS)
  ) {
    await deleteStorageItem(PAYMENT_ATTEMPT_KEY);
    return null;
  }
  return stored.order as WebsiteCheckoutResult;
}

export async function saveWebsitePaymentAttempt(
  fingerprint: string,
  order: WebsiteCheckoutResult,
  ownerScope: string | null,
) {
  if (!ownerScope) {
    await clearWebsitePaymentAttempt();
    return;
  }
  const record: StoredPaymentAttempt = {
    version: 1,
    ownerScope,
    fingerprint,
    createdAt: new Date().toISOString(),
    order,
  };
  await setStorageItem(PAYMENT_ATTEMPT_KEY, JSON.stringify(record));
}

export function clearWebsitePaymentAttempt() {
  return Promise.all([
    deleteStorageItem(PAYMENT_ATTEMPT_KEY),
    deleteStorageItem(LEGACY_PAYMENT_ATTEMPT_KEY),
  ]).then(() => undefined);
}
