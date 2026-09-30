export type OrderActivityState = {
  label: string;
  compact: string;
  terminal: boolean;
};

/** Status comes from a fresh Cake City response; never infer an ETA or kitchen progress. */
export function orderActivityState(status: string): OrderActivityState | null {
  const states: Record<string, OrderActivityState> = {
    pending: { label: "Awaiting payment", compact: "Payment", terminal: false },
    processing: {
      label: "Order confirmed",
      compact: "Confirmed",
      terminal: false,
    },
    confirmed: {
      label: "Order confirmed",
      compact: "Confirmed",
      terminal: false,
    },
    preparing: {
      label: "Preparing your order",
      compact: "Preparing",
      terminal: false,
    },
    baking: {
      label: "Your cake is baking",
      compact: "Baking",
      terminal: false,
    },
    decorating: {
      label: "Adding the finishing touches",
      compact: "Decorating",
      terminal: false,
    },
    ready: { label: "Your order is ready", compact: "Ready", terminal: false },
    "out-for-delivery": {
      label: "Out for delivery",
      compact: "On the way",
      terminal: false,
    },
    dispatched: {
      label: "Order dispatched",
      compact: "On the way",
      terminal: false,
    },
    delivered: {
      label: "Order delivered",
      compact: "Delivered",
      terminal: true,
    },
    completed: { label: "Order complete", compact: "Complete", terminal: true },
    cancelled: {
      label: "Order cancelled",
      compact: "Cancelled",
      terminal: true,
    },
    canceled: {
      label: "Order cancelled",
      compact: "Cancelled",
      terminal: true,
    },
    refunded: { label: "Order refunded", compact: "Refunded", terminal: true },
    failed: {
      label: "Payment unsuccessful",
      compact: "Check app",
      terminal: true,
    },
    "on-hold": {
      label: "Order on hold — check the app",
      compact: "On hold",
      terminal: false,
    },
  };
  return (
    states[
      status
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
    ] ?? null
  );
}
