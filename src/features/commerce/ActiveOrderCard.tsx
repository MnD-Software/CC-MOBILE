import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { z } from "zod";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { appOrderSchema } from "./app-orders";
import { OrderMilestoneMarquee } from "./OrderMilestoneMarquee";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";

export const orderStageLabel = (status: string) =>
  (
    ({
      paid: "Order confirmed",
      preparing: "In the kitchen",
      ready: "Your cake is ready",
      out_for_delivery: "On the way to you",
      completed: "Order complete",
      awaiting_payment: "Awaiting payment",
    }) as Record<string, string>
  )[status] ?? status.replaceAll("_", " ");

export function ActiveOrderCard() {
  const { customer } = useAuth();
  const active = useScreenActive();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const orders = useQuery({
    queryKey: ["app-orders", customer?.id, "home-milestones"],
    queryFn: async () =>
      z
        .object({
          data: z.array(appOrderSchema.extend({ fulfilment: z.string() })),
        })
        .parse(await api.get("/v1/account/home-orders", { auth: true })),
    enabled: !!customer && active,
    staleTime: 5_000,
    refetchInterval: active ? 10_000 : false,
    retry: false,
  });
  const items = orders.data?.data ?? [];
  const order = items[Math.min(index, Math.max(0, items.length - 1))];
  if (!customer || !order) return null;
  const pickup = order.fulfilment === "pickup";
  const labels = [
    "Confirmed",
    "In the kitchen",
    pickup ? "Ready to collect" : "Ready for dispatch",
    pickup ? "Collection" : "On the way",
    pickup ? "Collected" : "Delivered",
  ];
  const stage = Math.max(
    0,
    ["paid", "preparing", "ready", "out_for_delivery", "completed"].indexOf(
      order.status,
    ),
  );
  const delivered = order.status === "completed";
  const titles = [
    "Your celebration is booked.",
    "A little magic in the kitchen.",
    pickup ? "Ready when you are." : "Freshly finished. Ready to go.",
    "Your cake is on its way.",
    pickup ? "Collected. Let?s celebrate." : "Your celebration has arrived.",
  ];
  const subtitle = delivered
    ? "Everything arrived? Let us know below."
    : order.items
        ?.map((item) => item.name)
        .slice(0, 2)
        .join(" ? ") || "Follow every little milestone.";
  const open = () =>
    router.push({
      pathname: "/order/[reference]",
      params: { reference: order.reference },
    });
  async function acknowledge() {
    if (!order || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/v1/app-orders/${encodeURIComponent(order.reference)}/received`,
        {},
        { auth: true },
      );
      await cache.invalidateQueries({
        queryKey: ["app-orders", customer?.id, "home-milestones"],
      });
      setIndex(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <LinearGradient
      colors={
        delivered
          ? ["#193F36", "#28634B", "#367552"]
          : ["#32172D", "#76244F", "#B3246D"]
      }
      style={{
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 18,
        overflow: "hidden",
        marginVertical: 8,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${delivered ? "View order" : "Track order"}. ${labels[stage]}`}
        onPress={open}
        style={{ gap: 10, minHeight: 90 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.14)",
            }}
          >
            <Ionicons
              name={
                delivered
                  ? "checkmark-done-outline"
                  : stage === 3
                    ? "bicycle-outline"
                    : "gift-outline"
              }
              size={22}
              color="#FFFFFF"
            />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                color: "#F8D6E8",
                fontSize: 9,
                letterSpacing: 1.5,
                fontWeight: "700",
              }}
            >
              YOUR CAKE, EVERY STEP
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
              {labels[stage]}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </View>
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 20,
            lineHeight: 26,
            fontWeight: "800",
            letterSpacing: -0.3,
          }}
        >
          {titles[stage]}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: "#F7DFE8", fontSize: 12, lineHeight: 18 }}
        >
          {subtitle}
        </Text>
      </Pressable>
      <View
        style={{
          flexDirection: "row",
          gap: 5,
          marginTop: 14,
          marginBottom: 10,
        }}
      >
        {labels.map((label, step) => (
          <View
            key={label}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor:
                step <= stage ? "#FFFFFF" : "rgba(255,255,255,0.22)",
            }}
          />
        ))}
      </View>
      {delivered ? (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Button
            label="Received, thank you"
            loading={busy}
            disabled={busy}
            onPress={() => void acknowledge()}
            style={{
              flex: 2,
              paddingHorizontal: 10,
              backgroundColor: "#FFFFFF",
            }}
            variant="secondary"
          />
          <Button
            label="View order"
            onPress={open}
            variant="ghost"
            style={{
              flex: 1,
              paddingHorizontal: 6,
              backgroundColor: colors.surface,
            }}
          />
        </View>
      ) : null}
      {items.length > 1 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <Text style={{ color: "#F8D6E8", fontSize: 11 }}>
            Order {Math.min(index + 1, items.length)} of {items.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next order update"
            onPress={() => setIndex((index + 1) % items.length)}
            style={{ padding: 8 }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 12 }}>
              Next update ?
            </Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text style={{ color: "#FFFFFF", fontSize: 12, marginBottom: 12 }}>
          {error}
        </Text>
      ) : null}
      <OrderMilestoneMarquee labels={labels} stage={stage} active={active} />
    </LinearGradient>
  );
}
