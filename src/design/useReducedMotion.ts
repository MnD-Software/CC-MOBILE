import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export type MotionAccessibilityPreference = {
  /** True when non-essential animation should be removed. */
  reduceMotion: boolean;
  /** False only while the native preference is being read for the first time. */
  isResolved: boolean;
};

/**
 * Reads and observes the system reduced-motion preference.
 *
 * The conservative initial value prevents a decorative animation from starting
 * before the accessibility preference arrives. Use `reduceMotion` with
 * `getMotionTiming` and `getPressScale` from `@/design/motion`.
 */
export function useMotionAccessibilityPreference(): MotionAccessibilityPreference {
  const [preference, setPreference] = useState<MotionAccessibilityPreference>({
    reduceMotion: true,
    isResolved: false,
  });

  useEffect(() => {
    let mounted = true;
    let receivedEvent = false;

    const update = (reduceMotion: boolean) => {
      if (!mounted) return;
      setPreference({ reduceMotion, isResolved: true });
    };

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!receivedEvent) update(reduceMotion);
      })
      .catch(() => {
        // Preserve the safe, no-motion fallback if a platform cannot report it.
        update(true);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduceMotion) => {
        receivedEvent = true;
        update(reduceMotion);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return preference;
}

/** Convenient boolean form for press states and simple animation decisions. */
export function useReducedMotion(): boolean {
  return useMotionAccessibilityPreference().reduceMotion;
}
