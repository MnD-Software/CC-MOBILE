import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { recordPerformanceMetric } from "@/observability/commerce-events";
import { storeProductSchema, type StoreProduct } from "./contracts";

const CATALOGUE_CACHE_KEY = "cakecity.live-catalogue.v1";
const MAX_PRODUCTS = 72;
const MAX_CACHE_AGE_MS = 24 * 60 * 60_000;

const cacheSchema = z.object({
  savedAt: z.number().finite().positive(),
  products: z.array(storeProductSchema).max(MAX_PRODUCTS),
});

type CachedCatalogue = z.infer<typeof cacheSchema>;
type CacheQuery = {
  page: number;
  perPage: number;
  search?: string;
  category?: number;
};

let inMemoryCache: CachedCatalogue | null = null;
let writeFlight: Promise<void> | null = null;
let writeQueued = false;

function normalise(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeProducts(
  current: readonly StoreProduct[],
  incoming: readonly StoreProduct[],
) {
  const merged = new Map<number, StoreProduct>();
  for (const product of incoming) merged.set(product.id, product);
  for (const product of current) {
    if (!merged.has(product.id)) merged.set(product.id, product);
  }
  return [...merged.values()].slice(0, MAX_PRODUCTS);
}

async function readCache() {
  if (inMemoryCache) {
    recordPerformanceMetric("cache_hit", 1, { source: "catalogue_memory" });
    return inMemoryCache;
  }
  try {
    const raw = await AsyncStorage.getItem(CATALOGUE_CACHE_KEY);
    if (!raw) {
      recordPerformanceMetric("cache_miss", 1, { source: "catalogue_disk" });
      return null;
    }
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      Date.now() - parsed.data.savedAt > MAX_CACHE_AGE_MS
    ) {
      await AsyncStorage.removeItem(CATALOGUE_CACHE_KEY);
      recordPerformanceMetric("cache_miss", 1, { source: "catalogue_expired" });
      return null;
    }
    inMemoryCache = parsed.data;
    recordPerformanceMetric("cache_hit", 1, { source: "catalogue_disk" });
    return inMemoryCache;
  } catch {
    // Local browse caching is progressive enhancement, never a prerequisite
    // for shopping or server-side checkout verification.
    recordPerformanceMetric("cache_miss", 1, { source: "catalogue_error" });
    return null;
  }
}

/**
 * Stores only records that arrived from Cake City's live catalogue boundary.
 * Writes are intentionally detached from rendering so a slow device store
 * cannot hold up first paint or scrolling.
 */
export function rememberLiveCatalogueProducts(products: StoreProduct[]) {
  if (!products.length) return;
  const next: CachedCatalogue = {
    savedAt: Date.now(),
    products: mergeProducts(inMemoryCache?.products ?? [], products),
  };
  inMemoryCache = next;
  if (writeFlight) {
    writeQueued = true;
    return;
  }
  writeFlight = (async () => {
    do {
      writeQueued = false;
      const snapshot = inMemoryCache;
      if (snapshot)
        await AsyncStorage.setItem(
          CATALOGUE_CACHE_KEY,
          JSON.stringify(snapshot),
        );
    } while (writeQueued);
  })()
    .catch(() => undefined)
    .finally(() => {
      writeFlight = null;
    });
}

function matches(product: StoreProduct, query: CacheQuery) {
  if (
    query.category !== undefined &&
    !product.categories.some((category) => category.id === query.category)
  )
    return false;
  const term = normalise(query.search ?? "");
  if (!term) return true;
  const haystack = normalise(
    [
      product.name,
      product.short_description,
      ...product.categories.map((category) => category.name),
    ].join(" "),
  );
  return term.split(" ").every((word) => haystack.includes(word));
}

/**
 * Read-only, offline catalogue fallback. Cached prices are for browsing only;
 * the checkout flow always recreates a Cake City server cart before payment.
 */
export async function cachedLiveCatalogueProducts(query: CacheQuery) {
  const cache = await readCache();
  if (!cache || query.page !== 1) return null;
  return cache.products
    .filter((product) => matches(product, query))
    .slice(0, query.perPage);
}
