import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { registerNotifications } from "./notifications";

/** Refresh an existing grant on login/foreground; never prompt during launch. */
export function PushRegistration() {
  const { customer, restoring } = useAuth();
  useEffect(() => {
    if (!customer || restoring || Platform.OS === "web") return;
    let busy = false;
    const sync = async () => {
      if (busy) return;
      busy = true;
      try {
        await registerNotifications(false);
      } catch {
        /* The notification screen gives actionable errors. */
      } finally {
        busy = false;
      }
    };
    void sync();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    return () => listener.remove();
  }, [customer?.id, restoring]);
  return null;
}
