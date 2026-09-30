export type OrderJourneyState = "complete" | "current" | "upcoming" | "blocked";

export type OrderJourneyStep = {
  id:
    | "received"
    | "payment-confirmed"
    | "preparing"
    | "baking"
    | "decorating"
    | "ready"
    | "out-for-delivery"
    | "delivered"
    | "outcome";
  label: string;
  state: OrderJourneyState;
};

type StageId = Exclude<OrderJourneyStep["id"], "outcome">;

const journeyStages: ReadonlyArray<{ id: StageId; label: string }> = [
  { id: "received", label: "Order received" },
  { id: "payment-confirmed", label: "Payment confirmed" },
  { id: "preparing", label: "Preparing" },
  { id: "baking", label: "Baking" },
  { id: "decorating", label: "Decorating" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
];

const statusToStage: Record<string, StageId> = {
  pending: "received",
  processing: "preparing",
  preparing: "preparing",
  baking: "baking",
  decorating: "decorating",
  ready: "ready",
  "out-for-delivery": "out-for-delivery",
  out_for_delivery: "out-for-delivery",
  dispatched: "out-for-delivery",
  delivered: "delivered",
  completed: "delivered",
};

const blockedOutcomes: Record<string, string> = {
  failed: "Payment unsuccessful",
  cancelled: "Order cancelled",
  canceled: "Order cancelled",
  refunded: "Order refunded",
  "on-hold": "Payment being reviewed",
  on_hold: "Payment being reviewed",
};

function normaliseStatus(status: string) {
  return status.trim().toLocaleLowerCase().replace(/\s+/g, "-");
}

/**
 * Maps only an order state returned by Cake City into a customer-facing
 * journey. The client never promotes a cake through baking, decorating or
 * delivery on a timer: those stages appear only when the backend reports a
 * matching state. WooCommerce's `processing` means an accepted, paid order
 * awaiting fulfilment, so it can truthfully surface as the current preparing
 * stage without inventing deeper kitchen progress.
 */
export function orderJourney(status: string): OrderJourneyStep[] {
  const normalized = normaliseStatus(status);
  const outcome = blockedOutcomes[normalized];

  if (outcome) {
    return [
      { id: "received", label: "Order received", state: "complete" },
      {
        id: "outcome",
        label: outcome,
        state: "blocked",
      },
    ];
  }

  const activeStage = statusToStage[normalized];
  if (!activeStage) {
    return [
      { id: "received", label: "Order received", state: "complete" },
      {
        id: "outcome",
        label: "Cake City is updating your order",
        state: "current",
      },
    ];
  }

  const currentIndex = journeyStages.findIndex(
    (stage) => stage.id === activeStage,
  );
  return journeyStages.map((stage, index) => ({
    ...stage,
    state:
      index < currentIndex
        ? "complete"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));
}
