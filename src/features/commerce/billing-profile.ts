import { z } from "zod";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";

const PROFILE_PREFIX = "cakecity.billing-profile.v1";

const billingProfileSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32),
  address: z.string().trim().max(240),
  area: z.string().trim().max(160),
  city: z.string().trim().max(120),
});

export type BillingProfile = z.infer<typeof billingProfileSchema>;

function profileKey(customerId: string) {
  return `${PROFILE_PREFIX}.${encodeURIComponent(customerId)}`;
}

/**
 * Stores only a customer's editable billing fields in the native secure store.
 * It is a convenience cache, not a server-side address book or payment record.
 */
export async function loadBillingProfile(customerId: string) {
  if (!customerId.trim()) return null;
  try {
    const saved = await getStorageItem(profileKey(customerId));
    if (!saved) return null;
    const parsed = billingProfileSchema.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveBillingProfile(
  customerId: string,
  profile: BillingProfile,
) {
  if (!customerId.trim()) return;
  const validated = billingProfileSchema.parse(profile);
  await setStorageItem(profileKey(customerId), JSON.stringify(validated));
}
