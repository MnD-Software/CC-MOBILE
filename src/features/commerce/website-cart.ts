import { z } from "zod";

export const websiteCartSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      quantity: z.number().positive(),
      name: z.string(),
    }),
  ),
  coupons: z.array(z.object({ code: z.string().min(1) })).default([]),
  totals: z.object({
    total_price: z.string().regex(/^\d+$/),
    total_discount: z.string().regex(/^\d+$/).optional(),
    currency_code: z.string(),
    currency_minor_unit: z.number().int().min(0).max(4),
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
