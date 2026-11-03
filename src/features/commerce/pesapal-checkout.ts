import { z } from "zod";
import { api } from "@/api/client";
import { validateBillingProfile } from "./billing-profile";
import { websiteCartSchema } from "./website-cart";
import type {
  WebsiteCheckoutDetails,
  WebsiteCheckoutResult,
  WebsiteCheckoutSession,
} from "./website-checkout";

const resultSchema = z.object({
  order_id: z.number().int().positive(),
  order_key: z.string().min(1),
  order_number: z.string().min(1),
  status: z.string(),
  payment_provider: z.literal("pesapal-api3"),
  billing_email: z.string().email(),
  payment_state: z.enum([
    "creating",
    "uncertain",
    "pending",
    "completed",
    "failed",
    "reversed",
  ]),
  payment_result: z.object({
    payment_status: z.enum(["success", "pending"]),
    redirect_url: z.string().url().nullable(),
  }),
});

export const pesapalConfigSchema = z.object({
  available: z.boolean(),
  environment: z.enum(["live", "sandbox"]),
  provider: z.literal("pesapal-api3"),
});

export async function loadPesapalConfiguration() {
  return pesapalConfigSchema.parse(
    await api.get("/v1/payments/pesapal/config", { timeoutMs: 45_000 }),
  );
}

async function requestCheckout(
  session: WebsiteCheckoutSession,
  rawDetails: WebsiteCheckoutDetails,
  coupon: string | null = null,
  path = "/checkout",
) {
  if (process.env.EXPO_PUBLIC_LOCAL_REVIEW === "1")
    throw new Error("Live payments are disabled in the local review.");
  const details = validateBillingProfile(rawDetails);
  const billing = {
    first_name: details.firstName.trim(),
    last_name: details.lastName.trim(),
    company: "",
    address_1: details.address.trim(),
    address_2: details.area.trim(),
    city: details.city.trim(),
    state: "KE30",
    postcode: details.postcode.trim(),
    country: "KE",
    phone: details.phone.replace(/\s/g, ""),
    email: details.email.trim(),
  };
  return api.post(
    "/v1/payments/pesapal" + path,
    {
      billing_address: billing,
      shipping_address: rawDetails.gift
        ? {
            ...billing,
            first_name: rawDetails.gift.firstName.trim(),
            last_name: rawDetails.gift.lastName.trim(),
            phone: rawDetails.gift.phone.replace(/\s/g, ""),
            email: "",
          }
        : billing,
      billing_email: billing.email,
      customer_note: [
        rawDetails.notes?.trim(),
        rawDetails.gift?.message.trim()
          ? `Gift message: ${rawDetails.gift.message.trim()}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      expected_total: session.cart.totals.total_price,
      expected_coupon: coupon,
      expected_items: session.cart.items.map(({ id, quantity }) => ({
        id,
        quantity,
      })),
    },
    { headers: { "Cart-Token": session.cartToken }, timeoutMs: 120_000 },
  );
}

export async function quotePesapalCheckout(
  session: WebsiteCheckoutSession,
  details: WebsiteCheckoutDetails,
  coupon: string | null,
) {
  const response = await requestCheckout(session, details, coupon, "/quote");
  const existing = z
    .object({ existing_payment: resultSchema })
    .safeParse(response);
  if (existing.success)
    return { ...session, existingOrder: existing.data.existing_payment };
  return {
    cart: websiteCartSchema.parse(response),
    cartToken: session.cartToken,
    existingOrder: undefined,
  };
}

export async function submitPesapalCheckout(
  session: WebsiteCheckoutSession,
  details: WebsiteCheckoutDetails,
  coupon: string | null = null,
): Promise<WebsiteCheckoutResult> {
  return resultSchema.parse(await requestCheckout(session, details, coupon));
}

export async function verifyPesapalCheckout(
  order: WebsiteCheckoutResult,
  email: string,
) {
  if (process.env.EXPO_PUBLIC_LOCAL_REVIEW === "1")
    throw new Error("Live payments are disabled in the local review.");
  return resultSchema.parse(
    await api.post(
      `/v1/payments/pesapal/orders/${order.order_id}/verify`,
      {
        order_key: order.order_key,
        billing_email: email,
      },
      { timeoutMs: 90_000 },
    ),
  );
}
