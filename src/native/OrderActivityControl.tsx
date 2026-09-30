import { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
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
  const available = orderActivitiesAvailable();
  const id = snapshot?.id;
  const number = snapshot?.number;
  const status = snapshot?.status;
  const checkedAt = snapshot?.checkedAt;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeId.current)
        void stopOrderActivity(activeId.current).catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (!activityId || !id || !number || !status || !checkedAt) return;
    let cancelled = false;
    void syncOrderActivity(activityId, { id, number, status, checkedAt })
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
  }, [activityId, id, number, status, checkedAt]);

  if (Platform.OS !== "ios") return null;
  return (
    <View style={[ui.panel, { gap: 10 }]}>
      <Text style={ui.heading}>Your order, at a glance</Text>
      <Text style={ui.body}>
        {available
          ? "Show the latest order status on your Lock Screen and Dynamic Island on supported iPhones. Updates refresh while this order screen is open; the activity is marked stale after two minutes without a refresh."
          : "Lock Screen and Dynamic Island tracking needs the Cake City iPhone build. Expo Go cannot display Cake City’s Live Activity."}
      </Text>
      {available ? (
        <Button
          variant="outline"
          loading={busy}
          label={
            activityId ? "Stop Lock Screen tracking" : "Show on Lock Screen"
          }
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
                await stopOrderActivity(activityId);
                activeId.current = null;
                setActivityId(null);
              } else if (snapshot) {
                const next = await startOrderActivity(snapshot);
                if (!mounted.current) {
                  if (next) await stopOrderActivity(next);
                  return;
                }
                activeId.current = next;
                setActivityId(next);
                if (!next)
                  toast("Live Activities are not available for this order.");
              }
            } catch {
              if (mounted.current)
                toast(
                  "Could not start Live Activity. Check iPhone Live Activities settings.",
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
