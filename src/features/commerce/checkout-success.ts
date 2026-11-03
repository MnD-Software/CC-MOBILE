import type { AppOrder } from "./app-orders";

export function isVerifiedPayment(
  order: Pick<AppOrder, "payment_state" | "paid_at" | "total_minor">,
) {
  return (
    order.payment_state === "completed" &&
    Boolean(order.paid_at) &&
    order.total_minor > 0
  );
}

/** The actual chosen weight must survive bag storage and checkout, including 3–20kg cakes. */
export function selectionWeight(label: string, fallback = "1kg") {
  const match = label.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*kg\b/i);
  return match && Number(match[1]) > 0 ? `${Number(match[1])}kg` : fallback;
}

export function paymentCelebrationKey(owner: string, reference: string) {
  return `cakecity.payment-celebration.${encodeURIComponent(owner)}.${reference}`;
}
