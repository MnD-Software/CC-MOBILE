import type { TestState } from "./client";

export const purchaseName = (name: string) => name.replace(/^TEST\s+/i, "");

/** One server-confirmed balance supplies checkout, Club and transaction history. */
export function previewClub(state: TestState) {
  const rawId = state.history.at(-1)?.id.replace(/^TEST-/, "") ?? "";
  const memberHex = /^[a-f0-9]{32}$/i.test(rawId)
    ? rawId
    : "00000000000000000000000000000001";
  const memberId = `${memberHex.slice(0, 8)}-${memberHex.slice(8, 12)}-${memberHex.slice(12, 16)}-${memberHex.slice(16, 20)}-${memberHex.slice(20)}`;
  const activity = state.history
    .filter((row) => row.status === "succeeded")
    .map((row) => {
      const earned = row.items.reduce(
        (sum, item) => sum + item.test_points * item.quantity,
        0,
      );
      return {
        id: row.id,
        points: Math.floor(
          (earned * (row.amount_minor - row.refunded_minor)) / row.amount_minor,
        ),
        description: `${row.items.map((item) => purchaseName(item.name)).join(", ")}${row.refunded_minor ? " · adjusted after refund" : ""}`,
        created_at: row.created_at,
        receipt_reference: row.id,
      };
    });
  return {
    member_id: memberId,
    points: state.membership.points,
    debt: 0,
    tier: state.membership.tier,
    next_tier: state.membership.next_tier
      ? { name: state.membership.next_tier.name, spend_required_kes: 0 }
      : null,
    purchase_progress: state.membership,
    rules: {
      earn_spend_kes: 4,
      point_value_kes: 1,
      expiry_days: 365,
      minimum_redemption: 100,
      minimum_order_multiple: 1,
    },
    redemption_available: false,
    review_required: false,
    coupons: [],
    activity,
  };
}
