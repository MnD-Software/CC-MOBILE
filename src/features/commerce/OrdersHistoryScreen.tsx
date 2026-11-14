import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";
import { Screen, Feedback, Notice, IconButton } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { appMedia } from "./app-media";
import { Skeleton } from "@/components/ui/Skeleton";
import { appOrders } from "./app-orders";
import { orderStageLabel } from "./ActiveOrderCard";
import { orderHistoryAction } from "./order-history";
import { OrderDateField } from "./OrderDateField";
import { money } from "./contracts";
import { useHomeOrders, useAcknowledgeOrder } from "./useHomeOrders";

type Filters = { from_date?: string; to_date?: string; cake?: string };
export function OrdersHistoryScreen() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const active = useScreenActive();
  const params = useLocalSearchParams<{ awaiting_receipt?: string }>();
  const [tab, setTab] = useState<"active" | "past">(
    params.awaiting_receipt === "1" ? "past" : "active",
  );
  const [awaitingReceipt, setAwaitingReceipt] = useState(
    params.awaiting_receipt === "1",
  );
  const homeOrders = useHomeOrders();
  const acknowledge = useAcknowledgeOrder();
  const awaitingCount = homeOrders.data?.awaiting_receipt_count ?? 0;
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] = useState<Filters>({});
  const [cake, setCake] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const orders = useInfiniteQuery({
    queryKey: [
      "app-orders",
      customer?.id,
      "history",
      tab,
      filters,
      awaitingReceipt,
    ],
    enabled: !!customer && active,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      appOrders.page(pageParam, {
        ...filters,
        scope: tab,
        awaiting_receipt: awaitingReceipt,
      }),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 10_000,
    refetchInterval:
      active && (tab === "active" || awaitingReceipt) ? 20_000 : false,
  });
  useEffect(() => setPageIndex(0), [tab, filters, awaitingReceipt]);
  const displayPage = Math.min(
    pageIndex,
    Math.max(0, (orders.data?.pages.length || 1) - 1),
  );
  const rows = orders.data?.pages[displayPage]?.data ?? [];
  const filtered = !!(
    awaitingReceipt ||
    filters.from_date ||
    filters.to_date ||
    filters.cake
  );
  function reset() {
    setFilters({});
    setCake("");
    setFrom("");
    setTo("");
    setError("");
    setAwaitingReceipt(false);
  }
  useEffect(() => {
    if (params.awaiting_receipt !== "1") return;
    reset();
    setTab("past");
    setAwaitingReceipt(true);
    router.setParams({ awaiting_receipt: undefined });
  }, [params.awaiting_receipt]);
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
          {awaitingCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${awaitingCount} orders awaiting receipt confirmation. View orders.`}
              onPress={() => {
                reset();
                setTab("past");
                setAwaitingReceipt(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: 18,
                backgroundColor: colors.successLight,
              }}
            >
              <Text
                style={{
                  color: colors.success,
                  fontSize: 24,
                  fontWeight: "800",
                }}
              >
                {awaitingCount}
              </Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: colors.success,
                    fontWeight: "800",
                    fontSize: 14,
                  }}
                >
                  Awaiting your confirmation
                </Text>
                <Text style={{ color: colors.ink, fontSize: 12 }}>
                  Delivered or collected. Tap to confirm receipt.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                color={colors.success}
                size={20}
              />
            </Pressable>
          ) : null}
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
                onPress={() => {
                  setTab(value);
                  setAwaitingReceipt(false);
                }}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    tab === value ? colors.action : "transparent",
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
            closeOnChange={filters}
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
              Order dates use local time. Leave a date blank for any time.
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
                  awaitingReceipt && "Awaiting receipt confirmation",
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
      {acknowledge.isError ? (
        <Notice error message={acknowledge.error.message} />
      ) : null}
      {!customer ? (
        <Button
          label="Sign in to view orders"
          onPress={() => router.push("/sign-in")}
        />
      ) : orders.isPending ? (
        <>
          <Skeleton height={170} radius={22} />
          <Skeleton height={170} radius={22} />
        </>
      ) : orders.isError ? (
        <Feedback error={orders.error} onRetry={() => void orders.refetch()} />
      ) : !rows.length ? (
        <Notice
          message={
            awaitingReceipt
              ? "No orders are awaiting receipt confirmation."
              : filtered
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
                  backgroundColor:
                    order.status === "completed"
                      ? colors.successLight
                      : colors.brandLight,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {order.items?.[0]?.image ? (
                  <LoadingImage
                    source={{ uri: appMedia(order.items[0].image) }}
                    contentFit="cover"
                    style={{ width: 42, height: 42, borderRadius: 14 }}
                  />
                ) : (
                  <Ionicons
                    name={
                      order.status === "completed"
                        ? "checkmark-circle-outline"
                        : tab === "past"
                          ? "receipt-outline"
                          : "gift-outline"
                    }
                    size={22}
                    color={
                      order.status === "completed"
                        ? colors.success
                        : colors.brandStrong
                    }
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color:
                      order.status === "completed"
                        ? colors.success
                        : colors.ink,
                    fontWeight: "800",
                    fontSize: 16,
                  }}
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
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Button
                variant={tab === "past" ? "outline" : "primary"}
                style={{ flex: 1, minWidth: 130 }}
                label={orderHistoryAction(order)}
                onPress={() =>
                  router.push({
                    pathname: "/order/[reference]",
                    params: { reference: order.reference },
                  })
                }
              />
              {awaitingReceipt ? (
                <Button
                  label="Received, thank you"
                  variant="secondary"
                  style={{ flex: 1, minWidth: 130 }}
                  disabled={acknowledge.isPending}
                  loading={
                    acknowledge.isPending &&
                    acknowledge.variables === order.reference
                  }
                  onPress={() =>
                    acknowledge.mutate(order.reference, {
                      onSuccess: () =>
                        router.push({
                          pathname: "/order/[reference]",
                          params: { reference: order.reference },
                        }),
                    })
                  }
                />
              ) : null}
            </View>
          </View>
        ))
      )}
      {customer && rows.length ? (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            label="Previous"
            size="sm"
            variant="outline"
            disabled={displayPage === 0}
            onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
          />
          <Text style={{ color: colors.muted }}>Page {displayPage + 1}</Text>
          <Button
            label="Next"
            size="sm"
            variant="outline"
            disabled={
              orders.isFetchingNextPage ||
              (displayPage >= (orders.data?.pages.length || 1) - 1 &&
                !orders.hasNextPage)
            }
            loading={orders.isFetchingNextPage}
            onPress={() => {
              if (displayPage < (orders.data?.pages.length || 1) - 1)
                setPageIndex((p) => p + 1);
              else
                void orders.fetchNextPage().then((result) => {
                  if ((result.data?.pages.length || 0) > displayPage + 1)
                    setPageIndex(displayPage + 1);
                });
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
