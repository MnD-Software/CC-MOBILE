import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { notificationRoute } from "@/native/notifications";

const updateSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  read_at: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
type OrderUpdate = z.infer<typeof updateSchema>;
export function useOrderUpdates(poll = false) {
  const { customer } = useAuth();
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);
  return useQuery({
    queryKey: ["order-updates", customer?.id],
    queryFn: async ({ signal }) =>
      updateSchema.array().parse(
        await api.get("/v1/account/notifications?limit=10", {
          auth: true,
          signal,
        }),
      ),
    enabled: !!customer && foreground,
    staleTime: 10_000,
    refetchInterval: foreground && poll ? 12_000 : false,
    retry: false,
  });
}

/** Foreground inbox updates also work in Expo Go and without remote push credentials. */
export function OrderUpdateBanner() {
  const path = usePathname();
  const { customer } = useAuth();
  const updates = useOrderUpdates(true);
  const cache = useQueryClient();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const seen = useRef<{ owner: string; ids: Set<string> } | null>(null);
  const [banner, setBanner] = useState<{
    owner: string;
    item: OrderUpdate;
  } | null>(null);
  useEffect(() => {
    if (!customer || !updates.data) return;
    const ids = new Set(updates.data.map((item) => item.id));
    if (seen.current?.owner !== customer.id) {
      seen.current = { owner: customer.id, ids };
      setBanner(null);
      return;
    }
    const incoming = updates.data.find(
      (item) => !seen.current!.ids.has(item.id) && !item.read_at,
    );
    seen.current = { owner: customer.id, ids };
    if (incoming) {
      setBanner({ owner: customer.id, item: incoming });
      for (const queryKey of [["app-orders"], ["app-order"], ["notifications"]])
        void cache.invalidateQueries({ queryKey });
    }
  }, [customer?.id, updates.data, cache]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4200);
    return () => clearTimeout(timer);
  }, [banner]);
  if (
    !banner ||
    banner.owner !== customer?.id ||
    /checkout|payment|sign-in|custom/.test(path)
  )
    return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 16,
        right: 16,
        zIndex: 2000,
        elevation: 40,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${banner.item.title}. View update`}
        onPress={() => {
          const path = notificationRoute(banner.item.data);
          const identity = banner.item.id;
          setBanner(null);
          void api
            .post(
              `/v1/account/notifications/${encodeURIComponent(identity)}/read`,
              {},
              { auth: true },
            )
            .then(() => {
              void cache.invalidateQueries({ queryKey: ["order-updates"] });
              void cache.invalidateQueries({ queryKey: ["notifications"] });
            })
            .catch(() => undefined);
          if (path) router.push(path);
        }}
        style={{
          padding: 16,
          paddingRight: 52,
          gap: 6,
          borderRadius: 20,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 4,
          borderLeftColor: colors.brandStrong,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.ink, fontSize: 14, fontWeight: "800" }}
        >
          {banner.item.title}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>
          {banner.item.body}
        </Text>
        <Text
          style={{ color: colors.brandStrong, fontSize: 10, fontWeight: "700" }}
        >
          Tap to view order
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss update"
        onPress={() => setBanner(null)}
        style={{
          position: "absolute",
          right: 5,
          top: 5,
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" color={colors.muted} size={20} />
      </Pressable>
    </View>
  );
}
