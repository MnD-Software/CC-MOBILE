import type { AppOrder } from "./app-orders";

export function orderTracking(order: AppOrder) {
  const delivery = order.snapshot?.checkout.fulfilment === "delivery";
  const events = new Map(
    (order.events || []).map((e) => [e.kind, e.created_at]),
  );
  return [
    { label: "Order received", at: order.created_at },
    {
      label: order.review_checkout
        ? "Order confirmed"
        : order.payment_test
          ? "Test purchase confirmed (no charge)"
          : "Payment verified",
      at: order.paid_at,
    },
    { label: "Preparing your order", at: events.get("fulfilment_preparing") },
    {
      label: delivery ? "Ready for dispatch" : "Ready for pickup",
      at: events.get("fulfilment_ready"),
    },
    ...(delivery
      ? [
          {
            label: "Out for delivery",
            at: events.get("fulfilment_out_for_delivery"),
          },
        ]
      : []),
    {
      label: delivery ? "Delivered" : "Collected",
      at: events.get("fulfilment_completed"),
    },
  ];
}
