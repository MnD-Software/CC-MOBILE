type Scalar = string | number | boolean | null;
export type CommerceEventMetadata = Record<string, Scalar | undefined>;

export const commerceEventNames = [
  "app_open",
  "search_started",
  "search_completed",
  "product_viewed",
  "product_favorited",
  "quick_add",
  "cart_viewed",
  "checkout_started",
  "payment_started",
  "payment_success",
  "payment_failed",
  "order_completed",
  "custom_cake_started",
  "custom_cake_completed",
  "coupon_applied",
  "reward_redeemed",
  "reorder_started",
  "reorder_completed",
  "notification_opened",
] as const;

export type CommerceEventName = (typeof commerceEventNames)[number];
export type PerformanceMetricName =
  | "app_shell_mount_ms"
  | "api_latency_ms"
  | "api_failure"
  | "screen_transition_ms"
  | "image_load_ms"
  | "cache_hit"
  | "cache_miss";

export type RecordedCommerceEvent = {
  name: CommerceEventName;
  at: string;
  metadata: Record<string, Scalar>;
};

export type RecordedPerformanceMetric = {
  name: PerformanceMetricName;
  value: number;
  at: string;
  metadata: Record<string, Scalar>;
};

type TelemetrySink = {
  event?: (event: RecordedCommerceEvent) => void;
  metric?: (metric: RecordedPerformanceMetric) => void;
};

const FORBIDDEN_METADATA_KEY =
  /email|phone|address|token|secret|order.?key|message/i;
const MAX_BUFFERED_RECORDS = 100;
let sink: TelemetrySink | null = null;
const eventBuffer: RecordedCommerceEvent[] = [];
const metricBuffer: RecordedPerformanceMetric[] = [];

function safeMetadata(metadata: CommerceEventMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (value === undefined || FORBIDDEN_METADATA_KEY.test(key)) return [];
      return [[key, value]];
    }),
  ) as Record<string, Scalar>;
}

function append<T>(buffer: T[], value: T) {
  buffer.push(value);
  if (buffer.length > MAX_BUFFERED_RECORDS)
    buffer.splice(0, buffer.length - MAX_BUFFERED_RECORDS);
}

/**
 * Registers an app-owned analytics adapter. The mobile client ships with no
 * default telemetry transport so release environments can choose a compliant,
 * consent-aware analytics backend without exposing customer secrets.
 */
export function setCommerceTelemetrySink(next: TelemetrySink | null) {
  sink = next;
}

export function trackCommerceEvent(
  name: CommerceEventName,
  metadata: CommerceEventMetadata = {},
) {
  const event: RecordedCommerceEvent = {
    name,
    at: new Date().toISOString(),
    metadata: safeMetadata(metadata),
  };
  append(eventBuffer, event);
  // Analytics must never make shopping, payment, or recovery fail. A release
  // adapter can observe errors in its own transport without throwing into UI.
  try {
    sink?.event?.(event);
  } catch {
    // Intentionally isolated: the bounded local buffer remains available.
  }
}

export function recordPerformanceMetric(
  name: PerformanceMetricName,
  value: number,
  metadata: CommerceEventMetadata = {},
) {
  if (!Number.isFinite(value) || value < 0) return;
  const metric: RecordedPerformanceMetric = {
    name,
    value: Math.round(value),
    at: new Date().toISOString(),
    metadata: safeMetadata(metadata),
  };
  append(metricBuffer, metric);
  try {
    sink?.metric?.(metric);
  } catch {
    // See trackCommerceEvent: observability is strictly non-blocking.
  }
}

/** Development tooling may inspect these bounded buffers; production UI never renders them. */
export function recentCommerceObservability() {
  return {
    events: [...eventBuffer],
    metrics: [...metricBuffer],
  };
}
