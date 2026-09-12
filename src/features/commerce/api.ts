import { z } from "zod";
import { api, ApiError } from "@/api/client";
import { env } from "@/config/env";
import {
  addressSchema,
  categorySchema,
  storeProductSchema,
  mobileConfigSchema,
  deliveryQuoteSchema,
  quoteSchema,
  paymentSchema,
  paymentStatusSchema,
  orderSchema,
  orderSummarySchema,
  moneyValue,
  selectionSchema,
  type CheckoutInput,
  type SavedAddress,
} from "./contracts";

async function validated<T>(
  promise: Promise<unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = schema.safeParse(await promise);
  if (!result.success)
    throw new ApiError(
      "Cake City returned incomplete information. Please refresh and try again.",
      { code: "INVALID_RESPONSE" },
    );
  return result.data;
}
async function store<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(env.storeUrl + path, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new ApiError(
        "The catalogue could not be loaded. Please try again.",
        { code: "CATALOGUE_ERROR", status: response.status },
      );
    return {
      data: await validated(response.json(), schema),
      total: Number(response.headers.get("x-wp-total") ?? 0),
      pages: Number(response.headers.get("x-wp-totalpages") ?? 1),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Check your connection and try loading the catalogue again.",
      { code: "CATALOGUE_NETWORK" },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export const shopApi = {
  products: (
    params: {
      page?: number;
      search?: string;
      category?: number;
      orderby?: string;
      order?: string;
      on_sale?: boolean;
      min_price?: number;
      max_price?: number;
      slug?: string;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      per_page: "24",
      page: String(params.page ?? 1),
    });
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== "") query.set(key, String(value));
    return store(
      "/products?" + query.toString(),
      z.array(storeProductSchema),
      signal,
    );
  },
  categories: (signal?: AbortSignal) =>
    store(
      "/products/categories?per_page=100&hide_empty=true",
      z.array(categorySchema),
      signal,
    ).then((r) => r.data),
  product: (id: string, signal?: AbortSignal) =>
    store(
      "/products/" + encodeURIComponent(id),
      storeProductSchema,
      signal,
    ).then((r) => r.data),
  config: (signal?: AbortSignal) =>
    validated(api.get("/v1/mobile/config", { signal }), mobileConfigSchema),
  quote: (input: CheckoutInput, signal?: AbortSignal) =>
    validated(api.post("/v1/checkout/quote", input, { signal }), quoteSchema),
  delivery: (
    input: {
      branch_id: string;
      latitude: number;
      longitude: number;
      items: CheckoutInput["items"];
    },
    signal?: AbortSignal,
  ) =>
    validated(
      api.post("/v1/delivery/quote", input, { signal }),
      deliveryQuoteSchema,
    ),
  studioQuote: (
    input: {
      configuration_version: string;
      selections: Record<string, string[]>;
      message: string;
      branch_id?: string;
    },
    signal?: AbortSignal,
  ) =>
    validated(
      api.post("/v1/custom-cakes/quote", input, { signal }),
      z.object({
        id: z.string(),
        expires_at: z.string().datetime({ offset: true }),
        product_slug: z.string(),
        name: z.string(),
        subtotal: moneyValue,
        selection: selectionSchema,
      }),
    ),
};
export const customerApi = {
  addresses: () =>
    validated(
      api.get("/v1/account/addresses", { auth: true }),
      z.array(addressSchema),
    ),
  saveAddress: (input: Omit<SavedAddress, "id">, id?: string) =>
    validated(
      id
        ? api.put("/v1/account/addresses/" + encodeURIComponent(id), input, {
            auth: true,
          })
        : api.post("/v1/account/addresses", input, { auth: true }),
      addressSchema,
    ),
  deleteAddress: (id: string) =>
    api.delete<void>("/v1/account/addresses/" + encodeURIComponent(id), {
      auth: true,
    }),
  orders: () =>
    validated(
      api.get("/v1/account/orders", { auth: true }),
      z.array(orderSummarySchema),
    ),
  order: (reference: string) =>
    validated(
      api.get("/v1/account/orders/" + encodeURIComponent(reference), {
        auth: true,
      }),
      orderSchema,
    ),
  reorder: (reference: string) =>
    validated(
      api.post(
        "/v1/account/orders/" + encodeURIComponent(reference) + "/reorder",
        {},
        { auth: true },
      ),
      z.object({
        message: z.string(),
        available: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            price_kes: moneyValue,
            image_url: z.string().nullable(),
            quantity: z.number().int().min(1).max(20),
            configuration: selectionSchema,
          }),
        ),
        unavailable: z.array(
          z.object({ product_name: z.string(), reason: z.string() }),
        ),
      }),
    ),
  favourites: () =>
    validated(
      api.get("/v1/account/saved/cakes", { auth: true }),
      z.array(
        z.object({
          slug: z.string(),
          name: z.string(),
          image_url: z.string().nullable(),
          price_kes: moneyValue,
          in_stock: z.boolean(),
        }),
      ),
    ),
  favourite: (slug: string, saved: boolean) =>
    saved
      ? api.delete("/v1/account/saved/cakes/" + encodeURIComponent(slug), {
          auth: true,
        })
      : api.put(
          "/v1/account/saved/cakes/" + encodeURIComponent(slug),
          {},
          { auth: true },
        ),
  redeem: (points: number, key: string) =>
    validated(
      api.post(
        "/v1/account/rewards/redeem",
        { points },
        { auth: true, headers: { "Idempotency-Key": key } },
      ),
      z.object({
        redeemed_points: z.number(),
        wallet_credit: moneyValue,
        currency: z.literal("KES"),
      }),
    ),
  moments: () =>
    validated(
      api.get("/v1/account/moments", { auth: true }),
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          relationship: z.string(),
          occasion: z.string(),
          event_date: z.string(),
          reminder_days: z.array(z.number()),
          notes: z.string().nullable(),
        }),
      ),
    ),
  saveMoment: (input: {
    name: string;
    relationship: string;
    occasion: string;
    event_date: string;
    reminder_days: number[];
  }) => api.post("/v1/account/moments", input, { auth: true }),
  deleteMoment: (id: string) =>
    api.delete("/v1/account/moments/" + encodeURIComponent(id), { auth: true }),
  notifications: () =>
    validated(
      api.get("/v1/account/notifications", { auth: true }),
      z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          title: z.string(),
          body: z.string(),
          read_at: z.string().nullable(),
          created_at: z.string(),
          data: z.record(z.string(), z.unknown()),
        }),
      ),
    ),
  readNotification: (id: string) =>
    api.post(
      "/v1/account/notifications/" + encodeURIComponent(id) + "/read",
      {},
      { auth: true },
    ),
  messages: (ref: string) =>
    validated(
      api.get(
        "/v1/account/orders/" + encodeURIComponent(ref) + "/delivery/messages",
        { auth: true },
      ),
      z.array(
        z.object({
          id: z.string(),
          sender_role: z.string(),
          body: z.string(),
          created_at: z.string(),
        }),
      ),
    ),
  sendMessage: (ref: string, body: string) =>
    api.post(
      "/v1/account/orders/" + encodeURIComponent(ref) + "/delivery/messages",
      { body },
      { auth: true },
    ),
};
export const payments = {
  // Existing Safaricom / Flutterwave provider boundary. Never send a client total.
  create: (
    input: {
      method: "mpesa" | "card" | "wallet";
      checkout: CheckoutInput;
      customer: { email: string; phone: string; name: string };
      delivery_address?: {
        line1: string;
        area: string;
        city: string;
        notes?: string;
      };
    },
    key: string,
  ) =>
    validated(
      api.post("/v1/payments/intents", input, {
        auth: true,
        headers: { "Idempotency-Key": key },
        timeoutMs: 45000,
      }),
      paymentSchema,
    ),
  status: (id: string, secret: string) =>
    validated(
      api.get("/v1/payments/intents/" + encodeURIComponent(id), {
        headers: { "X-Payment-Secret": secret },
      }),
      paymentStatusSchema,
    ),
};
