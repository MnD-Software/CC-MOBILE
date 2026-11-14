import { ConfettiBurst } from "./ConfettiBurst";
import { useConfettiLayer } from "./ConfettiLayer";
import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, View, type ViewProps } from "react-native";
import { useScreenActive as useIsFocused } from "@/design/useScreenActive";
import { useReducedMotion } from "@/design";
import { Text } from "./Typography";

export function Reveal({ children, style, ...props }: ViewProps) {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduce, progress]);
  return (
    <Animated.View
      {...props}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Actual numeric values remain readable; only the presentation acknowledges change. */
export function AnimatedNumber({
  value,
  format = String,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    progress.stopAnimation();
    if (reduce || !focused || AppState.currentState === "background") {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(1);
    };
  }, [value, reduce, focused, progress]);
  return (
    <Animated.Text
      accessibilityLabel={format(value)}
      style={{
        opacity: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 1],
        }),
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.98, 1],
            }),
          },
        ],
      }}
    >
      <Text>{format(value)}</Text>
    </Animated.Text>
  );
}

/** Short, bounded confetti only after a confirmed successful action. */
export function SuccessBurst({ trigger }: { trigger: number }) {
  const register = useConfettiLayer();
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const played = useRef(0);
  useEffect(() => {
    if (played.current === trigger) return;
    played.current = trigger;
    if (
      !trigger ||
      reduce ||
      !focused ||
      AppState.currentState === "background"
    )
      return;
    setVisible(true);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 6200,
      easing: Easing.linear,
      isInteraction: false,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => {
      animation.stop();
      setVisible(false);
    };
  }, [trigger, reduce, focused, progress]);
  useEffect(() => {
    if (!visible || reduce || !focused || !register) return;
    return register(progress);
  }, [visible, reduce, focused, register, progress]);
  if (!visible || reduce || !focused || register) return null;
  return (
    <View pointerEvents="none" style={{ height: 0, zIndex: 100 }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -200,
          left: -16,
          right: -16,
          height: 600,
        }}
      >
        <ConfettiBurst motion={progress} testID="reward-success-confetti" />
      </View>
    </View>
  );
}
