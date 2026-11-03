import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useReducedMotion } from "@/design/useReducedMotion";
import { useScreenActive } from "@/design/useScreenActive";

export function MilestoneProgressBar({
  current,
  total,
  color,
  trackColor,
  label,
  height = 6,
}: {
  current: number;
  total: number;
  color: string;
  trackColor: string;
  label: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const focused = useScreenActive();
  const fill = useRef(new Animated.Value(0)).current;
  const fraction = Math.max(0, Math.min(1, current / Math.max(1, total)));
  useEffect(() => {
    fill.stopAnimation();
    if (reduce || !focused) {
      fill.setValue(fraction);
      return;
    }
    fill.setValue(0);
    const motion = Animated.timing(fill, {
      toValue: fraction,
      duration: 750,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    motion.start();
    return () => motion.stop();
  }, [fraction, reduce, focused, fill]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(total, Math.max(0, current))}
      style={{
        height,
        backgroundColor: trackColor,
        borderRadius: 99,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          height: "100%",
          borderRadius: 99,
          backgroundColor: color,
          width: fill.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          }),
        }}
      />
    </View>
  );
}
