import { useEffect, useRef, useState } from "react";
import { Switch, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { setCommerceTelemetrySink } from "@/observability/commerce-events";

const supported = new Set([
  "search_started",
  "search_completed",
  "product_viewed",
  "quick_add",
  "cart_viewed",
  "checkout_started",
  "payment_started",
  "payment_success",
  "payment_failed",
  "custom_cake_started",
  "custom_cake_completed",
  "coupon_applied",
  "reward_redeemed",
  "reorder_started",
  "reorder_completed",
  "notification_opened",
]);
export function useJourneyConsent() {
  const { customer } = useAuth();
  return useQuery({
    queryKey: ["journey-consent", customer?.id],
    queryFn: () =>
      api.get<{ enabled: boolean }>("/v1/journey/consent", { auth: true }),
    enabled: customer?.role === "customer",
    staleTime: 60000,
    retry: false,
  });
}
export function JourneyMeasurement() {
  const { customer } = useAuth();
  const query = useJourneyConsent();
  const generation = useRef(0);
  useEffect(() => {
    const mine = ++generation.current;
    if (customer?.role !== "customer" || !query.data?.enabled) {
      setCommerceTelemetrySink(null);
      return;
    }
    let queue: { event_id: string; name: string; value?: number }[] = [];
    let busy = false;
    let retries = 0;
    const controller = new AbortController();
    const add = (name: string, value?: number) => {
      if (queue.length < 60)
        queue.push({
          event_id: randomUUID(),
          name,
          ...(value === undefined ? {} : { value }),
        });
    };
    setCommerceTelemetrySink({
      event: (event) => {
        if (supported.has(event.name)) add(event.name);
      },
      metric: (metric) => {
        if (metric.name === "image_load_ms")
          add(metric.name, Math.min(600000, metric.value));
      },
    });
    const timer = setInterval(() => {
      if (busy || !queue.length || generation.current !== mine) return;
      busy = true;
      const batch = queue.splice(0, 30);
      void api
        .post(
          "/v1/journey/signals",
          { events: batch },
          { auth: true, signal: controller.signal },
        )
        .then(() => {
          retries = 0;
        })
        .catch(() => {
          if (
            generation.current === mine &&
            !controller.signal.aborted &&
            ++retries <= 2
          )
            queue = [...batch, ...queue].slice(0, 60);
        })
        .finally(() => {
          busy = false;
        });
    }, 10000);
    return () => {
      generation.current++;
      controller.abort();
      clearInterval(timer);
      queue = [];
      setCommerceTelemetrySink(null);
    };
  }, [customer?.id, customer?.role, query.data?.enabled]);
  return null;
}
export function JourneyConsentControl() {
  const query = useJourneyConsent(),
    cache = useQueryClient();
  const { customer } = useAuth(),
    { colors } = useTheme();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (customer?.role !== "customer" || !query.isSuccess) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ color: colors.ink, flex: 1, fontWeight: "700" }}>
          Help improve the app
        </Text>
        <Switch
          accessibilityLabel="Share optional app journey and loading measurements"
          value={query.data.enabled}
          disabled={busy}
          onValueChange={(enabled) => {
            if (busy) return;
            setBusy(true);
            setError("");
            if (!enabled) setCommerceTelemetrySink(null);
            void api
              .put("/v1/journey/consent", { enabled }, { auth: true })
              .then(() =>
                cache.invalidateQueries({
                  queryKey: ["journey-consent", customer.id],
                }),
              )
              .catch(() =>
                setError("Your preference could not be saved. Please retry."),
              )
              .finally(() => setBusy(false));
          }}
        />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Optional usage and loading measurements, kept for 30 days. No searches,
        messages or payment details are sent. Turning this off deletes your
        measurements.
      </Text>
      {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
    </View>
  );
}
