import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import type * as Notifications from "expo-notifications";

let runtime: typeof Notifications | undefined;
let unavailable = false;

/** SDK 57's notification entrypoint throws during import in Android Expo Go. */
export function getNativeNotifications(): typeof Notifications | null {
  if (
    unavailable ||
    Platform.OS === "web" ||
    (Platform.OS === "android" && isRunningInExpoGo())
  )
    return null;
  // The platform check must happen before evaluating the package entrypoint.
  try {
    runtime ??= require("expo-notifications") as typeof Notifications;
    return runtime;
  } catch {
    // Optional notifications must never prevent shopping or order recovery.
    unavailable = true;
    return null;
  }
}
