import { memo, useEffect, useRef, useState } from "react";
import { Animated, AppState, StyleSheet, View } from "react-native";
import { CompactConfettiBurst } from "./CompactConfettiBurst";
import { ConfettiCanvas } from "./ConfettiCanvas";
import { confettiCanvasHtml } from "./confetti-canvas";

const html = confettiCanvasHtml();
/** One grand burst, 5,000 fluttering pieces on a single transparent surface. */
export const ConfettiBurst = memo(function ConfettiBurst({
  motion,
  testID,
  compact = false,
}: {
  motion: Animated.Value;
  testID: string;
  compact?: boolean;
}) {
  const current = useRef(0);
  const [active, setActive] = useState(AppState.currentState !== "background");
  useEffect(() => {
    const token = motion.addListener(({ value }) => {
      current.current = value;
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setActive(false);
    });
    return () => {
      motion.removeListener(token);
      subscription.remove();
    };
  }, [motion]);
  if (!active) return null;
  if (compact)
    return <CompactConfettiBurst motion={motion} testID={testID} compact />;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 100 }]}
    >
      <ConfettiCanvas html={html} progress={() => current.current} />
    </View>
  );
});
