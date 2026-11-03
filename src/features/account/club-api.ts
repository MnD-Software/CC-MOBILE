import { z } from "zod";
import { api, isApiError } from "@/api/client";
import {
  purchaseTest,
  purchaseTestOrigin,
} from "@/features/purchase-test/client";
import { previewClub } from "@/features/purchase-test/model";

const coupon = z.object({
  id: z.string(),
  points: z.number().int(),
  code: z.string().nullable(),
  status: z.enum(["pending", "issued"]),
  request_key: z.string(),
});
const transaction = z.object({
  id: z.string(),
  points: z.number().int(),
  description: z.string(),
  created_at: z.string(),
  receipt_reference: z.string().optional(),
});
const club = z.object({
  member_id: z.string(),
  points: z.number().int().nonnegative(),
  debt: z.number().int().nonnegative(),
  tier: z.string(),
  next_tier: z
    .object({ name: z.string(), spend_required_kes: z.number() })
    .nullable(),
  rules: z.object({
    earn_spend_kes: z.number().positive(),
    point_value_kes: z.number().positive(),
    expiry_days: z.number().int().positive(),
    minimum_redemption: z.number().int(),
    minimum_order_multiple: z.number().positive(),
  }),
  redemption_available: z.boolean(),
  review_required: z.boolean().default(false),
  coupons: z.array(coupon),
  activity: z.array(transaction),
  purchase_progress: z
    .object({
      purchases: z.number().int(),
      milestones: z
        .array(z.object({ purchases: z.number().int(), name: z.string() }))
        .optional(),
      next_tier: z
        .object({ name: z.string(), purchases_remaining: z.number().int() })
        .nullable(),
    })
    .optional(),
});
const celebration = z.object({
  id: z.string(),
  name: z.string(),
  occasion: z.enum(["birthday", "anniversary", "other"]),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  notes: z.string(),
});
export type Celebration = z.infer<typeof celebration>;
export const clubApi = {
  async transactions(before?: string, signal?: AbortSignal) {
    if (purchaseTestOrigin()) {
      const overview = await this.overview(signal);
      return { data: overview.activity, next_cursor: null, recent_only: false };
    }
    const query = new URLSearchParams({ limit: "20" });
    if (before) query.set("before", before);
    try {
      const page = z
        .object({
          data: z.array(transaction),
          next_cursor: z.string().nullable(),
        })
        .parse(
          await api.get(`/v1/club/transactions?${query}`, {
            auth: true,
            signal,
            timeoutMs: 65_000,
          }),
        );
      return { ...page, recent_only: false };
    } catch (error) {
      // Older deployments already expose genuine recent activity in Club.
      // Do not reinterpret a missing cursor or an authentication failure.
      if (!before && isApiError(error) && error.status === 404) {
        const overview = await this.overview(signal);
        return {
          data: overview.activity,
          next_cursor: null,
          recent_only: true,
        };
      }
      throw error;
    }
  },
  async overview(signal?: AbortSignal) {
    if (purchaseTestOrigin()) {
      if (!(await purchaseTest.connected()))
        throw new Error(
          "Connect your membership in checkout to see your points.",
        );
      return club.parse(previewClub(await purchaseTest.state()));
    }
    try {
      return club.parse(
        await api.get("/v1/club", { auth: true, signal, timeoutMs: 65_000 }),
      );
    } catch (error) {
      if (isApiError(error) && error.status === 404)
        throw new Error(
          "Club is not available on this server yet. The latest backend release needs to be deployed.",
        );
      if (
        isApiError(error) &&
        (error.code === "TIMEOUT" || error.code === "REQUEST_TIMEOUT")
      )
        throw new Error(
          "The membership server is taking longer to start. Please retry in a moment.",
        );
      throw error;
    }
  },
  async redeem(points: number, request_key: string) {
    if (purchaseTestOrigin())
      throw new Error(
        "Reward redemption will be available when live payments are connected.",
      );
    return z
      .object({
        id: z.string(),
        status: z.enum(["pending", "issued"]),
        code: z.string().nullable(),
      })
      .parse(
        await api.post(
          "/v1/club/redeem",
          { points, request_key },
          { auth: true },
        ),
      );
  },
  async celebrations(signal?: AbortSignal) {
    return celebration
      .array()
      .parse(await api.get("/v1/account/celebrations", { auth: true, signal }));
  },
  async saveCelebration(data: Omit<Celebration, "id">) {
    return celebration.parse(
      await api.post("/v1/account/celebrations", data, { auth: true }),
    );
  },
  deleteCelebration(id: string) {
    return api.delete(`/v1/account/celebrations/${encodeURIComponent(id)}`, {
      auth: true,
    });
  },
};
