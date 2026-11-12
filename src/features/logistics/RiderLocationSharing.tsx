import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import {
  backgroundTrip,
  startBackgroundSharing,
  stopBackgroundSharing,
} from "@/native/rider-background";
import * as Location from "expo-location";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useScreenActive } from "@/design/useScreenActive";
import { useTheme } from "@/theme/ThemeProvider";
import { logisticsApi } from "./api";

/** Explicit, assigned-trip sharing; background sharing requires a separate opt-in. */
export function RiderLocationSharing({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const active = useScreenActive();
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [background, setBackground] = useState(false);
  const stopped = useRef(false);
  const allowed = ["collected", "in_transit"].includes(status);
  const lastSent = useRef(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    void backgroundTrip()
      .then(async (id) => {
        if (id === taskId && !allowed) await stopBackgroundSharing();
        if (current) setBackground(id === taskId && allowed);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [active, taskId, allowed]);
  useEffect(() => {
    if (!allowed) setEnabled(false);
  }, [allowed]);
  useEffect(() => {
    if (!enabled || !active || !allowed) return;
    let disposed = false,
      sending = false;
    let watcher: Location.LocationSubscription | undefined;
    const start = async () => {
      try {
        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 0,
          },
          async (fix) => {
            if (disposed || sending || Date.now() - lastSent.current < 5000)
              return;
            if (fix.coords.accuracy == null || fix.coords.accuracy > 200) {
              setMessage("Waiting for a more accurate GPS signal…");
              return;
            }
            sending = true;
            lastSent.current = Date.now();
            try {
              await logisticsApi.shareLocation(taskId, {
                latitude: fix.coords.latitude,
                longitude: fix.coords.longitude,
                accuracy: fix.coords.accuracy,
                recorded_at: new Date(fix.timestamp).toISOString(),
              });
              if (!disposed)
                setMessage(
                  `Location shared at ${new Date().toLocaleTimeString()}`,
                );
            } catch (reason) {
              if (!disposed)
                setMessage(
                  reason instanceof Error
                    ? reason.message
                    : "Location couldn't be sent. Retrying on the next fix.",
                );
            } finally {
              sending = false;
              if (disposed)
                void logisticsApi.stopLocation(taskId).catch(() => undefined);
            }
          },
        );
        if (disposed) watcher.remove();
      } catch (reason) {
        if (!disposed) {
          setEnabled(false);
          setMessage(
            reason instanceof Error
              ? reason.message
              : "Couldn't start GPS. Check location settings.",
          );
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      watcher?.remove();
      void logisticsApi.stopLocation(taskId).catch(() => undefined);
    };
  }, [taskId, enabled, active, allowed]);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (stopped.current) return;
      if (!permission.granted) {
        setMessage(
          "Allow location access in Settings to share your delivery progress.",
        );
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setMessage("Turn on your phone's location services first.");
        return;
      }
      lastSent.current = 0;
      setEnabled(true);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Location is unavailable.",
      );
    } finally {
      if (!stopped.current) setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <View
      style={{
        gap: 10,
        padding: 18,
        borderRadius: 20,
        backgroundColor: colors.brandLight,
      }}
    >
      <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 14 }}>
        Customer live tracking
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
        Share your position only for this delivery. Keep this screen open;
        sharing pauses when you switch apps or lock the phone.
      </Text>
      <Button
        label={
          enabled ? "Stop sharing my location" : "Share live delivery location"
        }
        loading={busy}
        variant={enabled ? "outline" : "primary"}
        onPress={() => void toggle()}
        disabled={background}
      />
      {Platform.OS !== "web" ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            For navigation or a locked screen, enable background sharing and
            choose Always allow. Your location is shared only for this trip, for
            up to eight hours. Closing the app or phone battery restrictions can
            stop updates.
          </Text>
          <Button
            label={
              background ? "Stop background sharing" : "Share while navigating"
            }
            variant="outline"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void (
                background
                  ? stopBackgroundSharing()
                  : startBackgroundSharing(taskId)
              )
                .then(() => {
                  setBackground(!background);
                  setEnabled(false);
                  setMessage(
                    background
                      ? "Background sharing stopped."
                      : "Background delivery sharing is active.",
                  );
                })
                .catch((reason) =>
                  setMessage(
                    reason instanceof Error
                      ? reason.message
                      : "Could not update background sharing.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}
