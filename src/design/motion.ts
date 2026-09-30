import { Easing, type EasingFunction } from "react-native";

/**
 * Intent-led motion tokens for Cake City.
 *
 * These timings are deliberately short: motion should acknowledge an action or
 * clarify a state change, never delay shopping. Consumers should use transform
 * and opacity for native-driver-friendly animation, and use `getMotionTiming`
 * rather than recreating reduced-motion checks in every screen.
 */
export const motion = {
  duration: {
    instant: 0,
    press: 110,
    selection: 160,
    standard: 220,
    emphasis: 280,
  },
  scale: {
    press: 0.985,
    addToCart: 0.96,
  },
  timing: {
    press: { duration: 110, easing: Easing.out(Easing.cubic) },
    selection: { duration: 160, easing: Easing.out(Easing.cubic) },
    enter: { duration: 220, easing: Easing.out(Easing.cubic) },
    exit: { duration: 160, easing: Easing.in(Easing.cubic) },
    emphasis: { duration: 280, easing: Easing.out(Easing.back(1.05)) },
    priceChange: { duration: 220, easing: Easing.out(Easing.cubic) },
  },
} as const;

export type MotionIntent = keyof typeof motion.timing;

export type MotionTiming = {
  duration: number;
  easing: EasingFunction;
};

export type MotionTimingOptions = {
  /** Whether the customer requested reduced motion through the system setting. */
  reduceMotion?: boolean;
  /**
   * Reserve this for state-critical feedback such as a required focus change.
   * Decorative animation must leave this false and therefore becomes instant.
   */
  essential?: boolean;
};

/**
 * Resolves an animation timing without forcing a rendering implementation.
 * It is usable with React Native Animated today and leaves room for a future
 * Reanimated implementation without changing screen-level intent names.
 */
export function getMotionTiming(
  intent: MotionIntent,
  { reduceMotion = false, essential = false }: MotionTimingOptions = {},
): MotionTiming {
  const timing = motion.timing[intent];
  return {
    duration:
      reduceMotion && !essential ? motion.duration.instant : timing.duration,
    easing: timing.easing,
  };
}

/** Returns the only supported press scale; reduced-motion presses remain still. */
export function getPressScale(
  pressed: boolean,
  reduceMotion: boolean,
  intent: "default" | "addToCart" = "default",
): number {
  if (!pressed || reduceMotion) return 1;
  return intent === "addToCart" ? motion.scale.addToCart : motion.scale.press;
}

/**
 * Code-review guidance attached to the intent names above. Keep animations
 * interruptible, under 300 ms, and never use them for loading or persuasion.
 */
export const motionIntentGuidance: Record<MotionIntent, string> = {
  press:
    "Acknowledge a direct press only; do not delay navigation or mutations.",
  selection:
    "Confirm a discrete selection change, such as a filter chip or cake option.",
  enter:
    "Introduce newly relevant content once; never autoplay a carousel for its own sake.",
  exit: "Remove dismissed content quickly without blocking the next action.",
  emphasis:
    "Reserve for a successful customer action, never for an error or promotion.",
  priceChange:
    "Clarify a customer-caused price update; keep the numeric value readable throughout.",
};
