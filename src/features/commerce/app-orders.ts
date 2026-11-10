import { z } from "zod";
import { api } from "@/api/client";

export const appOrderSchema = z.object({
  reference: z.string(),
  channel: z.literal("app"),
  payment_test: z.boolean().default(false),
  environment: z.enum(["live", "sandbox"]),
  payment_account: z.string(),
  status: z.string(),
  payment_state: z.string(),
  total_minor: z.number().int(),
  currency: z.literal("KES"),
  created_at: z.string(),
  paid_at: z.string().nullable(),
  payment_url: z.string().nullable().optional(),
  tracking_id: z.string().nullable().optional(),
  dispatch: z
    .object({ rider_name: z.string(), rider_phone: z.string() })
    .optional(),
  events: z
    .array(z.object({ kind: z.string(), created_at: z.string() }))
    .optional(),
  deliveries: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        service_type: z.string(),
        scheduled_at: z.string().nullable(),
        slot: z.string(),
      }),
    )
    .optional(),
  snapshot: z
    .object({
      lines: z.array(
        z.object({
          product_id: z.number(),
          sku_id: z.number(),
          slug: z.string(),
          name: z.string(),
          quantity: z.number(),
          unit_minor: z.number(),
          line_minor: z.number(),
          selection: z.record(z.string(), z.unknown()),
        }),
      ),
      subtotal_minor: z.number(),
      delivery_minor: z.number(),
      discount_minor: z.number(),
      tax_minor: z.number(),
      pickup_instructions: z.string().optional(),
      route: z
        .object({
          origin_name: z.string(),
          origin_address: z.string(),
          destination_name: z.string(),
          destination_address: z.string(),
          destination: z.object({
            latitude: z.number(),
            longitude: z.number(),
          }),
          distance_meters: z.number(),
          fee_minor: z.number(),
          rate: z.string(),
        })
        .nullable()
        .optional(),
      checkout: z.record(z.string(), z.unknown()),
    })
    .optional(),
});
export type AppOrder = z.infer<typeof appOrderSchema>;
export const appOrders = {
  async list() {
    return z
      .object({
        data: z.array(appOrderSchema),
        next_cursor: z.number().nullable(),
      })
      .parse(await api.get("/v1/app-orders", { auth: true }));
  },
  async detail(reference: string) {
    return appOrderSchema.parse(
      await api.get(`/v1/app-orders/${encodeURIComponent(reference)}`, {
        auth: true,
      }),
    );
  },
  async verify(reference: string) {
    return appOrderSchema.parse(
      await api.post(
        `/v1/payments/pesapal/orders/${encodeURIComponent(reference)}/verify`,
        {},
        { auth: true, timeoutMs: 60_000 },
      ),
    );
  },
  async start(reference: string) {
    return appOrderSchema.parse(
      await api.post(
        `/v1/payments/pesapal/orders/${encodeURIComponent(reference)}/start`,
        {},
        { auth: true, timeoutMs: 120_000 },
      ),
    );
  },
};
