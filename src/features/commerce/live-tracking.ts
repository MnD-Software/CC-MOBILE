import type { AppOrder } from "./app-orders";
export type RiderPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  recorded_at: string;
  stale: boolean;
};
export type MapPoint = { latitude: number; longitude: number };
export type LiveMapProps = {
  position: RiderPoint | null;
  destination: MapPoint | null;
};
export const tripStageLabel = (status: string) =>
  ({
    assigned: "Rider assigned",
    accepted: "Rider accepted",
    collected: "Collected from the kitchen",
    in_transit: "On the way",
    delivered: "Delivered",
    failed: "Delivery needs attention",
    rescheduled: "Delivery rescheduled",
    cancelled: "Assignment cancelled",
  })[status] ?? "Preparing your delivery";
export function visibleRiderPoint(
  point: RiderPoint | null | undefined,
  now = Date.now(),
): RiderPoint | null {
  if (!point) return null;
  const age = now - Date.parse(point.recorded_at);
  if (!Number.isFinite(age) || age > 900_000 || age < -15_000) return null;
  return { ...point, stale: point.stale || age > 90_000 };
}
export function trackingDestination(order: AppOrder): MapPoint | null {
  // Staff-entered dispatch overrides may not match the checkout pin; never imply a route to it.
    const pin=order.snapshot?.checkout.delivery_location;
    return order.snapshot?.route?.destination ?? (pin && typeof pin === "object" && "latitude" in pin && "longitude" in pin && typeof pin.latitude === "number" && typeof pin.longitude === "number" ? {latitude:pin.latitude,longitude:pin.longitude}:null);
}
