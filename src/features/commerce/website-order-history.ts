import { z } from "zod";
import {
  deleteStorageItem,
  getStorageItem,
  setStorageItem,
} from "@/auth/secure-storage";
import {
  websiteOrderUrl,
  type WebsiteCheckoutResult,
  type WebsiteOrderAccess,
  type WebsiteOrderStatus,
} from "./website-checkout";

const LEGACY_HISTORY_KEY = "cakecity.website-order-history.v1";
const HISTORY_KEY_PREFIX = "cakecity.website-order-history.v2.";
const historySchema = z
  .array(
    z.object({
      id: z.number().int().positive(),
      key: z.string().min(1),
      number: z.string().min(1),
      status: z.string(),
      paymentStatus: z.string(),
      billingEmail: z.string().email().optional(),
      createdAt: z.string().datetime(),
      source: z.enum(["checkout", "receipt"]).optional(),
    }),
  )
  .max(12);

export type WebsiteOrderRecord = z.infer<typeof historySchema>[number];

function historyKey(ownerScope: string) {
  return `${HISTORY_KEY_PREFIX}${encodeURIComponent(ownerScope)}`;
}

async function removeLegacyHistory() {
  await deleteStorageItem(LEGACY_HISTORY_KEY);
}

/** Removes only the unsafe pre-account-scoped cache left by older app builds. */
export function clearLegacyWebsiteOrderHistory() {
  return deleteStorageItem(LEGACY_HISTORY_KEY);
}

/**
 * Private WooCommerce order keys are persisted only under the signed-in
 * account that started checkout. Guest purchases remain usable in their
 * current handoff, but are intentionally not made browseable on a shared
 * device after the app is restarted.
 */
export async function websiteOrderHistory(ownerScope: string | null) {
  if (!ownerScope) return [] as WebsiteOrderRecord[];
  await removeLegacyHistory();
  const saved = await getStorageItem(historyKey(ownerScope));
  if (!saved) return [] as WebsiteOrderRecord[];
  try {
    const parsed = historySchema.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveWebsiteOrder(
  order: WebsiteCheckoutResult,
  billingEmail: string,
  ownerScope: string | null,
) {
  if (!ownerScope) return null;
  const current = await websiteOrderHistory(ownerScope);
  const next: WebsiteOrderRecord = {
    id: order.order_id,
    key: order.order_key,
    number: order.order_number,
    status: order.status,
    paymentStatus: order.payment_result.payment_status,
    billingEmail: billingEmail.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  const records = [
    next,
    ...current.filter((item) => item.id !== next.id),
  ].slice(0, 12);
  await setStorageItem(historyKey(ownerScope), JSON.stringify(records));
  return next;
}

export async function clearWebsiteOrderHistory(ownerScope: string | null) {
  await Promise.all([
    deleteStorageItem(LEGACY_HISTORY_KEY),
    ...(ownerScope ? [deleteStorageItem(historyKey(ownerScope))] : []),
  ]);
}

/** A receipt is saved only after Cake City's order endpoint verifies access. */
export async function saveRecoveredWebsiteOrder(
  access: WebsiteOrderAccess,
  verified: WebsiteOrderStatus,
  ownerScope: string | null,
  stillCurrent: () => boolean,
) {
  if (!ownerScope || !stillCurrent()) return null;
  if (verified.id !== access.id || !access.billingEmail)
    throw new Error("Cake City could not verify this order.");
  const current = await websiteOrderHistory(ownerScope);
  if (!stillCurrent()) return null;
  const existing = current.find((item) => item.id === access.id);
  const next: WebsiteOrderRecord = {
    id: access.id,
    key: access.key,
    billingEmail: access.billingEmail,
    number: existing?.number ?? String(access.id),
    status: verified.status,
    paymentStatus: existing?.paymentStatus ?? "",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    source: existing?.source ?? (existing ? "checkout" : "receipt"),
  };
  // This key always belongs to the captured account, never the new account
  // if the user changes accounts while secure storage is finishing a write.
  await setStorageItem(
    historyKey(ownerScope),
    JSON.stringify(
      [next, ...current.filter((item) => item.id !== next.id)].slice(0, 12),
    ),
  );
  return stillCurrent() ? next : null;
}

export function websiteOrderReceipt(record: WebsiteOrderRecord) {
  return websiteOrderUrl({ order_id: record.id, order_key: record.key });
}
