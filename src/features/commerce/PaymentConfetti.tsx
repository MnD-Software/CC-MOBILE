import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useReducedMotion } from "@/design/useReducedMotion";

/** Mounted only after a server-verified payment, never by a payment-button tap. */
export function PaymentConfetti({ onComplete }: { onComplete: () => void }) {
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      onComplete();
      return;
    }
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 2800,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => animation.stop();
  }, [reduce, motion, onComplete]);
  if (reduce) return null;
  return (
    <View
      testID="payment-success-confetti"
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 100 }]}
    >
      {Array.from({ length: 40 }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: width / 2,
            top: Math.min(height * 0.6, 460),
            width: 7,
            height: i % 3 ? 12 : 7,
            borderRadius: i % 3 ? 2 : 5,
            backgroundColor: [
              "#EC008C",
              "#FFC857",
              "#46BFA0",
              "#8E79E5",
              "#51C4DC",
            ][i % 5],
            opacity: motion.interpolate({
              inputRange: [0, 0.08, 0.7, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateX: motion.interpolate({
                  inputRange: [0, 0.6, 1],
                  outputRange: [
                    0,
                    (i % 2 ? 1 : -1) *
                      (35 + ((i * 23) % Math.max(70, width / 2))),
                    (i % 2 ? 1 : -1) *
                      (45 + ((i * 23) % Math.max(70, width / 2))),
                  ],
                }),
              },
              {
                translateY: motion.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [
                    0,
                    -100 - ((i * 17) % 160),
                    220 + ((i * 19) % 180),
                  ],
                }),
              },
              {
                rotate: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    "0deg",
                    `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`,
                  ],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
