import { useEffect, useRef, useState } from "react";
import { Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "@/design/useReducedMotion";

/** Polling stays quiet; only a deliberate refresh animates this existing icon. */
export function OrderRefreshButton({
  refresh,
  refreshing,
}: {
  refresh: () => Promise<unknown> | void;
  refreshing: boolean;
}) {
  const reduced = useReducedMotion();
  const [manual, setManual] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  const flight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    turn.setValue(0);
    if (!manual || reduced) return;
    const animation = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [manual, reduced, turn]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh order tracking"
      accessibilityState={{ busy: manual, disabled: refreshing || manual }}
      disabled={refreshing || manual}
      hitSlop={6}
      onPress={() => {
        if (flight.current || refreshing) return;
        flight.current = true;
        setManual(true);
        void Promise.resolve()
          .then(refresh)
          .catch(() => undefined)
          .finally(() => {
            flight.current = false;
            if (alive.current) setManual(false);
          });
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 22,
        backgroundColor: pressed
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.10)",
      })}
    >
      <Animated.View
        style={{
          opacity: manual ? 0.75 : 1,
          transform: [
            {
              rotate: turn.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "360deg"],
              }),
            },
          ],
        }}
      >
        <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}
