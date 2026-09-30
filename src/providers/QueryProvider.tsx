import { PropsWithChildren, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import {
  connectivityState,
  subscribeToConnectivity,
} from "@/platform/connectivity";
export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 15 * 60_000,
            retry: (count, error) =>
              count < 2 &&
              !(error instanceof ApiError && (error.status ?? 500) < 500),
            retryDelay: (attempt) => Math.min(8_000, 500 * 2 ** attempt),
            // Screens opt in where fresh foreground data is genuinely useful. This
            // prevents background tab switches from replaying read requests.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => {
    if (Platform.OS === "web") return;
    const listener = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const syncOnlineState = () => {
      const state = connectivityState();
      // Unknown means no OS or request signal has arrived yet. Let initial
      // catalogue reads proceed rather than treating a cold launch as offline.
      if (state !== "unknown") onlineManager.setOnline(state === "online");
    };
    syncOnlineState();
    return subscribeToConnectivity(syncOnlineState);
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
