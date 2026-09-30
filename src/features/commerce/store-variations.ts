import { z } from "zod";

const STORE_API = "https://cakecity.co.ke/wp-json/wc/store/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_VARIATIONS_PER_REQUEST = 100;

const liveVariationSchema = z.object({
  id: z.number().int().positive(),
  parent: z.number().int().positive(),
  type: z.literal("variation"),
  is_in_stock: z.boolean(),
  is_purchasable: z.boolean(),
  prices: z.object({
    price: z.string(),
    currency_code: z.string(),
    currency_minor_unit: z.number().int().min(0).max(4),
  }),
});

export type LiveVariation = z.infer<typeof liveVariationSchema>;

export function liveVariationPrice(variation: LiveVariation) {
  const {
    price,
    currency_code: currencyCode,
    currency_minor_unit: minorUnit,
  } = variation.prices;
  return /^\d+$/.test(price) && currencyCode === "KES"
    ? Number(price) / 10 ** minorUnit
    : null;
}

function variationIds(ids: readonly number[]) {
  return [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
}

function chunks<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

async function requestVariationBatch(
  ids: readonly number[],
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    include: ids.join(","),
    type: "variation",
    per_page: String(ids.length),
  });
  const controller = new AbortController();
  let timedOut = false;
  const abortForCaller = () => controller.abort();

  if (signal?.aborted) abortForCaller();
  else signal?.addEventListener("abort", abortForCaller, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${STORE_API}/products?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        "Cake City could not confirm the latest variation options.",
      );

    const parsed = z.array(liveVariationSchema).safeParse(body);
    if (!parsed.success)
      throw new Error(
        "Cake City returned incomplete variation pricing. Please try again.",
      );
    return parsed.data;
  } catch (error) {
    if (timedOut)
      throw new Error(
        "Cake City took too long to confirm variation prices. Please try again.",
      );
    if (controller.signal.aborted && signal?.aborted) throw error;
    throw error instanceof Error
      ? error
      : new Error("Cake City could not confirm variation options.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortForCaller);
  }
}

/**
 * The deployed mobile catalogue lists variation IDs and a parent price range,
 * but not the price/stock of each combination. This reads the matching public
 * Store API variation records so the client never presents the parent price as
 * the selected combination price. The cart remains the final authority.
 */
export async function fetchLiveVariations(
  ids: readonly number[],
  signal?: AbortSignal,
) {
  const uniqueIds = variationIds(ids);
  if (!uniqueIds.length) return [];

  const batches = chunks(uniqueIds, MAX_VARIATIONS_PER_REQUEST);
  return (
    await Promise.all(
      batches.map((batch) => requestVariationBatch(batch, signal)),
    )
  ).flat();
}
