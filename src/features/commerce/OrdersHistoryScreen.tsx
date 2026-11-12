import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";
import { Screen, Feedback, Notice, IconButton } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { appOrders } from "./app-orders";
import { orderStageLabel } from "./ActiveOrderCard";
import { orderHistoryAction } from "./order-history";
import { OrderDateField } from "./OrderDateField";
import { money } from "./contracts";

type Filters = { from_date?: string; to_date?: string; cake?: string };
export function OrdersHistoryScreen() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const active = useScreenActive();
  const [tab, setTab] = useState<"active" | "past">("active");
  const [filters, setFilters] = useState<Filters>({});
  const [cake, setCake] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const orders = useInfiniteQuery({
    queryKey: ["app-orders", customer?.id, "history", tab, filters],
    enabled: !!customer && active,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      appOrders.page(pageParam, { ...filters, scope: tab }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 10_000,
    refetchInterval: active && tab === "active" ? 20_000 : false,
  });
  const rows = orders.data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = !!(filters.from_date || filters.to_date || filters.cake);
  function reset() {
    setFilters({});
    setCake("");
    setFrom("");
    setTo("");
    setError("");
  }
  return (
    <Screen
      title="Your orders"
      subtitle="Every celebration, easy to find."
      back
      right={
        <IconButton
          name="notifications-outline"
          label="Order notifications"
          onPress={() => router.push("/notifications")}
        />
      }
    >
      <LinearGradient
        colors={["#32172D", "#672445", "#9E245F"]}
        style={{ padding: 22, borderRadius: 26, gap: 12 }}
      >
        <Text
          style={{
            color: "#F6C9DC",
            fontSize: 10,
            letterSpacing: 1.5,
            fontWeight: "700",
          }}
        >
          BAKED INTO YOUR STORY
        </Text>
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 26,
            lineHeight: 32,
            fontWeight: "700",
          }}
        >
          {tab === "active" ? "Your next celebration." : "Good moments, saved."}
        </Text>
        <Text style={{ color: "#F7DFE8", fontSize: 13, lineHeight: 20 }}>
          {tab === "active"
            ? "Follow current orders from our kitchen to your door."
            : "Find your cakes, receipts and previous celebrations."}
        </Text>
      </LinearGradient>
      {customer ? (
        <>
          <View
            accessibilityRole="tablist"
            accessibilityLabel="Order history"
            style={{
              flexDirection: "row",
              backgroundColor: colors.surfaceRaised,
              padding: 5,
              borderRadius: 18,
              gap: 6,
            }}
          >
            {(["active", "past"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityLabel={
                  value === "active" ? "Active orders" : "Past orders"
                }
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    tab === value ? colors.brandStrong : "transparent",
                }}
              >
                <Text
                  style={{
                    color: tab === value ? "#FFFFFF" : colors.ink,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {value === "active" ? "Active" : "Past orders"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Disclosure
            title={
              filtered ? "Filters applied · change" : "Filter by date or cake"
            }
          >
            <Input
              label="Cake or product name"
              placeholder="e.g. chocolate, vanilla, cupcakes"
              value={cake}
              onChangeText={setCake}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <OrderDateField label="From" value={from} onChange={setFrom} />
              <OrderDateField label="To" value={to} onChange={setTo} />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              Order dates use Kenyan time. Leave a date blank for any time.
            </Text>
            {error ? <Notice error message={error} /> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                label="Apply filters"
                style={{ flex: 1, paddingHorizontal: 12 }}
                onPress={() => {
                  if (from && to && from > to) {
                    setError("Choose an end date on or after the start date.");
                    return;
                  }
                  setError("");
                  setFilters({
                    from_date: from || undefined,
                    to_date: to || undefined,
                    cake: cake.trim() || undefined,
                  });
                }}
              />
              <Button
                label="Reset"
                variant="outline"
                style={{ flex: 1 }}
                onPress={reset}
              />
            </View>
          </Disclosure>
          {filtered ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>
                {[
                  filters.cake,
                  filters.from_date && `From ${filters.from_date}`,
                  filters.to_date && `To ${filters.to_date}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Button label="Clear" variant="ghost" size="sm" onPress={reset} />
            </View>
          ) : null}
        </>
      ) : null}
      {!customer ? (
        <Button
          label="Sign in to view orders"
          onPress={() => router.push("/sign-in")}
        />
      ) : orders.isPending ? (
        <Feedback loading />
      ) : orders.isError ? (
        <Feedback error={orders.error} onRetry={() => void orders.refetch()} />
      ) : !rows.length ? (
        <Notice
          message={
            filtered
              ? "No orders match these filters. Try another date or cake."
              : tab === "active"
                ? "No active orders. Your completed celebrations are in Past orders."
                : "Your completed and closed orders will appear here."
          }
        />
      ) : (
        rows.map((order) => (
          <View
            key={order.reference}
            testID={`order-card-${order.reference}`}
            style={{
              padding: 18,
              borderRadius: 22,
              gap: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: colors.brandLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={tab === "past" ? "receipt-outline" : "gift-outline"}
                  size={22}
                  color={colors.brandStrong}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}
                >
                  {orderStageLabel(order.status)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(order.created_at).toLocaleDateString("en-KE", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    timeZone: "Africa/Nairobi",
                  })}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.brandStrong,
                  fontWeight: "800",
                  fontSize: 15,
                }}
              >
                {money(order.total_minor / 100)}
              </Text>
            </View>
            {order.items?.slice(0, 3).map((item, index) => (
              <Text
                key={index}
                style={{ color: colors.ink, fontSize: 14, lineHeight: 21 }}
              >
                {item.quantity} × {item.name}
                {item.size ? ` · ${item.size}` : ""}
              </Text>
            ))}
            {(order.items?.length ?? 0) > 3 ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                +{order.items!.length - 3} more items
              </Text>
            ) : null}
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {order.reference}
            </Text>
            <Button
              variant={tab === "past" ? "outline" : "primary"}
              label={orderHistoryAction(order)}
              onPress={() =>
                router.push({
                  pathname: "/order/[reference]",
                  params: { reference: order.reference },
                })
              }
            />
          </View>
        ))
      )}
      {orders.hasNextPage && customer ? (
        <Button
          label={tab === "past" ? "More past orders" : "More active orders"}
          variant="outline"
          loading={orders.isFetchingNextPage}
          onPress={() => void orders.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}
