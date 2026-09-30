import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Haptics describe the meaning of a confirmed interaction, not decoration.
 * Do not call these helpers during scroll, typing, every rendered card, or an
 * unconfirmed payment. The operating system may suppress feedback, so callers
 * must never rely on it for correctness.
 */
export type HapticIntent =
  | "selection"
  | "press"
  | "toggleOn"
  | "toggleOff"
  | "addToCart"
  | "success"
  | "warning"
  | "error";

export type HapticOptions = {
  /** Opt out for a customer-controlled in-app preference if one is added later. */
  enabled?: boolean;
  /** Web vibration is off by default because it is not part of the mobile product contract. */
  allowWeb?: boolean;
};

export const hapticIntentGuidance: Record<HapticIntent, string> = {
  selection:
    "Use once after a discrete option, filter, or tab selection changes.",
  press:
    "Use for a deliberate low-consequence command, not every tappable card.",
  toggleOn:
    "Use after an enabled state is committed, for example saving a cake.",
  toggleOff:
    "Use after a disabled state is committed, for example removing a saved cake.",
  addToCart:
    "Use only after the bag mutation has been accepted locally or by the authoritative cart.",
  success:
    "Use after a confirmed success, never merely after a request begins.",
  warning: "Use sparingly when a customer needs to review a recoverable issue.",
  error:
    "Use only for a direct, customer-visible failure with a recovery path.",
};

const androidIntent: Record<HapticIntent, Haptics.AndroidHaptics> = {
  selection: Haptics.AndroidHaptics.Segment_Tick,
  press: Haptics.AndroidHaptics.Context_Click,
  toggleOn: Haptics.AndroidHaptics.Toggle_On,
  toggleOff: Haptics.AndroidHaptics.Toggle_Off,
  addToCart: Haptics.AndroidHaptics.Confirm,
  success: Haptics.AndroidHaptics.Confirm,
  warning: Haptics.AndroidHaptics.Long_Press,
  error: Haptics.AndroidHaptics.Reject,
};

/**
 * Performs platform-appropriate feedback and intentionally absorbs optional
 * hardware/API failures. Reduced motion is not used as a haptics preference:
 * motion and touch feedback are separate accessibility choices.
 */
export async function performHaptic(
  intent: HapticIntent,
  { enabled = true, allowWeb = false }: HapticOptions = {},
): Promise<void> {
  if (!enabled || (Platform.OS === "web" && !allowWeb)) return;

  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(androidIntent[intent]);
      return;
    }

    switch (intent) {
      case "selection":
      case "toggleOn":
      case "toggleOff":
        await Haptics.selectionAsync();
        return;
      case "press":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case "addToCart":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case "success":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        return;
      case "warning":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
        return;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
    }
  } catch {
    // Haptic hardware and platform settings are optional; UI must remain usable.
  }
}
