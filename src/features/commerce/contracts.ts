import { z } from "zod";

export const moneyValue = z
  .union([z.string().regex(/^\d+(\.\d+)?$/), z.number()])
  .transform(Number)
  .pipe(z.number().finite().nonnegative());
export const imageUrl = z
  .string()
  .url()
  .refine(
    (value) => value.startsWith("https://"),
    "A secure image URL is required",
  );
export const categorySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  parent: z.number().default(0),
  count: z.number().default(0),
  image: z.object({ src: z.string() }).nullable().optional(),
});
export const storeProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  type: z.string().default("simple"),
  description: z.string().default(""),
  short_description: z.string().default(""),
  is_in_stock: z.boolean(),
  is_purchasable: z.boolean().default(false),
  on_sale: z.boolean().default(false),
  prices: z.object({
    price: z.string(),
    regular_price: z.string(),
    currency_code: z.string(),
    currency_minor_unit: z.number().int().min(0).max(4),
    price_range: z.unknown().optional(),
  }),
  images: z
    .array(
      z.object({
        id: z.number(),
        src: z.string(),
        alt: z.string().default(""),
      }),
    )
    .default([]),
  categories: z.array(categorySchema).default([]),
  attributes: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        has_variations: z.boolean().optional(),
        terms: z
          .array(
            z.object({ id: z.number(), name: z.string(), slug: z.string() }),
          )
          .default([]),
      }),
    )
    .default([]),
  variations: z
    .array(
      z.object({
        id: z.number(),
        attributes: z
          .array(z.object({ name: z.string(), value: z.string().nullable() }))
          .default([]),
      }),
    )
    .default([]),
  average_rating: z.string().default("0"),
  review_count: z.number().default(0),
});
export type StoreProduct = z.infer<typeof storeProductSchema>;
export type Category = z.infer<typeof categorySchema>;
// WooCommerce can return wildcard/null attributes. Preserve these catalogue
// records, but only quote combinations whose configuration is explicit.
export function selectableVariations(product: StoreProduct) {
  const groups = product.attributes.filter((a) => a.has_variations);
  return product.variations.filter(
    (v) =>
      v.attributes.length > 0 &&
      v.attributes.every((a) => !!a.value) &&
      groups.every((group) =>
        v.attributes.some((a) => a.name === group.name && !!a.value),
      ),
  );
}
export function variationLabel(
  product: StoreProduct,
  variant: StoreProduct["variations"][number],
) {
  return variant.attributes
    .map(
      (a) =>
        product.attributes
          .find((g) => g.name === a.name)
          ?.terms.find((t) => t.slug === a.value)?.name ??
        a.value ??
        a.name,
    )
    .join(" / ");
}
export type CakeSelection = {
  size: "1kg" | "1.5kg" | "2kg";
  message: string;
  add_ons: string[];
  variation_id?: number;
  studio_quote_id?: string;
};
export const selectionSchema = z.object({
  size: z.enum(["1kg", "1.5kg", "2kg"]),
  message: z.string().max(32),
  add_ons: z.array(z.string()),
  variation_id: z.number().int().positive().optional(),
  studio_quote_id: z.string().min(1).optional(),
});
export const bagLineSchema = z.object({
  key: z.string(),
  slug: z.string().min(1),
  name: z.string(),
  image: z.string().nullable(),
  price: moneyValue,
  quantity: z.number().int().min(1).max(20),
  selection: selectionSchema,
});
export type BagLine = z.infer<typeof bagLineSchema>;
export type CheckoutInput = {
  items: Array<{ product_slug: string; quantity: number } & CakeSelection>;
  fulfilment: "delivery" | "pickup";
  delivery_area?: string;
  delivery_slot?: string;
  coupon_code?: string;
  branch_id?: string;
  delivery_quote_id?: string;
};
export const quoteSchema = z
  .object({
    currency: z.literal("KES"),
    lines: z
      .array(
        z.object({
          product_slug: z.string(),
          name: z.string(),
          quantity: z.number().int(),
          unit_price: moneyValue,
          line_total: moneyValue,
          available: z.boolean(),
        }),
      )
      .min(1),
    subtotal: moneyValue,
    delivery_fee: moneyValue,
    discount: moneyValue,
    total: moneyValue,
    fulfilment: z.enum(["delivery", "pickup"]),
    requires_address: z.boolean(),
    quote_version: z.string(),
    quote_id: z.string().optional(),
    expires_at: z.string().datetime({ offset: true }).optional(),
    delivery_quote_id: z.string().optional(),
    applied_coupon: z.string().nullable().optional(),
    accepted_configuration: z.boolean().optional(),
  })
  .superRefine((q, context) => {
    if (
      Math.abs(q.subtotal + q.delivery_fee - q.discount - q.total) > 0.01 ||
      Math.abs(q.lines.reduce((n, l) => n + l.line_total, 0) - q.subtotal) >
        0.01
    )
      context.addIssue({
        code: "custom",
        message: "Order totals do not reconcile.",
      });
    if (
      q.lines.some(
        (l) =>
          l.quantity < 1 ||
          l.quantity > 20 ||
          Math.abs(l.unit_price * l.quantity - l.line_total) > 0.01,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Order line prices do not reconcile.",
      });
  });
export type CheckoutQuote = z.infer<typeof quoteSchema>;
export const paymentSchema = z.object({
  id: z.string(),
  order_reference: z.string(),
  state: z.string(),
  method: z.string(),
  amount: moneyValue,
  currency: z.literal("KES"),
  client_secret: z.string().min(16),
  action: z.object({
    type: z.enum(["await_mpesa", "redirect", "none"]),
    redirect_url: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
  }),
});
export type PaymentIntent = z.infer<typeof paymentSchema>;
export const paymentStatusSchema = paymentSchema
  .pick({
    id: true,
    order_reference: true,
    state: true,
    amount: true,
    currency: true,
  })
  .extend({ failure_message: z.string().nullable() });
export const addressSchema = z.object({
  id: z.string(),
  label: z.string(),
  recipient_name: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().nullable().optional(),
  area: z.string(),
  city: z.string(),
  delivery_notes: z.string().nullable().optional(),
  is_default: z.boolean(),
});
export type SavedAddress = z.infer<typeof addressSchema>;
export const orderSummarySchema = z.object({
  reference: z.string(),
  state: z.string(),
  total: moneyValue,
  currency: z.string(),
  fulfilment: z.string(),
  delivery_slot: z.string().nullable(),
  created_at: z.string(),
});
export const orderSchema = orderSummarySchema.extend({
  customer_name: z.string(),
  branch_name: z.string().optional(),
  delivery_address: z.record(z.string(), z.unknown()),
  stages: z.array(z.string()),
  lines: z.array(
    z.object({
      id: z.string(),
      product_name: z.string(),
      quantity: z.number(),
      unit_price: moneyValue,
      line_total: moneyValue,
      configuration: z.record(z.string(), z.unknown()),
    }),
  ),
  timeline: z.array(
    z.object({
      id: z.string(),
      stage: z.string(),
      title: z.string(),
      detail: z.string().nullable(),
      occurred_at: z.string(),
    }),
  ),
  driver_tracking: z
    .object({
      assignment_id: z.string(),
      state: z.string(),
      driver_name: z.string(),
      vehicle: z.string().nullable(),
      estimated_arrival_at: z.string().nullable(),
      location: z
        .object({
          latitude: z.coerce.number().min(-90).max(90),
          longitude: z.coerce.number().min(-180).max(180),
          recorded_at: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});
export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  delivery_available: z.boolean(),
  pickup_available: z.boolean(),
  distance_km: z.number().nonnegative().optional(),
});
export type Branch = z.infer<typeof branchSchema>;
export const materialSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: moneyValue,
  available: z.boolean(),
  image_url: imageUrl.optional(),
  layer: z.number().int().default(0),
  swatch: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  incompatible_with: z.array(z.string()).default([]),
});
export const studioSchema = z.object({
  version: z.string(),
  base_product_slug: z.string(),
  base_price: moneyValue,
  base_image_url: imageUrl,
  message_max_length: z.number().int().min(0).max(32),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      required: z.boolean(),
      multiple: z.boolean(),
      options: z.array(materialSchema),
    }),
  ),
});
export type StudioConfig = z.infer<typeof studioSchema>;
export const campaignSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  image_url: imageUrl.optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  coupon_code: z.string().optional(),
  app_exclusive: z.boolean(),
  eligible: z.boolean(),
  eligibility_message: z.string().optional(),
  minimum_order: moneyValue,
  branch_ids: z.array(z.string()),
  product_slugs: z.array(z.string()),
  category_ids: z.array(z.number()),
  usage_remaining: z.number().int().nonnegative().nullable(),
  discount_type: z.enum(["percentage", "fixed", "delivery", "bundle"]),
  discount_value: moneyValue,
});
export const mobileConfigSchema = z.object({
  checkout_contract: z.string(),
  capabilities: z.object({
    distance_delivery: z.boolean(),
    studio: z.boolean(),
    coupons: z.boolean(),
    native_push: z.boolean(),
    variation_checkout: z.boolean(),
  }),
  branches: z.array(branchSchema),
  campaigns: z.array(campaignSchema),
  studio: studioSchema.nullable(),
});
export const deliveryQuoteSchema = z.object({
  id: z.string(),
  branch_id: z.string(),
  distance_km: z.number().nonnegative(),
  delivery_fee: moneyValue,
  currency: z.literal("KES"),
  estimated_delivery_minutes: z.number().positive(),
  expires_at: z.string().datetime({ offset: true }),
  provider: z.string(),
});
export type DeliveryQuote = z.infer<typeof deliveryQuoteSchema>;

export const money = (value: number) =>
  "KSh " + value.toLocaleString("en-KE", { maximumFractionDigits: 2 });
export function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Math.min(Number(n), 0x10ffff)),
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function productPrice(product: StoreProduct) {
  const p = product.prices;
  return /^\d+$/.test(p.price) && p.currency_code === "KES"
    ? Number(p.price) / 10 ** p.currency_minor_unit
    : null;
}
export function lineKey(slug: string, selection: CakeSelection) {
  return JSON.stringify([
    slug,
    selection.size,
    selection.message,
    [...selection.add_ons].sort(),
    selection.variation_id,
    selection.studio_quote_id,
  ]);
}
export function checkoutBlock(
  input: CheckoutInput,
  quote: CheckoutQuote,
  delivery: DeliveryQuote | null,
  now = Date.now(),
): string | null {
  if (!input.items.length || !quoteSchema.safeParse(quote).success)
    return "Your order quote could not be verified. Refresh the order total.";
  if (
    quote.lines.length !== input.items.length ||
    quote.lines.some(
      (line, i) =>
        !line.available ||
        line.product_slug !== input.items[i].product_slug ||
        line.quantity !== input.items[i].quantity,
    )
  )
    return "Your bag changed. Refresh the order total.";
  if (quote.fulfilment !== input.fulfilment)
    return "Please refresh your fulfilment selection.";
  if (quote.expires_at && Date.parse(quote.expires_at) <= now)
    return "Your quote expired. Refresh the order total.";
  if (
    input.fulfilment === "delivery" &&
    (!delivery ||
      Date.parse(delivery.expires_at) <= now ||
      (input.branch_id && input.branch_id !== delivery.branch_id) ||
      input.delivery_quote_id !== delivery.id ||
      quote.delivery_quote_id !== delivery.id ||
      Math.abs(quote.delivery_fee - delivery.delivery_fee) > 0.01)
  )
    return "A current delivery quote is needed before payment.";
  if (
    input.coupon_code &&
    quote.applied_coupon?.toUpperCase() !== input.coupon_code.toUpperCase()
  )
    return "This offer has not been applied. Remove it or try another code.";
  if (
    (input.branch_id ||
      input.items.some((i) => i.studio_quote_id || i.variation_id)) &&
    !quote.accepted_configuration
  )
    return "Cake City needs to confirm this configuration before payment.";
  return null;
}

/** Remove only purchased configurations, once per payment, even after a restart. */
export function settleBag(
  lines: BagLine[],
  settled: string[],
  paymentId: string,
  items: CheckoutInput["items"],
) {
  if (settled.includes(paymentId)) return { lines, settled };
  const purchased = new Map<string, number>();
  for (const item of items) {
    const key = lineKey(item.product_slug, item);
    purchased.set(key, (purchased.get(key) ?? 0) + item.quantity);
  }
  return {
    lines: lines.flatMap((line) => {
      const remaining =
        line.quantity -
        (purchased.get(lineKey(line.slug, line.selection)) ?? 0);
      return remaining > 0 ? [{ ...line, quantity: remaining }] : [];
    }),
    settled: [...settled, paymentId].slice(-100),
  };
}

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function activeCampaigns<T extends z.infer<typeof campaignSchema>>(
  items: T[],
  branchId?: string,
  now = Date.now(),
) {
  return items.filter(
    (p) =>
      p.eligible &&
      Date.parse(p.starts_at) <= now &&
      Date.parse(p.ends_at) > now &&
      p.usage_remaining !== 0 &&
      (!p.branch_ids.length || (!!branchId && p.branch_ids.includes(branchId))),
  );
}
export function studioEstimate(
  config: StudioConfig,
  selections: Record<string, string[]>,
) {
  if (
    Object.keys(selections).some(
      (key) => !config.groups.some((group) => group.id === key),
    )
  )
    return null;
  let total = config.base_price;
  const ids = Object.values(selections).flat();
  const breakdown: Array<{ name: string; price: number }> = [
    { name: "Cake", price: config.base_price },
  ];
  for (const group of config.groups) {
    const selected = selections[group.id] ?? [];
    if (
      new Set(selected).size !== selected.length ||
      (!group.multiple && selected.length > 1) ||
      (group.required && !selected.length)
    )
      return null;
    for (const id of selected) {
      const option = group.options.find((o) => o.id === id && o.available);
      if (!option || option.incompatible_with.some((i) => ids.includes(i)))
        return null;
      total += option.price;
      breakdown.push({ name: option.name, price: option.price });
    }
  }
  return { total: Math.round(total * 100) / 100, breakdown };
}
