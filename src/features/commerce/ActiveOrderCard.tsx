import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";
import { appOrders } from "./app-orders";

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
  const orders = useQuery({
    queryKey: ["app-orders", customer?.id],
    queryFn: appOrders.list,
    enabled: !!customer && active,
    staleTime: 15_000,
    refetchInterval: active ? 30_000 : false,
    retry: false,
  });
  if (!customer) return null;
  const order = orders.data?.data.find(
    (item) =>
      ![
        "completed",
        "cancelled",
        "payment_failed",
        "failed",
        "reversed",
      ].includes(item.status),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        order ? `Track order. ${orderStageLabel(order.status)}` : "Your orders"
      }
      onPress={() =>
        order
          ? router.push({
              pathname: "/order/[reference]",
              params: { reference: order.reference },
            })
          : router.push("/orders")
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <Ionicons
        name={order ? "bag-check-outline" : "receipt-outline"}
        color={colors.brandStrong}
        size={22}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 13 }}>
          {order ? orderStageLabel(order.status) : "Your orders"}
        </Text>
        {order ? (
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Follow your cake from kitchen to doorstep
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}
