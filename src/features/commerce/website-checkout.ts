import { z } from "zod";
import {
  reportNetworkFailure,
  reportNetworkSuccess,
} from "@/platform/connectivity";
import type { BagLine } from "./contracts";
import {
  cartHasRequestedCoupon,
  normalizeCouponCode,
  websiteCartSchema as cartSchema,
} from "./website-cart";
import {
  clearWebsiteCheckoutSession,
  loadWebsiteCheckoutSession,
  saveWebsiteCheckoutSession,
} from "./website-checkout-session";

const STORE_API = "https://cakecity.co.ke/wp-json/wc/store/v1";
const REQUEST_TIMEOUT_MS = 45_000;

const orderStatusSchema = cartSchema.extend({
  id: z.number().int().positive(),
  status: z.string().min(1),
});

const checkoutSchema = z.object({
  order_id: z.number().int().positive(),
  order_key: z.string().min(1),
  order_number: z.string().min(1),
  status: z.string(),
  payment_result: z.object({
    payment_status: z.string(),
    redirect_url: z.string().url().nullable().optional(),
  }),
});

export type WebsiteCart = z.infer<typeof cartSchema>;
export type WebsiteOrderStatus = z.infer<typeof orderStatusSchema>;
export type WebsiteCheckoutResult = z.infer<typeof checkoutSchema>;
export type WebsiteCheckoutSession = {
  cart: WebsiteCart;
  cartToken: string;
};

export type WebsiteCheckoutDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  area: string;
  city: string;
  notes?: string;
};

export type WebsiteOrderAccess = {
  id: number;
  key: string;
  billingEmail?: string;
};

export class WebsiteCheckoutError extends Error {
  readonly status: number | null;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WebsiteCheckoutError";
    this.status = status ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function errorMessage(value: unknown, fallback: string) {
  const result = z.object({ message: z.string().min(1) }).safeParse(value);
  return result.success ? result.data.message : fallback;
}

async function storeRequest(
  path: string,
  options: RequestInit = {},
  cartToken?: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body) headers.set("Content-Type", "application/json");
    if (cartToken) headers.set("Cart-Token", cartToken);

    const response = await fetch(STORE_API + path, {
      ...options,
      headers,
      signal: controller.signal,
    });
    reportNetworkSuccess();
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new WebsiteCheckoutError(
        errorMessage(body, "Cake City could not update your secure cart."),
        response.status,
      );

    return {
      body,
      cartToken: response.headers.get("cart-token") ?? cartToken ?? "",
    };
  } catch (error) {
    // A response was received for Store API validation/HTTP errors. It is not
    // an offline signal and must not replace a useful recovery message with an
    // incorrect offline banner.
    if (error instanceof WebsiteCheckoutError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new WebsiteCheckoutError(
        "Cake City took too long to respond. Please try again.",
      );
    reportNetworkFailure();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function lineProductId(line: BagLine) {
  return line.selection.variation_id ?? line.product_id;
}

function lineVariation(line: BagLine) {
  if (!line.selection.variation_id) return undefined;
  const attributes = line.selection.variation_attributes ?? [];
  if (!attributes.length)
    throw new Error(
      "This cake needs its variation details refreshed before secure checkout.",
    );
  return attributes;
}

/**
 * Creates a short-lived, server-owned WooCommerce cart. Prices and stock are
 * always supplied by Cake City; no local bag total is sent to checkout.
 */
export async function createWebsiteCart(
  lines: readonly BagLine[],
): Promise<WebsiteCheckoutSession> {
  if (!lines.length) throw new Error("Your bag is empty.");
  if (lines.some((line) => !lineProductId(line)))
    throw new Error(
      "One of these cakes needs its options confirmed on Cake City's website before checkout.",
    );

  const initial = await storeRequest("/cart");
  let cartToken = initial.cartToken;
  if (!cartToken)
    throw new Error(
      "Cake City could not start a secure cart. Please try again.",
    );

  let cart = cartSchema.safeParse(initial.body);
  if (!cart.success)
    throw new Error("Cake City returned an incomplete cart. Please try again.");

  for (const line of lines) {
    const variation = lineVariation(line);
    const result = await storeRequest(
      "/cart/add-item",
      {
        method: "POST",
        body: JSON.stringify({
          id: lineProductId(line),
          quantity: line.quantity,
          ...(variation ? { variation } : {}),
        }),
      },
      cartToken,
    );
    cartToken = result.cartToken;
    cart = cartSchema.safeParse(result.body);
    if (!cart.success)
      throw new Error("Cake City could not verify every item in your bag.");
  }

  return { cart: cart.data, cartToken };
}

async function refreshWebsiteCart(
  cartToken: string,
): Promise<WebsiteCheckoutSession> {
  const result = await storeRequest("/cart", {}, cartToken);
  if (!result.cartToken)
    throw new WebsiteCheckoutError(
      "Cake City could not restore your secure cart. Please try again.",
    );
  const cart = cartSchema.safeParse(result.body);
  if (!cart.success)
    throw new WebsiteCheckoutError(
      "Cake City returned an incomplete cart. Please try again.",
    );
  return { cart: cart.data, cartToken: result.cartToken };
}

function sessionCanBeReplaced(error: unknown) {
  return (
    error instanceof WebsiteCheckoutError &&
    error.status !== null &&
    error.status < 500 &&
    error.status !== 429
  );
}

// A screen can unmount during a payment redirect or Android configuration
// change. Keeping one preparation promise per exact bag prevents a second
// GET /cart + POST /cart/add-item sequence from starting in the same app run.
const preparationFlights = new Map<string, Promise<WebsiteCheckoutSession>>();
// SecureStore is a recovery aid, not a precondition for a cart that Cake City
// has already accepted. Keep the verified Cart-Token in memory as well so a
// transient storage failure cannot replay every add-item write in this app run.
const preparedSessions = new Map<string, WebsiteCheckoutSession>();

function rememberPreparedSession(
  fingerprint: string,
  session: WebsiteCheckoutSession,
) {
  preparedSessions.set(fingerprint, session);
  return session;
}

function forgetPreparedSession(cartToken: string) {
  for (const [fingerprint, session] of preparedSessions) {
    if (session.cartToken === cartToken) preparedSessions.delete(fingerprint);
  }
}

/**
 * Restores and verifies a short-lived Cart-Token before creating a new cart.
 * This is deliberately an explicit checkout preparation operation, not a
 * refetchable catalogue query: it performs server writes while adding items.
 */
export async function prepareWebsiteCheckoutCart(
  lines: readonly BagLine[],
  fingerprint: string,
  ownerScope: string | null,
): Promise<WebsiteCheckoutSession> {
  const inFlight = preparationFlights.get(fingerprint);
  if (inFlight) return inFlight;

  const inMemory = preparedSessions.get(fingerprint);
  if (inMemory) return inMemory;

  const preparation = (async () => {
    let saved: WebsiteCheckoutSession | null = null;
    try {
      saved = await loadWebsiteCheckoutSession(fingerprint, ownerScope);
    } catch {
      // A secure-storage failure must not replay an already-created cart in
      // this process or prevent a customer from beginning checkout.
    }
    if (saved) {
      try {
        const restored = await refreshWebsiteCart(saved.cartToken);
        rememberPreparedSession(fingerprint, restored);
        await saveWebsiteCheckoutSession(
          fingerprint,
          restored,
          ownerScope,
        ).catch(() => undefined);
        return restored;
      } catch (error) {
        // Network failures preserve the token for a later retry. Only an
        // explicit client-side/4xx rejection may be replaced with a new cart.
        if (!sessionCanBeReplaced(error)) throw error;
        await clearWebsiteCheckoutSession();
      }
    }

    const created = await createWebsiteCart(lines);
    rememberPreparedSession(fingerprint, created);
    await saveWebsiteCheckoutSession(fingerprint, created, ownerScope).catch(
      () => undefined,
    );
    return created;
  })();

  preparationFlights.set(fingerprint, preparation);
  try {
    return await preparation;
  } finally {
    preparationFlights.delete(fingerprint);
  }
}

/** Applies one customer-selected code and then verifies the complete server cart. */
export async function setWebsiteCartCoupon(
  session: WebsiteCheckoutSession,
  requested: string | null,
  fingerprint: string,
  ownerScope: string | null,
): Promise<WebsiteCheckoutSession> {
  const code = requested === null ? null : normalizeCouponCode(requested);
  const current = await refreshWebsiteCart(session.cartToken);
  let token = current.cartToken;
  for (const coupon of current.cart.coupons) {
    if (code && normalizeCouponCode(coupon.code) === code) continue;
    const result = await storeRequest(
      `/cart/coupons/${encodeURIComponent(coupon.code)}`,
      { method: "DELETE" },
      token,
    );
    token = result.cartToken;
  }
  if (
    code &&
    !current.cart.coupons.some(
      (coupon) => normalizeCouponCode(coupon.code) === code,
    )
  ) {
    const result = await storeRequest(
      "/cart/coupons",
      { method: "POST", body: JSON.stringify({ code }) },
      token,
    );
    token = result.cartToken;
  }
  const verified = await refreshWebsiteCart(token);
  if (!cartHasRequestedCoupon(verified.cart, code))
    throw new WebsiteCheckoutError(
      code
        ? "Cake City did not accept this coupon. Remove it or try another code before payment."
        : "Cake City has not confirmed coupon removal. Please try again before payment.",
    );
  rememberPreparedSession(fingerprint, verified);
  await saveWebsiteCheckoutSession(fingerprint, verified, ownerScope).catch(
    () => undefined,
  );
  return verified;
}

function address(details: WebsiteCheckoutDetails) {
  return {
    first_name: details.firstName.trim(),
    last_name: details.lastName.trim(),
    company: "",
    address_1: details.address.trim(),
    address_2: details.area.trim(),
    city: details.city.trim(),
    // Cake City's current checkout uses Nairobi's WooCommerce state value.
    state: "KE30",
    postcode: "",
    country: "KE",
    phone: details.phone.replace(/\s/g, ""),
    email: details.email.trim(),
  };
}

export async function submitWebsiteCheckout(
  session: WebsiteCheckoutSession,
  details: WebsiteCheckoutDetails,
  requestedCoupon: string | null = null,
): Promise<WebsiteCheckoutResult> {
  // Recheck eligibility and price immediately before the payment handoff. An
  // expired/ignored coupon can never silently turn into a full-price payment.
  const verified = await refreshWebsiteCart(session.cartToken);
  for (const [fingerprint, prepared] of preparedSessions) {
    if (prepared.cartToken === session.cartToken)
      rememberPreparedSession(fingerprint, verified);
  }
  if (!cartHasRequestedCoupon(verified.cart, requestedCoupon))
    throw new WebsiteCheckoutError(
      "Your coupon is not confirmed. Review or remove it before payment.",
    );
  if (
    verified.cart.totals.total_price !== session.cart.totals.total_price ||
    verified.cart.totals.currency_code !== session.cart.totals.currency_code ||
    verified.cart.totals.currency_minor_unit !==
      session.cart.totals.currency_minor_unit
  )
    throw new WebsiteCheckoutError(
      "Cake City's total has changed. Return to your bag and reopen checkout to review it before payment.",
    );
  // A checkout attempt consumes this app-run recovery session even if Cake
  // City's payment gateway returns an error. Recreating it must be an explicit
  // customer action, never a background replay of cart writes.
  forgetPreparedSession(session.cartToken);
  forgetPreparedSession(verified.cartToken);
  const billingAddress = address(details);
  const result = await storeRequest(
    "/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        billing_address: billingAddress,
        shipping_address: billingAddress,
        customer_note: details.notes?.trim() || undefined,
        payment_method: "pesapal",
      }),
    },
    verified.cartToken,
  );
  const checkout = checkoutSchema.safeParse(result.body);
  if (!checkout.success)
    throw new Error("Cake City returned an incomplete payment response.");
  return checkout.data;
}

export function websiteCartTotal(cart: WebsiteCart) {
  const amount = Number(cart.totals.total_price);
  if (!Number.isFinite(amount)) return null;
  return amount / 10 ** cart.totals.currency_minor_unit;
}

/**
 * Reads the current status directly from Cake City's WooCommerce order API.
 * Guest orders require both the private order key and the billing email.
 */
export async function fetchWebsiteOrder(
  order: WebsiteOrderAccess,
): Promise<WebsiteOrderStatus> {
  if (!order.billingEmail)
    throw new Error(
      "This order was saved before live tracking was enabled. Open its Cake City update instead.",
    );
  const query = new URLSearchParams({
    key: order.key,
    billing_email: order.billingEmail.trim().toLowerCase(),
  });
  const result = await storeRequest(`/order/${order.id}?${query.toString()}`);
  const status = orderStatusSchema.safeParse(result.body);
  if (!status.success)
    throw new Error("Cake City returned an incomplete order update.");
  return status.data;
}

export function websiteOrderUrl(
  order: Pick<WebsiteCheckoutResult, "order_id" | "order_key">,
) {
  return `https://cakecity.co.ke/checkout/order-received/${order.order_id}/?key=${encodeURIComponent(order.order_key)}`;
}
