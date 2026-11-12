import { z } from "zod";
import {
  getStorageItem,
  setStorageItem,
  deleteStorageItem,
} from "@/auth/secure-storage";

const PROFILE_PREFIX = "cakecity.billing-profile.v1";

const billingProfileSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(32),
  address: z.string().trim().max(240),
  area: z.string().trim().max(160),
  city: z.string().trim().max(120),
  // Older saved profiles retain their contact/address fields and ask for the
  // missing postal code on their next save or checkout.
  postcode: z.string().trim().max(16).default(""),
});

export type BillingProfile = z.infer<typeof billingProfileSchema>;
type ProfileRequirements = {
  address?: "full" | "street" | "none";
  postcode?: boolean;
};

export function validateBillingProfile(
  profile: BillingProfile,
  requirements: ProfileRequirements = {},
): BillingProfile {
  const parsed = billingProfileSchema.safeParse(profile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue.path[0] === "email"
        ? "Enter a valid billing email address."
        : "Check your billing details. One of the fields is too long.",
    );
  }
  const value = parsed.data;
  if (!value.firstName || !value.lastName)
    throw new Error("Enter your first and last name.");
  const phone = value.phone.replace(/[\s()-]/g, "");
  if (!/^(?:\+?254|0)[17]\d{8}$/.test(phone))
    throw new Error("Enter a Kenyan phone number, for example 0712345678.");
  const address = requirements.address ?? "full";
  if (address === "full" && (!value.address || !value.area || !value.city))
    throw new Error("Enter your billing address, area and city.");
  if (address === "street" && !value.address)
    throw new Error("Enter your building, street or delivery entrance.");
  if (
    (requirements.postcode !== false || value.postcode) &&
    !/^\d{5}$/.test(value.postcode)
  )
    throw new Error("Enter your five-digit Kenyan postal code.");
  return { ...value, email: value.email.toLowerCase(), phone };
}

function profileKey(customerId: string) {
  return `${PROFILE_PREFIX}.${encodeURIComponent(customerId)}`;
}

export async function clearBillingProfile(customerId: string) {
  await deleteStorageItem(profileKey(customerId));
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
  requirements: ProfileRequirements = {},
) {
  if (!customerId.trim())
    throw new Error("Sign in before saving billing details.");
  const validated = validateBillingProfile(profile, requirements);
  await setStorageItem(profileKey(customerId), JSON.stringify(validated));
}
