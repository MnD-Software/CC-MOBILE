/**
 * A small, deterministic interpretation layer for commerce search text.
 *
 * This intentionally extracts only customer-stated preferences. It does not
 * search the catalogue, select a product, calculate a final price, or assert
 * that a delivery window is available. Those decisions stay server-owned.
 */

export const COMMERCE_QUERY_SCHEMA_VERSION = "cakecity-commerce-query-v1";

export type CommerceOccasion =
  | "birthday"
  | "anniversary"
  | "baby_shower"
  | "wedding"
  | "graduation"
  | "romance"
  | "celebration"
  | "gift";

export type CommerceFlavour =
  | "chocolate"
  | "vanilla"
  | "red_velvet"
  | "black_forest";

export type CommerceDeliveryTiming = "same_day" | "tomorrow";

export type CommerceBudget = {
  /** Lower KES preference, never a promised catalogue price. */
  minimumKes?: number;
  /** Upper KES preference, never a payment limit. */
  maximumKes?: number;
  /** Approximate KES preference when the customer supplied one. */
  targetKes?: number;
};

export type CommerceQueryFacets = {
  budget?: CommerceBudget;
  deliveryTiming?: CommerceDeliveryTiming;
  occasions: CommerceOccasion[];
  flavours: CommerceFlavour[];
  /** Romance is kept explicit so merchandising can use it without guessing. */
  romance: boolean;
};

export type CommerceQueryIntent = {
  schemaVersion: typeof COMMERCE_QUERY_SCHEMA_VERSION;
  rawQuery: string;
  normalizedQuery: string;
  facets: CommerceQueryFacets;
  /**
   * Always true. Availability, delivery eligibility, prices, promotions, and
   * product ranking must be confirmed by the catalogue/checkout service.
   */
  requiresServerValidation: true;
};

/** The deliberately narrow request shape a future server search can accept. */
export type CommerceQueryRequest = Pick<
  CommerceQueryIntent,
  "schemaVersion" | "normalizedQuery" | "facets"
>;

const MAX_QUERY_LENGTH = 240;
const MAX_KES_AMOUNT = 10_000_000;
const KES_PREFIX = String.raw`(?:kes|kshs?|ksh\.)`;
const AMOUNT = String.raw`(\d[\d,]*(?:\.\d{1,2})?)`;
const K_SUFFIX = String.raw`\s*(k)?`;

const occasionMatchers: ReadonlyArray<readonly [CommerceOccasion, RegExp]> = [
  ["birthday", /\bbirthday\b/i],
  ["anniversary", /\banniversary\b/i],
  ["baby_shower", /\bbaby[\s-]?shower\b/i],
  ["wedding", /\bwedding\b/i],
  ["graduation", /\bgraduation\b/i],
  [
    "romance",
    /\b(?:romance|romantic|valentine(?:'s)?|date[\s-]?night|love)\b/i,
  ],
  ["celebration", /\b(?:celebration|celebrate|party)\b/i],
  ["gift", /\b(?:gift|present)\b/i],
];

const flavourMatchers: ReadonlyArray<readonly [CommerceFlavour, RegExp]> = [
  ["red_velvet", /\bred[\s-]?velvet\b/i],
  ["black_forest", /\bblack[\s-]?forest\b/i],
  ["chocolate", /\b(?:chocolate|choc(?:olate)?|choclate)\b/i],
  ["vanilla", /\bvanilla\b/i],
];

function normaliseQuery(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function amountToKes(rawAmount: string, rawSuffix?: string) {
  const amount = Number(rawAmount.replace(/,/g, ""));
  const multiplier = rawSuffix?.toLowerCase() === "k" ? 1_000 : 1;
  const value = amount * multiplier;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_KES_AMOUNT)
    return null;
  return Math.round(value * 100) / 100;
}

function firstKesMatch(query: string, expression: RegExp) {
  const match = expression.exec(query);
  if (!match) return null;
  return amountToKes(match[1], match[2]);
}

function extractBudget(query: string): CommerceBudget | undefined {
  const range = new RegExp(
    String.raw`\b(?:between|from)\s+(?:${KES_PREFIX}\s*)?${AMOUNT}${K_SUFFIX}\s*(?:and|to|[-–])\s*(?:${KES_PREFIX}\s*)?${AMOUNT}${K_SUFFIX}`,
    "i",
  ).exec(query);
  if (range) {
    const first = amountToKes(range[1], range[2]);
    const second = amountToKes(range[3], range[4]);
    if (first !== null && second !== null)
      return {
        minimumKes: Math.min(first, second),
        maximumKes: Math.max(first, second),
      };
  }

  const maximum = firstKesMatch(
    query,
    new RegExp(
      String.raw`\b(?:under|below|less than|up to|upto|at most|max(?:imum)?(?:\s+budget)?|within)\s+(?:${KES_PREFIX}\s*)?${AMOUNT}${K_SUFFIX}\b`,
      "i",
    ),
  );
  if (maximum !== null) return { maximumKes: maximum };

  const target = firstKesMatch(
    query,
    new RegExp(
      String.raw`\b(?:around|about|approximately|roughly|near|budget(?:\s+of)?)\s+(?:${KES_PREFIX}\s*)?${AMOUNT}${K_SUFFIX}\b`,
      "i",
    ),
  );
  if (target !== null) return { targetKes: target };

  return undefined;
}

function matchingFacets<T extends string>(
  query: string,
  matchers: ReadonlyArray<readonly [T, RegExp]>,
) {
  return matchers.flatMap(([facet, expression]) =>
    expression.test(query) ? [facet] : [],
  );
}

function deliveryTiming(query: string): CommerceDeliveryTiming | undefined {
  if (/\b(?:same[\s-]?day|today)\b/i.test(query)) return "same_day";
  if (/\btomorrow\b/i.test(query)) return "tomorrow";
  return undefined;
}

/**
 * Parses preferences locally and deterministically. Its output is suitable for
 * a server search request, but never for client-side availability, pricing, or
 * delivery decisions.
 */
export function parseCommerceQuery(
  input: string | null | undefined,
): CommerceQueryIntent {
  const normalizedQuery = normaliseQuery(input);
  const occasions = matchingFacets(normalizedQuery, occasionMatchers);
  const romance = occasions.includes("romance");
  const timing = deliveryTiming(normalizedQuery);
  const budget = extractBudget(normalizedQuery);

  return {
    schemaVersion: COMMERCE_QUERY_SCHEMA_VERSION,
    rawQuery: input ?? "",
    normalizedQuery,
    facets: {
      ...(budget ? { budget } : {}),
      ...(timing ? { deliveryTiming: timing } : {}),
      occasions,
      flavours: matchingFacets(normalizedQuery, flavourMatchers),
      romance,
    },
    requiresServerValidation: true,
  };
}

/**
 * Makes the authority boundary explicit for a future API client. This helper
 * deliberately omits local prices, inventory, chosen products, and delivery
 * promises because it has none to send.
 */
export function toCommerceQueryRequest(
  intent: CommerceQueryIntent,
): CommerceQueryRequest {
  return {
    schemaVersion: intent.schemaVersion,
    normalizedQuery: intent.normalizedQuery,
    facets: intent.facets,
  };
}
