import { z } from "zod";
import { api, ApiError, isApiError } from "@/api/client";
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
  type StoreProduct,
} from "./contracts";
import {
  cachedLiveCatalogueProducts,
  rememberLiveCatalogueProducts,
} from "./catalogue-cache";
import { shopBrowseQuery, type ShopBrowseParams } from "./shop-browse";

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
const CATALOGUE_PAGE_SIZE = 24;
const PRODUCT_LOOKUP_PAGE_SIZE = 100;
const CATALOGUE_TIMEOUT_MS = 15_000;
const STORE_CATEGORY_FALLBACK_URL =
  "https://cakecity.co.ke/wp-json/wc/store/v1/products";
const STORE_CATEGORY_FALLBACK_TIMEOUT_MS = 12_000;
const STORE_CATEGORY_PAGE_SIZE = 24;
export const CATALOGUE_STALE_TIME_MS = 5 * 60_000;
export const CATALOGUE_GC_TIME_MS = 30 * 60_000;

const productCache = new Map<string, StoreProduct>();

function rememberProducts(products: StoreProduct[]) {
  for (const product of products) {
    productCache.set(String(product.id), product);
    productCache.set(product.slug, product);
  }
  return products;
}

/**
 * Browsing normally goes through the mobile API, which is the contract for
 * published WooCommerce records. A category-specific public Store API request
 * is isolated below solely as a live fallback while an older proxy deploy
 * catches up; the client never substitutes a local product list.
 */
type CatalogueParams = {
  page?: number;
  search?: string;
  perPage?: number;
  category?: number;
};

function categoryId(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new ApiError("A valid Cake City category is required.", {
      code: "INVALID_CATEGORY",
    });
  return value;
}

async function catalogueProducts(
  params: CatalogueParams,
  signal?: AbortSignal,
) {
  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.max(
    1,
    Math.min(PRODUCT_LOOKUP_PAGE_SIZE, params.perPage ?? CATALOGUE_PAGE_SIZE),
  );
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const category = categoryId(params.category);
  if (category !== undefined) query.set("category", String(category));
  if (params.search?.trim()) query.set("search", params.search.trim());

  try {
    const data = await validated(
      api.get(`/v1/catalogue/products?${query.toString()}`, {
        signal,
        timeoutMs: CATALOGUE_TIMEOUT_MS,
      }),
      z.array(storeProductSchema),
    );
    const products = rememberProducts(data);
    rememberLiveCatalogueProducts(products);

    // The current proxy intentionally does not forward WooCommerce totals. A
    // short final page ends pagination; a full final page incurs one harmless,
    // empty confirmation request instead of inventing a total client-side.
    return {
      data: products,
      total: products.length,
      pages: products.length === perPage ? page + 1 : page,
    };
  } catch (error) {
    // Cached records are allowed only for browse recovery after a real
    // transport failure. Invalid server payloads and HTTP responses remain
    // visible errors rather than being masked with old information.
    const canUseCache =
      isApiError(error) &&
      (error.code === "NETWORK_ERROR" || error.code === "REQUEST_TIMEOUT");
    if (!canUseCache) throw error;
    const cached = await cachedLiveCatalogueProducts({
      page,
      perPage,
      search: params.search,
      category,
    });
    if (!cached?.length) throw error;
    return {
      data: rememberProducts(cached),
      total: cached.length,
      // Do not turn a partial on-device snapshot into a fake paginated shop.
      pages: page,
    };
  }
}

async function liveStoreProductsByCategory(
  category: number,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    controller.abort();
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STORE_CATEGORY_FALLBACK_TIMEOUT_MS);

  try {
    const fallbackQuery = new URLSearchParams({
      category: String(category),
      // Six products made nonempty categories appear complete when they were
      // not. This is still a compact first category page; the mobile BFF must
      // eventually expose cursor pagination for arbitrarily large categories.
      per_page: String(STORE_CATEGORY_PAGE_SIZE),
    });
    const response = await fetch(
      `${STORE_CATEGORY_FALLBACK_URL}?${fallbackQuery.toString()}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new ApiError("Cake City could not load this cake collection.", {
        code: `STORE_CATEGORY_HTTP_${response.status}`,
        status: response.status,
      });
    }
    const products = rememberProducts(
      await validated(response.json(), z.array(storeProductSchema)),
    );
    rememberLiveCatalogueProducts(products);
    return products.filter((product) => hasCategoryId(product, category));
  } catch (error) {
    if (isApiError(error)) throw error;
    if (timedOut)
      throw new ApiError("Cake City took too long to load this collection.", {
        code: "STORE_CATEGORY_TIMEOUT",
      });
    if (cancelled)
      throw new ApiError("The collection request was cancelled.", {
        code: "STORE_CATEGORY_ABORTED",
      });
    throw new ApiError("Unable to reach Cake City's live cake collection.", {
      code: "STORE_CATEGORY_NETWORK",
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

function matchingProduct(
  products: z.infer<typeof storeProductSchema>[],
  idOrSlug: string,
) {
  return (
    products.find(
      (product) => String(product.id) === idOrSlug || product.slug === idOrSlug,
    ) ?? null
  );
}

async function findProducts(
  identifiers: readonly string[],
  signal?: AbortSignal,
) {
  const wanted = new Set(identifiers.filter(Boolean));
  const found = new Map<string, StoreProduct>();

  for (const identifier of wanted) {
    const cached = productCache.get(identifier);
    if (cached) found.set(identifier, cached);
  }

  for (let page = 1; found.size < wanted.size; page += 1) {
    const result = await catalogueProducts(
      { page, perPage: PRODUCT_LOOKUP_PAGE_SIZE },
      signal,
    );
    for (const identifier of wanted) {
      if (found.has(identifier)) continue;
      const match = matchingProduct(result.data, identifier);
      if (match) found.set(identifier, match);
    }
    if (result.data.length < PRODUCT_LOOKUP_PAGE_SIZE) break;
  }

  return identifiers.flatMap((identifier) => {
    const product = found.get(identifier);
    return product ? [product] : [];
  });
}

function normaliseCategoryName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasCategoryName(
  product: StoreProduct,
  categoryNames: readonly string[],
) {
  const expected = categoryNames.map(normaliseCategoryName).filter(Boolean);
  return product.categories.some((category) => {
    const actual = normaliseCategoryName(category.name);
    return expected.some(
      (name) =>
        actual === name || actual.includes(name) || name.includes(actual),
    );
  });
}

function hasCategoryId(product: StoreProduct, category: number) {
  return product.categories.some((item) => item.id === category);
}

/**
 * Category IDs are the fastest, server-authoritative catalogue selector. Use
 * Cake City's public Store API first because a category response is much
 * smaller than the deployed mobile proxy's general catalogue response. The
 * proxy remains a live fallback if the Store API is temporarily unavailable.
 */
async function productsByCategory(category: number, signal?: AbortSignal) {
  let storeError: unknown;
  try {
    const matching = await liveStoreProductsByCategory(category, signal);
    if (matching.length) return matching;
  } catch (error) {
    if (signal?.aborted) throw error;
    storeError = error;
  }

  try {
    const proxied = await catalogueProducts({ category, perPage: 24 }, signal);
    const matching = proxied.data.filter((product) =>
      hasCategoryId(product, category),
    );
    if (matching.length) return matching;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (!isApiError(error) || !error.status || error.status >= 500) throw error;
  }

  if (storeError) throw storeError;
  return [];
}

/**
 * The deployed mobile proxy exposes live WooCommerce records but not a
 * category filter. Scan only as far as needed for a named collection instead
 * of substituting display-only products when the first page lacks it.
 */
async function productsForCategory(
  categoryNames: readonly string[],
  signal?: AbortSignal,
) {
  const found = new Map<number, StoreProduct>();

  for (let page = 1; page <= 20; page += 1) {
    const result = await catalogueProducts(
      { page, perPage: PRODUCT_LOOKUP_PAGE_SIZE },
      signal,
    );
    for (const product of result.data) {
      if (hasCategoryName(product, categoryNames))
        found.set(product.id, product);
    }
    // A full, image-led home rail does not need to download the entire shop.
    if (found.size >= 10 || result.data.length < PRODUCT_LOOKUP_PAGE_SIZE)
      break;
  }

  return [...found.values()];
}

async function publicStoreRead(path: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, CATALOGUE_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://cakecity.co.ke/wp-json/wc/store/v1/${path}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new ApiError(
        "The live catalogue could not be loaded. Please try again.",
        { code: "STORE_BROWSE_HTTP", status: response.status },
      );
    // Consume the body inside the timeout boundary too.
    return {
      body: await response.json(),
      pages: response.headers.get("X-WP-TotalPages"),
    };
  } catch (error) {
    if (isApiError(error)) throw error;
    throw new ApiError(
      "Unable to reach the live catalogue. Check your connection and try again.",
      { code: "STORE_BROWSE_NETWORK" },
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export const shopApi = {
  // The deployed mobile proxy does not forward price filters yet. This public,
  // read-only Store API boundary preserves server ordering across every page.
  browseProducts: async (params: ShopBrowseParams, signal?: AbortSignal) => {
    const result = await publicStoreRead(
      `products?${shopBrowseQuery(params)}`,
      signal,
    );
    const data = rememberProducts(
      await validated(
        Promise.resolve(result.body),
        z.array(storeProductSchema),
      ),
    );
    rememberLiveCatalogueProducts(data);
    const page = params.page ?? 1;
    const totalPages = result.pages === null ? NaN : Number(result.pages);
    return {
      data,
      nextPage:
        Number.isSafeInteger(totalPages) && totalPages >= 0
          ? page < totalPages
            ? page + 1
            : undefined
          : data.length === (params.perPage ?? 16)
            ? page + 1
            : undefined,
    };
  },
  categories: async (signal?: AbortSignal) => {
    const result = await publicStoreRead(
      "products/categories?per_page=100&hide_empty=true",
      signal,
    );
    return validated(Promise.resolve(result.body), z.array(categorySchema));
  },
  cachedProduct: (idOrSlug: string) => productCache.get(idOrSlug) ?? null,
  products: (params: CatalogueParams, signal?: AbortSignal) =>
    catalogueProducts(params, signal),
  productsByCategory: (category: number, signal?: AbortSignal) =>
    productsByCategory(category, signal),
  productsByIdentifier: (
    identifiers: readonly string[],
    signal?: AbortSignal,
  ) => findProducts(identifiers, signal),
  productsForCategory: (
    categoryNames: readonly string[],
    signal?: AbortSignal,
  ) => productsForCategory(categoryNames, signal),
  product: async (id: string, signal?: AbortSignal) => {
    const cached = productCache.get(id);
    if (cached) return cached;

    // The deployed catalogue currently exposes a collection endpoint only.
    // Searching a numeric WooCommerce id as text returns an empty result, so
    // cold deep links scan the paged live catalogue while ordinary taps are
    // resolved immediately from the cache populated by Home/Shop.
    const [product] = await findProducts([id], signal);
    if (!product)
      throw new ApiError("This cake is no longer available.", {
        code: "PRODUCT_UNAVAILABLE",
        status: 404,
      });
    return product;
  },
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
