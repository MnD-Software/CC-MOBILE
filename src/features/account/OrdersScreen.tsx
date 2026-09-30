import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Feedback, Notice, Screen, useToast } from "@/components/ui/Commerce";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { parseOrderReceipt } from "@/features/commerce/order-receipt";
import { OrderActivityControl } from "@/native/OrderActivityControl";
import { useAuth } from "@/auth/AuthProvider";
import { money } from "@/features/commerce/contracts";
import {
  orderJourney,
  type OrderJourneyState,
} from "@/features/commerce/order-journey";
import { websiteCheckoutOwnerScope } from "@/features/commerce/website-checkout-session";
import {
  fetchWebsiteOrder,
  websiteCartTotal,
} from "@/features/commerce/website-checkout";
import {
  websiteOrderHistory,
  websiteOrderReceipt,
  saveRecoveredWebsiteOrder,
  type WebsiteOrderRecord,
} from "@/features/commerce/website-order-history";

const terminalStatuses = new Set([
  "completed",
  "cancelled",
  "canceled",
  "failed",
  "refunded",
]);

const date = (value: string) =>
  new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "pending":
      return "Awaiting payment";
    case "processing":
      return "Order confirmed";
    case "on-hold":
      return "Being reviewed";
    case "completed":
      return "Completed";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    case "failed":
      return "Payment unsuccessful";
    case "refunded":
      return "Refunded";
    default:
      return status.replace(/[-_]/g, " ");
  }
}

function statusMessage(status: string) {
  switch (status.toLowerCase()) {
    case "pending":
      return "Complete payment on Cake City's secure page to move your order forward.";
    case "processing":
      return "Cake City has your order and is preparing it for your celebration.";
    case "on-hold":
      return "Cake City is reviewing this order. Your official order page has the latest details.";
    case "completed":
      return "This Cake City order has been completed.";
    case "failed":
      return "Payment was not completed. Open your order update to try again.";
    case "cancelled":
    case "canceled":
      return "This order has been cancelled.";
    case "refunded":
      return "Cake City has marked this order as refunded.";
    default:
      return "This is the latest update received directly from Cake City.";
  }
}

function JourneyMark({ state }: { state: OrderJourneyState }) {
  const { colors } = useTheme();
  if (state === "complete") {
    return (
      <Ionicons name="checkmark-circle" size={24} color={colors.brandStrong} />
    );
  }
  if (state === "current") {
    return <Ionicons name="time" size={24} color={colors.accentStrong} />;
  }
  if (state === "blocked") {
    return <Ionicons name="alert-circle" size={24} color={colors.warning} />;
  }
  return (
    <Ionicons name="ellipse-outline" size={24} color={colors.borderStrong} />
  );
}

function OrderCard({
  record,
  ownerScope,
}: {
  record: WebsiteOrderRecord;
  ownerScope: string | null;
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const live = useQuery({
    queryKey: ["website-order", ownerScope, record.id, record.key],
    queryFn: () => fetchWebsiteOrder(record),
    enabled: !!record.billingEmail,
    staleTime: 15_000,
    refetchInterval: (query) =>
      terminalStatuses.has(query.state.data?.status ?? record.status)
        ? false
        : 30_000,
  });
  const status = live.data?.status ?? record.status;
  const itemCount = live.data?.items.reduce(
    (count, item) => count + item.quantity,
    0,
  );
  const total = live.data ? websiteCartTotal(live.data) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open order ${record.number}, ${statusLabel(status)}`}
      onPress={() =>
        router.push({
          pathname: "/order/[reference]",
          params: { reference: `website-${record.id}` },
        })
      }
      style={({ pressed }) => [styles.orderCard, pressed && styles.pressed]}
    >
      <View style={styles.orderTop}>
        <View style={styles.orderIdentity}>
          <Text style={styles.orderEyebrow}>ORDER {record.number}</Text>
          <Text style={styles.orderDate}>
            {record.source === "receipt" ? "Added " : ""}
            {date(record.createdAt)}
          </Text>
        </View>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusLabel(status)}</Text>
        </View>
      </View>
      <Text style={styles.orderTitle}>
        {itemCount
          ? `${itemCount} ${itemCount === 1 ? "item" : "items"} for your celebration`
          : "Your Cake City celebration order"}
      </Text>
      <View style={styles.orderFooter}>
        <Text style={styles.orderTotal}>
          {total === null ? "View latest total" : money(total)}
        </Text>
        <View style={styles.openOrder}>
          <Text style={styles.openOrderText}>Track order</Text>
          <Ionicons name="arrow-forward" size={17} color={colors.brandStrong} />
        </View>
      </View>
      {live.isError ? (
        <Text style={styles.savedUpdate}>Showing your last saved update</Text>
      ) : live.isFetching ? (
        <Text style={styles.savedUpdate}>Checking with Cake City...</Text>
      ) : null}
    </Pressable>
  );
}

function RecoverOrder({
  ownerScope,
  initialRecord,
}: {
  ownerScope: string | null;
  initialRecord?: WebsiteOrderRecord;
}) {
  const styles = useThemedStyles(baseStyles);
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(!!initialRecord);
  const [receipt, setReceipt] = useState(
    initialRecord ? websiteOrderReceipt(initialRecord) : "",
  );
  const [email, setEmail] = useState(initialRecord?.billingEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function recover() {
    if (busy || !ownerScope) return;
    setBusy(true);
    setError("");
    try {
      const access = parseOrderReceipt(receipt, email);
      const verified = await fetchWebsiteOrder(access);
      if (!active.current) return;
      const record = await saveRecoveredWebsiteOrder(
        access,
        verified,
        ownerScope,
        () => active.current,
      );
      if (!active.current || !record) return;
      await cache.invalidateQueries({
        queryKey: ["website-order-history", ownerScope],
      });
      await cache.invalidateQueries({
        queryKey: ["website-order", ownerScope, record.id],
      });
      if (!active.current) return;
      setReceipt("");
      setEmail("");
      setExpanded(false);
      router.push({
        pathname: "/order/[reference]",
        params: { reference: `website-${record.id}` },
      });
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to verify this order. Please try again.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }

  return (
    <View style={styles.recoveryCard}>
      <Text style={styles.detailCardTitle}>
        {initialRecord ? "Reconnect live tracking" : "Missing an order?"}
      </Text>
      <Text style={styles.recoveryHint}>
        Use your official receipt link and the billing email. Cake City verifies
        the order before it appears here.
      </Text>
      {!ownerScope ? (
        <Button
          variant="outline"
          label="Sign in to save order tracking"
          onPress={() => router.push("/sign-in")}
        />
      ) : !expanded ? (
        <Button
          variant="outline"
          label="Add an order from a receipt"
          onPress={() => setExpanded(true)}
        />
      ) : (
        <>
          <Input
            label="Cake City receipt link"
            value={receipt}
            onChangeText={setReceipt}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://cakecity.co.ke/checkout/order-received/..."
          />
          <Input
            label="Order billing email"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="Email used at checkout"
          />
          {error ? <Notice error message={error} /> : null}
          <Button
            label="Verify and track order"
            loading={busy}
            disabled={busy || !receipt.trim() || !email.trim()}
            onPress={() => void recover()}
          />
          <Text style={styles.recoveryHint}>
            Your receipt link is private. It is stored securely for this
            signed-in account on this device.
          </Text>
        </>
      )}
    </View>
  );
}

export function OrdersScreen() {
  const styles = useThemedStyles(baseStyles);
  const cache = useQueryClient();
  const { customer } = useAuth();
  const ownerScope = websiteCheckoutOwnerScope(customer?.id);
  const history = useQuery({
    queryKey: ["website-order-history", ownerScope],
    queryFn: () => websiteOrderHistory(ownerScope),
    staleTime: 5_000,
  });

  return (
    <Screen
      title="Your orders"
      subtitle="Real updates from Cake City, all in one place."
    >
      {history.isPending ? (
        <Feedback loading />
      ) : history.isError ? (
        <Feedback
          error={history.error}
          onRetry={() => void history.refetch()}
        />
      ) : !history.data?.length ? (
        <>
          <Feedback empty="Orders you place from this app will appear here." />
          <Button
            label="Find your cake"
            onPress={() => router.push("/(tabs)/shop")}
          />
          <Button
            variant="outline"
            label="Open Cake City account orders"
            onPress={() =>
              void Linking.openURL("https://cakecity.co.ke/my-account/orders/")
            }
          />
        </>
      ) : (
        <>
          <View style={styles.trackingHero}>
            <View style={styles.trackingIcon}>
              <Ionicons name="location" size={23} color="#FFFFFF" />
            </View>
            <View style={styles.trackingCopy}>
              <Text style={styles.trackingEyebrow}>LIVE ORDER UPDATES</Text>
              <Text style={styles.trackingTitle}>
                Your saved order updates.
              </Text>
              <Text style={styles.trackingText}>
                Active orders refresh automatically while this screen is open.
              </Text>
            </View>
          </View>
          <View style={styles.orderList}>
            {history.data.map((record) => (
              <OrderCard
                key={record.id}
                record={record}
                ownerScope={ownerScope}
              />
            ))}
          </View>
          <Button
            variant="outline"
            label="Refresh every order"
            onPress={() => {
              void cache.invalidateQueries({
                queryKey: ["website-order", ownerScope],
              });
              void history.refetch();
            }}
          />
          <Notice message="For your privacy, orders started in the app are kept securely on this device. Your official Cake City order page remains the final record." />
        </>
      )}
      <RecoverOrder key={ownerScope ?? "guest"} ownerScope={ownerScope} />
    </Screen>
  );
}

export function OrderScreen() {
  const styles = useThemedStyles(baseStyles);
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const toast = useToast();
  const { customer } = useAuth();
  const ownerScope = websiteCheckoutOwnerScope(customer?.id);
  const orderId = Number(reference?.replace(/^website-/, ""));
  const history = useQuery({
    queryKey: ["website-order-history", ownerScope],
    queryFn: () => websiteOrderHistory(ownerScope),
  });
  const record = history.data?.find((item) => item.id === orderId);
  const live = useQuery({
    queryKey: ["website-order", ownerScope, record?.id, record?.key],
    queryFn: () => {
      if (!record) throw new Error("This order is not saved on this device.");
      return fetchWebsiteOrder(record);
    },
    enabled: !!record?.billingEmail,
    staleTime: 10_000,
    refetchInterval: (query) =>
      terminalStatuses.has(query.state.data?.status ?? record?.status ?? "")
        ? false
        : 30_000,
  });

  if (history.isPending)
    return (
      <Screen title="Order update" back>
        <Feedback loading />
      </Screen>
    );

  if (!record)
    return (
      <Screen title="Order update" back>
        <Feedback empty="This order is not saved on this device." />
        <RecoverOrder key={ownerScope ?? "guest"} ownerScope={ownerScope} />
        <Button
          label="View your Cake City account"
          onPress={() =>
            void Linking.openURL("https://cakecity.co.ke/my-account/orders/")
          }
        />
      </Screen>
    );

  const status = live.data?.status ?? record.status;
  const total = live.data ? websiteCartTotal(live.data) : null;
  const steps = orderJourney(status);

  return (
    <Screen
      title={`Order ${record.number}`}
      subtitle="Your latest Cake City update."
      back
    >
      <View style={styles.detailHero}>
        <Text style={styles.detailEyebrow}>CURRENT STATUS</Text>
        <Text style={styles.detailStatus}>{statusLabel(status)}</Text>
        <Text style={styles.detailMessage}>{statusMessage(status)}</Text>
      </View>

      <View
        accessibilityLabel={`Order journey. ${steps
          .map((step) => `${step.label}: ${step.state}`)
          .join(", ")}`}
        style={styles.timeline}
      >
        {steps.map((step, index) => (
          <View key={step.label} style={styles.timelineRow}>
            <View style={styles.timelineMarkColumn}>
              <JourneyMark state={step.state} />
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.timelineLine,
                    step.state === "complete" && styles.timelineLineDone,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text
                style={[
                  styles.timelineLabel,
                  step.state === "upcoming" && styles.timelineLabelWaiting,
                  step.state === "current" && styles.timelineLabelCurrent,
                  step.state === "blocked" && styles.timelineLabelBlocked,
                ]}
              >
                {step.label}
              </Text>
              {step.state === "current" ? (
                <Text style={styles.timelineCurrentCaption}>
                  Latest update from Cake City
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {live.data?.items.length ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Your order</Text>
          {live.data.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemName}>
                {item.quantity} × {item.name}
              </Text>
            </View>
          ))}
          {total !== null ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Cake City total</Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {live.isError ? (
        <Notice
          error
          message={
            live.error instanceof Error
              ? live.error.message
              : "Your live order update is unavailable right now."
          }
        />
      ) : null}
      {!record.billingEmail || live.isError ? (
        <RecoverOrder
          key={`${ownerScope}:${record.id}`}
          ownerScope={ownerScope}
          initialRecord={record}
        />
      ) : null}
      <OrderActivityControl
        key={`${ownerScope}:${record.id}`}
        snapshot={
          live.data && !live.isError
            ? {
                id: record.id,
                number: record.number,
                status: live.data.status,
                checkedAt: live.dataUpdatedAt,
              }
            : null
        }
      />
      <Text style={styles.lastChecked}>
        {record.source === "receipt" ? "Added to tracking" : "Ordered"}{" "}
        {date(record.createdAt)}
        {live.isFetching ? " · Checking for an update..." : ""}
      </Text>
      <Button
        label="Refresh tracking"
        loading={live.isFetching}
        disabled={!record.billingEmail || live.isFetching}
        onPress={() => void live.refetch()}
      />
      <Button
        variant="outline"
        label="Open official order update"
        onPress={() =>
          void Linking.openURL(websiteOrderReceipt(record)).catch(() =>
            toast("Your Cake City order page could not be opened."),
          )
        }
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  recoveryCard: {
    padding: 18,
    gap: 12,
    borderRadius: 26,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  recoveryHint: { color: tokens.color.muted, fontSize: 12, lineHeight: 18 },
  trackingHero: {
    minHeight: 148,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 19,
    borderRadius: 26,
    backgroundColor: tokens.color.cocoa,
    ...tokens.shadow.floating,
  },
  trackingIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  trackingCopy: { flex: 1, gap: 4 },
  trackingEyebrow: {
    color: "#FBD8EB",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  trackingTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  trackingText: { color: "#F6EDE9", fontSize: 11.5, lineHeight: 17 },
  orderList: { gap: 13 },
  orderCard: {
    gap: 13,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  orderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  orderIdentity: { flex: 1, gap: 2 },
  orderEyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  orderDate: { color: tokens.color.muted, fontSize: 10.5 },
  statusPill: {
    minHeight: 29,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: tokens.color.successLight,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.success,
  },
  statusText: {
    color: tokens.color.success,
    fontSize: 10,
    fontWeight: "900",
  },
  orderTitle: {
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  orderFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  orderTotal: {
    color: tokens.color.cocoa,
    fontSize: 13,
    fontWeight: "800",
  },
  openOrder: { flexDirection: "row", alignItems: "center", gap: 5 },
  openOrderText: {
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    fontWeight: "900",
  },
  savedUpdate: { color: tokens.color.muted, fontSize: 10.5 },
  detailHero: {
    gap: 7,
    padding: 21,
    borderRadius: 26,
    backgroundColor: tokens.color.brandStrong,
    ...tokens.shadow.floating,
  },
  detailEyebrow: {
    color: "#FFE1F2",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  detailStatus: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
  },
  detailMessage: { color: "#FFF0F8", fontSize: 12.5, lineHeight: 19 },
  timeline: {
    padding: 17,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  timelineRow: { minHeight: 56, flexDirection: "row", gap: 12 },
  timelineMarkColumn: { width: 26, alignItems: "center" },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 3,
    backgroundColor: tokens.color.border,
  },
  timelineLineDone: { backgroundColor: tokens.color.brandStrong },
  timelineCopy: { flex: 1, gap: 2 },
  timelineLabel: {
    paddingTop: 2,
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  timelineLabelWaiting: { color: tokens.color.muted, fontWeight: "600" },
  timelineLabelCurrent: { color: tokens.color.accentStrong },
  timelineLabelBlocked: { color: tokens.color.warning },
  timelineCurrentCaption: {
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  detailCard: {
    gap: 11,
    padding: 17,
    borderRadius: 22,
    backgroundColor: tokens.color.surfaceTint,
  },
  detailCardTitle: {
    color: tokens.color.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  itemRow: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  itemName: { color: tokens.color.ink, fontSize: 12.5, lineHeight: 18 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  totalLabel: { color: tokens.color.cocoa, fontSize: 13, fontWeight: "800" },
  totalValue: {
    color: tokens.color.brandStrong,
    fontSize: 17,
    fontWeight: "900",
  },
  lastChecked: { color: tokens.color.muted, fontSize: 11.5, lineHeight: 17 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
