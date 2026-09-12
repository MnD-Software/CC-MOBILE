import { z } from "zod";
import { api, ApiError } from "./client";

const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const signedDecimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const rewardsSchema = z.object({
  points_balance: z.number().int().nonnegative(),
  lifetime_points: z.number().int().nonnegative(),
  lifetime_spend: decimal,
  tier: z.enum(["silver", "gold", "diamond", "platinum"]),
  benefits: z.array(z.string()),
  next_tier: z
    .object({
      name: z.enum(["gold", "diamond", "platinum"]),
      spend_required: decimal,
    })
    .nullable(),
  wallet: z.object({ balance: decimal, currency: z.literal("KES") }),
  referral: z.object({
    code: z.string(),
    completed: z.number().int().nonnegative(),
    reward_points: z.number().int().nonnegative(),
  }),
});
const activitySchema = z.object({
  points: z.array(
    z.object({
      id: z.string(),
      points: z.number().int(),
      description: z.string(),
      balance_after: z.number().int(),
      created_at: z.string(),
    }),
  ),
  wallet: z.array(
    z.object({
      id: z.string(),
      amount: signedDecimal,
      description: z.string(),
      balance_after: decimal,
      created_at: z.string(),
    }),
  ),
});
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      "Your rewards could not be verified. Please refresh and try again.",
      { code: "INVALID_RESPONSE" },
    );
  return result.data;
}

export type AccountOrderSummaryResponse = {
  reference: string;
  state: string;
  total: string;
  currency: string;
  fulfilment: string;
  delivery_slot: string | null;
  created_at: string;
};

export type RewardsOverviewResponse = {
  points_balance: number;
  lifetime_points: number;
  lifetime_spend: string;
  tier: "silver" | "gold" | "diamond" | "platinum";
  benefits: string[];
  next_tier: null | {
    name: "gold" | "diamond" | "platinum";
    spend_required: string;
  };
  wallet: { balance: string; currency: string };
  referral: { code: string; completed: number; reward_points: number };
};

export type RewardsActivityResponse = {
  points: Array<{
    id: string;
    points: number;
    description: string;
    balance_after: number;
    created_at: string;
  }>;
  wallet: Array<{
    id: string;
    amount: string;
    description: string;
    balance_after: string;
    created_at: string;
  }>;
};

/** Account commerce endpoints exposed by the current Cake City API. */
export const accountCommerceApi = {
  getOrders(options?: { signal?: AbortSignal }) {
    return api.get<AccountOrderSummaryResponse[]>("/v1/account/orders", {
      auth: true,
      signal: options?.signal,
    });
  },

  getRewards(options?: { signal?: AbortSignal }) {
    return api
      .get<unknown>("/v1/account/rewards", {
        auth: true,
        signal: options?.signal,
      })
      .then((value) => validate(rewardsSchema, value));
  },

  getRewardsActivity(limit = 30, options?: { signal?: AbortSignal }) {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    return api
      .get<unknown>(`/v1/account/rewards/activity?limit=${safeLimit}`, {
        auth: true,
        signal: options?.signal,
      })
      .then((value) => validate(activitySchema, value));
  },
};
