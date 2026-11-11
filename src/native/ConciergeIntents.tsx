import * as AppIntents from "expo-app-intents";
import { router, useRootNavigationState } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";

function ReadyIntents() {
  AppIntents.useAppIntents(async (pending) => {
    for (const invocation of pending) {
      if (invocation.name !== "cakeCityConcierge") continue;
      const { action, prompt } = invocation.params;
      if (
        !["talk", "track", "reorder"].includes(String(action)) ||
        (prompt !== undefined && typeof prompt !== "string")
      ) {
        console.warn("Discarded an invalid Cake City shortcut request.");
        await AppIntents.removePendingInvocationAsync(invocation.id);
        continue;
      }
      // Navigation only. Cold launches never order or pay without a review.
      router.navigate(
        action === "track"
          ? "/(tabs)/orders"
          : {
              pathname: "/concierge",
              params: {
                action: String(action),
                prompt: typeof prompt === "string" ? prompt.slice(0, 1500) : "",
              },
            },
      );
      await AppIntents.removePendingInvocationAsync(invocation.id);
    }
  });
  return null;
}
export function ConciergeIntents() {
  const { restoring } = useAuth();
  const navigation = useRootNavigationState();
  return restoring || !navigation?.key ? null : <ReadyIntents />;
}
