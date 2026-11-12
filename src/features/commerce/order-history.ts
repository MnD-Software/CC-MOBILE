import type { AppOrder } from "./app-orders";

export function isPastOrder(order: Pick<AppOrder, "status" | "payment_state">) {
  return (
    ["completed", "cancelled", "payment_failed", "failed", "reversed"].includes(
      order.status,
    ) || ["failed", "cancelled", "reversed"].includes(order.payment_state)
  );
}

export function orderHistoryAction(
  order: Pick<AppOrder, "status" | "payment_state">,
) {
  return isPastOrder(order) || order.payment_state !== "completed"
    ? "View order"
    : "Track order";
}
