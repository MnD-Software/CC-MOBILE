import { z } from "zod";
import * as Crypto from "expo-crypto";
import {
  getStorageItem,
  setStorageItem,
  deleteStorageItem,
} from "@/auth/secure-storage";
import { paymentSchema, selectionSchema } from "./contracts";
const KEY = "cakecity.payment-attempt.v2";
const attemptSchema = z.object({
  key: z.string().min(1),
  owner: z.string().min(1),
  payload: z.object({
    method: z.enum(["mpesa", "card", "wallet"]),
    checkout: z.object({
      items: z
        .array(
          selectionSchema.extend({
            product_slug: z.string().min(1),
            quantity: z.number().int().min(1).max(20),
          }),
        )
        .min(1)
        .max(30),
      fulfilment: z.enum(["delivery", "pickup"]),
      delivery_area: z.string().optional(),
      delivery_slot: z.string().optional(),
      coupon_code: z.string().optional(),
      branch_id: z.string().optional(),
      delivery_quote_id: z.string().optional(),
    }),
    customer: z.object({
      name: z.string().min(1),
      email: z.email(),
      phone: z.string().min(1),
    }),
    delivery_address: z
      .object({
        line1: z.string(),
        area: z.string(),
        city: z.string(),
        notes: z.string().optional(),
      })
      .optional(),
  }),
  intent: paymentSchema.optional(),
});
export type PaymentAttempt = z.infer<typeof attemptSchema>;
// The request is durably recorded before contacting the provider. A lost
// response or process restart reuses the same intent and idempotency key.
const ownerKey = (owner: string) => KEY + "." + owner.replace(/[^\w.-]/g, "_");
export async function persistAttempt(attempt: PaymentAttempt) {
  await setStorageItem(
    ownerKey(attempt.owner),
    JSON.stringify(attemptSchema.parse(attempt)),
  );
}
export async function restoreAttempt(
  owner: string,
): Promise<PaymentAttempt | null> {
  const value = await getStorageItem(ownerKey(owner));
  if (!value) return null;
  try {
    const record = attemptSchema.parse(JSON.parse(value));
    if (record.owner !== owner) throw new Error("Invalid payment owner");
    return record;
  } catch {
    throw new Error(
      "Your payment recovery information could not be verified. Contact Cake City before starting another payment.",
    );
  }
}
export async function createAttempt(
  owner: string,
  payload: PaymentAttempt["payload"],
) {
  const attempt = { key: Crypto.randomUUID(), owner, payload };
  await persistAttempt(attempt);
  return attempt;
}
export async function clearAttempt(owner: string) {
  await deleteStorageItem(ownerKey(owner));
}
