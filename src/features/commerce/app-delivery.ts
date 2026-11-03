import { z } from "zod";
import { api } from "@/api/client";

export const deliveryPointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type DeliveryPoint = z.infer<typeof deliveryPointSchema>;
export const distanceOptionsSchema = z.object({
  enabled: z.boolean(),
  maps_ready: z.boolean(),
  map_picker_ready: z.boolean(),
  origin_name: z.string(),
  origin_address: z.string(),
  origin: deliveryPointSchema.nullable(),
  radius_km: z.number().nullable(),
  base_minor: z.number().int(),
  per_km_minor: z.number().int(),
  transfer_percent: z.number(),
  pickup_stores: z.array(
    z.object({
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      id: z.string(),
      name: z.string(),
      address: z.string(),
    }),
  ),
});
export type DistanceOptions = z.infer<typeof distanceOptionsSchema>;
export const routeQuoteSchema = z.object({
  id: z.string(),
  fulfilment: z.enum(["delivery", "pickup"]),
  fee_minor: z.number().int().nonnegative(),
  origin_name: z.string(),
  origin_address: z.string(),
  destination: deliveryPointSchema,
  destination_name: z.string(),
  destination_address: z.string(),
  distance_meters: z.number().int().nonnegative(),
  pickup_location_id: z.string().nullable(),
  rate: z.string(),
  expires_at: z.string(),
});
export type DeliveryRouteQuote = z.infer<typeof routeQuoteSchema>;
const searchSchema = z.object({
  results: z.array(deliveryPointSchema.extend({ address: z.string() })),
});
export const appDelivery = {
  async search(address: string) {
    return searchSchema.parse(
      await api.post(
        "/v1/app-delivery/search",
        { address },
        { auth: true, timeoutMs: 25_000 },
      ),
    ).results;
  },
  async resolve(point: DeliveryPoint) {
    return searchSchema.parse(
      await api.post("/v1/app-delivery/resolve", point, {
        auth: true,
        timeoutMs: 25_000,
      }),
    ).results;
  },
  async quote(
    fulfilment: "delivery" | "pickup",
    destination: DeliveryPoint | null,
    pickup_location_id: string | null,
  ) {
    return routeQuoteSchema.parse(
      await api.post(
        "/v1/app-delivery/quote",
        { fulfilment, destination, pickup_location_id },
        { auth: true, timeoutMs: 30_000 },
      ),
    );
  },
};
