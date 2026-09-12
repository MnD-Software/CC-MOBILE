import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, Switch, Text, View } from "react-native";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/api/client";
import {
  Screen,
  AccountRequired,
  Feedback,
  Section,
  Notice,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { customerApi, shopApi } from "@/features/commerce/api";
import {
  notificationRoute,
  registerNotifications,
} from "@/native/notifications";
const schema = z.object({
  in_app: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
  whatsapp: z.boolean(),
});
export default function NotificationScreen() {
  return (
    <Screen title="A little heads-up." back>
      <AccountRequired>
        <Inbox />
      </AccountRequired>
    </Screen>
  );
}
function Inbox() {
  const { customer } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["notifications", customer?.id],
    queryFn: customerApi.notifications,
  });
  const prefs = useQuery({
    queryKey: ["notification-preferences", customer?.id],
    queryFn: async () =>
      schema.parse(
        await api.get("/v1/account/notifications/preferences", { auth: true }),
      ),
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  return (
    <>
      <Section title="Your updates, your way" />
      <Feedback
        loading={prefs.isPending}
        error={prefs.error}
        onRetry={() => void prefs.refetch()}
      />
      {prefs.data
        ? (["in_app", "email", "push", "sms", "whatsapp"] as const).map(
            (key) => (
              <View key={key} style={ui.spread}>
                <Text style={ui.label}>{key.replace("_", " ")}</Text>
                <Switch
                  accessibilityLabel={key + " notifications"}
                  value={prefs.data![key]}
                  disabled={
                    busy ||
                    (key === "push" && !config.data?.capabilities.native_push)
                  }
                  onValueChange={async (value) => {
                    setBusy(true);
                    try {
                      if (key === "push" && value)
                        await registerNotifications();
                      await api.put(
                        "/v1/account/notifications/preferences",
                        { ...prefs.data, [key]: value },
                        { auth: true },
                      );
                      await prefs.refetch();
                    } catch (e) {
                      toast(
                        e instanceof Error
                          ? e.message
                          : "Preferences could not be saved.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            ),
          )
        : null}
      <Button
        variant="outline"
        label="Enable device notifications"
        disabled={!config.data?.capabilities.native_push}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await registerNotifications();
            if (prefs.data)
              await api.put(
                "/v1/account/notifications/preferences",
                { ...prefs.data, push: true },
                { auth: true },
              );
            toast("Device notifications enabled.");
            await prefs.refetch();
          } catch (e) {
            toast(
              e instanceof Error
                ? e.message
                : "Notifications could not be enabled.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {!config.data?.capabilities.native_push ? (
        <Notice message="Device notification registration is unavailable right now. You can still check your updates here." />
      ) : null}
      <Section title="For your attention" />
      <Feedback
        loading={q.isPending}
        error={q.error}
        empty={q.data?.length === 0 ? "You’re all caught up." : undefined}
        onRetry={() => void q.refetch()}
      />
      {q.data?.map((n) => (
        <Pressable
          accessibilityRole="button"
          key={n.id}
          style={ui.panel}
          onPress={async () => {
            try {
              await customerApi.readNotification(n.id);
              await q.refetch();
              const path = notificationRoute(n.data);
              if (path) router.push(path);
            } catch (e) {
              toast(
                e instanceof Error
                  ? e.message
                  : "This notification could not be opened.",
              );
            }
          }}
        >
          <Text style={ui.eyebrow}>{n.read_at ? "UPDATE" : "NEW"}</Text>
          <Text style={ui.heading}>{n.title}</Text>
          <Text style={ui.body}>{n.body}</Text>
          <Text style={[ui.body, { fontSize: 12 }]}>
            {new Date(n.created_at).toLocaleString("en-KE")}
          </Text>
        </Pressable>
      ))}
    </>
  );
}
