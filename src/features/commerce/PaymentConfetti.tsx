import { ConfettiBurst } from "@/components/ui/ConfettiBurst";
import { useConfettiLayer } from "@/components/ui/ConfettiLayer";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";

/** Mounted only after a server-verified payment, never by a payment-button tap. */
export function PaymentConfetti({ onComplete }: { onComplete: () => void }) {
  const { reduceMotion: reduce, isResolved } =
    useMotionAccessibilityPreference();
  const motion = useRef(new Animated.Value(0)).current;
  const register = useConfettiLayer();
  useEffect(() => {
    if (!isResolved || reduce || !register) return;
    return register(motion);
  }, [register, motion, isResolved, reduce]);
  useEffect(() => {
    if (!isResolved) return;
    if (reduce) {
      onComplete();
      return;
    }
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 7400,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => animation.stop();
  }, [reduce, isResolved, motion, onComplete]);
  if (!isResolved || reduce) return null;
  return register ? null : (
    <ConfettiBurst motion={motion} testID="payment-success-confetti" />
  );
}
