import { z } from "zod";

export const websiteCartSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      quantity: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  coupons: z.array(z.object({ code: z.string().min(1) })).default([]),
  totals: z.object({
    total_price: z
      .string()
      .regex(/^\d+$/)
      .refine((value) => Number.isSafeInteger(Number(value))),
    total_discount: z.string().regex(/^\d+$/).optional(),
    currency_code: z.literal("KES"),
    currency_minor_unit: z.literal(2),
  }),
});

export function normalizeCouponCode(value: string) {
  const code = value.trim().toLowerCase();
  if (!code || code.length > 100 || /[\u0000-\u001f\u007f]/.test(code))
    throw new Error("Enter a coupon code of 1 to 100 characters.");
  return code;
}

export function cartHasRequestedCoupon(
  cart: z.infer<typeof websiteCartSchema>,
  requested: string | null,
) {
  const codes = cart.coupons.map((coupon) => normalizeCouponCode(coupon.code));
  return requested
    ? codes.length === 1 && codes[0] === normalizeCouponCode(requested)
    : codes.length === 0;
}

/** Compare quantities by product/variation ID, independent of server ordering. */
export function websiteCartItemsMatch(
  cart: z.infer<typeof websiteCartSchema>,
  expected: ReadonlyArray<{ id: number; quantity: number }>,
) {
  const quantities = (
    items: ReadonlyArray<{ id: number; quantity: number }>,
  ) => {
    const values = new Map<number, number>();
    for (const item of items)
      values.set(item.id, (values.get(item.id) ?? 0) + item.quantity);
    return values;
  };
  const actual = quantities(cart.items);
  const wanted = quantities(expected);
  return (
    actual.size === wanted.size &&
    [...wanted].every(([id, quantity]) => actual.get(id) === quantity)
  );
}
