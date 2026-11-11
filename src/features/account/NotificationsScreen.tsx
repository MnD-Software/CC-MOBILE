import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { router } from "expo-router";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import {
  registerNotifications,
  notificationRoute,
} from "@/native/notifications";

const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  read_at: z.string().nullable(),
  created_at: z.string(),
  data: z.record(z.string(), z.unknown()),
});
const preferenceSchema = z.object({
  order_updates: z.boolean(),
  push_service_enabled: z.boolean(),
});

export function NotificationsScreen() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["notifications", customer?.id];
  const inbox = useInfiniteQuery({
    queryKey: key,
    enabled: !!customer,
    initialPageParam: "",
    queryFn: async ({ pageParam }) =>
      z
        .array(itemSchema)
        .parse(
          await api.get(
            "/v1/account/notifications?limit=30" +
              (pageParam ? "&before=" + encodeURIComponent(pageParam) : ""),
            { auth: true },
          ),
        ),
    getNextPageParam: (page) =>
      page.length === 30 ? page[page.length - 1].id : undefined,
    refetchInterval: 30_000,
  });
  const preferences = useQuery({
    queryKey: ["notification-preferences", customer?.id],
    enabled: !!customer,
    queryFn: async () =>
      preferenceSchema.parse(
        await api.get("/v1/account/notifications/preferences", { auth: true }),
      ),
  });
  async function perform(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const items = inbox.data?.pages.flat() || [];
  return (
    <Screen
      title="Notifications"
      subtitle="Your order updates, all in one place."
      back
    >
      {!customer ? (
        <Button
          label="Sign in to view notifications"
          onPress={() => router.push("/sign-in")}
        />
      ) : (
        <>
          <View
            style={{
              padding: 20,
              gap: 12,
              borderRadius: 22,
              backgroundColor: colors.brandLight,
            }}
          >
            <Text
              style={{ color: colors.ink, fontWeight: "800", fontSize: 19 }}
            >
              Keep up with your cake
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 21 }}>
              Get updates when preparation starts, your cake is ready for
              dispatch or collection, your rider sets off and your order
              arrives. Marketing notifications are off.
            </Text>
            {Platform.OS === "web" ? (
              <Notice message="Your inbox works here. Phone alerts need the installed Android or iPhone app." />
            ) : (
              <>
                <Button
                  label="Enable phone notifications"
                  loading={busy}
                  disabled={busy}
                  onPress={() =>
                    void perform(
                      () => registerNotifications(),
                      preferences.data?.push_service_enabled
                        ? "This phone is registered for order alerts."
                        : "This phone is registered. The server push service still needs activation.",
                    )
                  }
                />
                <Button
                  variant="ghost"
                  label="Open device notification settings"
                  onPress={() =>
                    void Linking.openSettings().catch(() =>
                      setError(
                        "Open Cake City notification permissions in your device settings.",
                      ),
                    )
                  }
                />
              </>
            )}
            {preferences.data ? (
              <Button
                variant="outline"
                label={
                  preferences.data.order_updates
                    ? "Turn order push alerts off"
                    : "Turn order push alerts on"
                }
                disabled={busy}
                onPress={() =>
                  void perform(async () => {
                    await api.patch(
                      "/v1/account/notifications/preferences",
                      { order_updates: !preferences.data.order_updates },
                      { auth: true },
                    );
                    await preferences.refetch();
                  }, "Notification preference saved. Your inbox is always available.")
                }
              />
            ) : preferences.isError ? (
              <Feedback
                error={preferences.error}
                onRetry={() => void preferences.refetch()}
              />
            ) : null}
          </View>
          {error ? <Notice error message={error} /> : null}
          {message ? <Notice message={message} /> : null}
          <Button
            variant="ghost"
            label="Refresh notifications"
            onPress={() => void inbox.refetch()}
          />
          {inbox.isPending ? (
            <Feedback loading />
          ) : inbox.isError ? (
            <Feedback
              error={inbox.error}
              onRetry={() => void inbox.refetch()}
            />
          ) : !items.length ? (
            <Notice message="No updates yet. Your next order's progress will appear here." />
          ) : (
            items.map((item) => (
              <View
                key={item.id}
                style={{
                  padding: 18,
                  gap: 9,
                  borderRadius: 20,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: item.read_at
                    ? colors.border
                    : colors.brandStrong,
                }}
              >
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 17 }}
                >
                  {item.read_at ? "" : "• "}
                  {item.title}
                </Text>
                <Text style={{ color: colors.muted, lineHeight: 21 }}>
                  {item.body}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                <Button
                  variant="outline"
                  label={
                    item.data.workspace === "rider"
                      ? "Open rider workspace"
                      : "View order"
                  }
                  disabled={busy}
                  onPress={() =>
                    void perform(async () => {
                      const path = notificationRoute(item.data);
                      if (!path)
                        throw new Error(
                          "This update has no order link. Contact support for help.",
                        );
                      await api.post(
                        `/v1/account/notifications/${encodeURIComponent(item.id)}/read`,
                        {},
                        { auth: true },
                      );
                      await cache.invalidateQueries({ queryKey: key });
                      await cache.invalidateQueries({
                        queryKey: ["order-updates"],
                      });
                      router.push(path);
                    }, "")
                  }
                />
              </View>
            ))
          )}
          {inbox.hasNextPage ? (
            <Button
              variant="outline"
              label="Load older notifications"
              loading={inbox.isFetchingNextPage}
              onPress={() => void inbox.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
