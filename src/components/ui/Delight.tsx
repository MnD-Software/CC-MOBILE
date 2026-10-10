import { useEffect, useRef, useState } from "react";
import { Animated, AppState, View, type ViewProps } from "react-native";
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
      duration: 650,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => {
      animation.stop();
    };
  }, [trigger, reduce, focused, progress]);
  if (!visible || reduce || !focused) return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ height: 64, alignItems: "center", overflow: "hidden" }}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            width: 7,
            height: 10,
            borderRadius: 2,
            backgroundColor: ["#EC008C", "#B68527", "#1685A8"][index % 3],
            opacity: progress.interpolate({
              inputRange: [0, 0.7, 1],
              outputRange: [1, 1, 0],
            }),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, (index - 5.5) * 23],
                }),
              },
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [42, index % 2 ? 0 : 12, 65],
                }),
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", `${index % 2 ? 180 : -160}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
