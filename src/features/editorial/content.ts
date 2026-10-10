import { z } from "zod";
import { api, isApiError } from "@/api/client";
import { env } from "@/config/env";

const media = z
  .string()
  .refine(
    (url) =>
      !url ||
      /^https:\/\//.test(url) ||
      /^\/v1\/content\/assets\/[a-f0-9]{64}$/.test(url),
  );
export const campaignSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  title: z.string(),
  description: z.string(),
  image_url: media,
  video_url: media.default(""),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  product_slugs: z.array(z.string()).max(8),
  category_id: z.number().int().positive().nullable(),
  branch_names: z.array(z.string()).default([]),
  member_only: z.boolean(),
  published: z.boolean(),
  template: z.enum(["spotlight", "celebration", "offer"]),
});
export type Campaign = z.infer<typeof campaignSchema>;
export const productEditorialSchema = z.object({
  product_id: z.number().int(),
  image_urls: z.array(media).default([]),
  video_url: media.default(""),
  flavour: z.string().default(""),
  servings: z.string().default(""),
  preparation_hours: z.number().int().nonnegative().nullable(),
  photography_notes: z.string().default(""),
  published: z.boolean(),
  revision: z.number().int(),
});
export const mediaSource = (url: string) =>
  url.startsWith("/v1/content/assets/") ? `${env.apiUrl}${url}` : url;
export function activeCampaigns(campaigns: Campaign[], now = Date.now()) {
  return campaigns.filter(
    (item) =>
      item.published &&
      Date.parse(item.starts_at) <= now &&
      now < Date.parse(item.ends_at),
  );
}
export function campaignRemaining(end: string, now = Date.now()) {
  const minutes = Math.ceil((Date.parse(end) - now) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "Ended";
  if (minutes < 60) return `${minutes} min left`;
  if (minutes < 1440) return `${Math.ceil(minutes / 60)} hours left`;
  return `Ends ${new Date(end).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
export const contentApi = {
  async campaigns(signal?: AbortSignal) {
    try {
      return z
        .object({ campaigns: z.array(campaignSchema) })
        .parse(await api.get("/v1/content", { signal })).campaigns;
    } catch (error) {
      if (isApiError(error) && error.status === 404) return [];
      throw error;
    }
  },
  async product(id: number, signal?: AbortSignal) {
    try {
      return productEditorialSchema
        .nullable()
        .parse(await api.get(`/v1/content/products/${id}`, { signal }));
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null;
      throw error;
    }
  },
};
