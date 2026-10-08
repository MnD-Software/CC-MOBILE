import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { ui, useToast } from "@/components/ui/Commerce";
import { orderActivityState } from "./order-activity-state";
import {
  orderActivitiesAvailable,
  startOrderActivity,
  stopOrderActivity,
  syncOrderActivity,
  type OrderActivitySnapshot,
} from "./order-activity-controller";
import {
  androidOrderTrackingAvailable,
  startAndroidOrderTracking,
  stopAndroidOrderTracking,
  syncAndroidOrderTracking,
} from "./order-tracking-notification";

type TrackingPlatform = "ios" | "android" | null;

export function OrderActivityControl({
  snapshot,
}: {
  snapshot: OrderActivitySnapshot | null;
}) {
  const [activityId, setActivityId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const toast = useToast();
  const trackingPlatform: TrackingPlatform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : null;
  const available =
    trackingPlatform === "ios"
      ? orderActivitiesAvailable()
      : trackingPlatform === "android"
        ? androidOrderTrackingAvailable()
        : false;
  const id = snapshot?.id;
  const number = snapshot?.number;
  const status = snapshot?.status;
  const checkedAt = snapshot?.checkedAt;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!activeId.current) return;
      const stop =
        trackingPlatform === "ios"
          ? stopOrderActivity
          : trackingPlatform === "android"
            ? stopAndroidOrderTracking
            : null;
      if (stop) void stop(activeId.current).catch(() => undefined);
    };
  }, [trackingPlatform]);
  useEffect(() => {
    if (
      !activityId ||
      !id ||
      !number ||
      !status ||
      !checkedAt ||
      !trackingPlatform
    )
      return;
    let cancelled = false;
    const sync =
      trackingPlatform === "ios"
        ? syncOrderActivity
        : syncAndroidOrderTracking;
    void sync(activityId, { id, number, status, checkedAt })
      .then((active) => {
        if (!cancelled && !active) {
          activeId.current = null;
          setActivityId(null);
        }
      })
      .catch(() => {
        // Keep the last server snapshot with its original stale date. Do not
        // promote the order or claim a refresh after a native update failure.
      });
    return () => {
      cancelled = true;
    };
  }, [activityId, checkedAt, id, number, status, trackingPlatform]);

  if (!trackingPlatform) return null;
  const isIos = trackingPlatform === "ios";
  const title = "Your order, at a glance";
  const description = isIos
    ? available
      ? "Show the latest order status on your Lock Screen and Dynamic Island on supported iPhones. Updates refresh while this order screen is open; the activity is marked stale after two minutes without a refresh."
      : "Lock Screen and Dynamic Island tracking needs the Cake City iPhone build. Expo Go cannot display Cake City’s Live Activity."
    : "Keep the latest verified order status in your notification shade. It refreshes while this order screen is open, and always shows when Cake City last confirmed it.";
  const startLabel = isIos ? "Show on Lock Screen" : "Show in notifications";
  const stopLabel = isIos
    ? "Stop Lock Screen tracking"
    : "Stop notification tracking";
  return (
    <View style={[ui.panel, { gap: 10 }]}>
      <Text style={ui.heading}>{title}</Text>
      <Text style={ui.body}>{description}</Text>
      {available ? (
        <Button
          variant="outline"
          loading={busy}
          label={activityId ? stopLabel : startLabel}
          disabled={
            busy ||
            (!activityId &&
              (!snapshot ||
                !!orderActivityState(snapshot.status)?.terminal ||
                !orderActivityState(snapshot.status)))
          }
          onPress={async () => {
            setBusy(true);
            try {
              if (activityId) {
                if (isIos) await stopOrderActivity(activityId);
                else await stopAndroidOrderTracking(activityId);
                activeId.current = null;
                setActivityId(null);
              } else if (snapshot) {
                const next = isIos
                  ? await startOrderActivity(snapshot)
                  : await startAndroidOrderTracking(snapshot);
                if (!mounted.current) {
                  if (next) {
                    if (isIos) await stopOrderActivity(next);
                    else await stopAndroidOrderTracking(next);
                  }
                  return;
                }
                activeId.current = next;
                setActivityId(next);
                if (!next)
                  toast(
                    isIos
                      ? "Live Activities are not available for this order."
                      : "Order tracking cannot be enabled for this order.",
                  );
              }
            } catch (cause) {
              if (mounted.current)
                toast(
                  cause instanceof Error
                    ? cause.message
                    : isIos
                      ? "Could not start Live Activity. Check iPhone Live Activities settings."
                      : "Could not show order tracking. Check Android notification settings.",
                );
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        />
      ) : null}
    </View>
  );
}
