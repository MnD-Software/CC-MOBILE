import { Ionicons } from "@expo/vector-icons";
import { useScreenActive } from "@/design/useScreenActive";
import { useTheme } from "@/theme/ThemeProvider";
import { orderStageLabel } from "./ActiveOrderCard";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { usePaymentSuccess } from "./usePaymentSuccess";
import { PaymentConfetti } from "./PaymentConfetti";
import { isVerifiedPayment } from "./checkout-success";
import { orderTracking } from "./order-tracking";
import { appOrders } from "./app-orders";
import { InAppPayment } from "./InAppPayment";
import { money } from "./contracts";
import { api } from "@/api/client";
import { appOrderSchema } from "./app-orders";
import { appReceiptHtml } from "./app-receipt";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { DeliveryComplete } from "./DeliveryComplete";

export function AppOrdersScreen() {
  const { customer } = useAuth();
  const active = useScreenActive();
  const { colors } = useTheme();
  const orders = useInfiniteQuery({
    queryKey: ["app-orders", customer?.id, "history"],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => appOrders.page(pageParam),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: active ? 20_000 : false,
    staleTime: 10_000,
    enabled: !!customer && active,
  });
  return (
    <Screen
      title="Your orders"
      subtitle="From our kitchen to your celebration."
      back
    >
      <Button
        variant="ghost"
        label="Order notifications"
        onPress={() => router.push("/notifications")}
      />
      {!customer ? (
        <Button
          label="Sign in to view orders"
          onPress={() => router.push("/sign-in")}
        />
      ) : orders.isPending ? (
        <Feedback loading />
      ) : orders.isError ? (
        <Feedback error={orders.error} onRetry={() => void orders.refetch()} />
      ) : !orders.data?.pages.flatMap((page) => page.data).length ? (
        <Notice message="Orders you place in the app will appear here." />
      ) : (
        orders.data.pages
          .flatMap((page) => page.data)
          .map((order) => (
            <View
              key={order.reference}
              style={{
                padding: 20,
                gap: 12,
                borderRadius: 22,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.brandStrong,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              >
                {orderStageLabel(order.status)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {order.reference}
              </Text>
              <Text>
                {order.status.replaceAll("_", " ")} ·{" "}
                {money(order.total_minor / 100)}
              </Text>
              <Button
                variant="outline"
                label="Track order"
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
      {orders.hasNextPage ? (
        <Button
          label="Load earlier orders"
          variant="outline"
          loading={orders.isFetchingNextPage}
          onPress={() => void orders.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}

export function AppOrderScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { customer } = useAuth();
  const active = useScreenActive();
  const { colors } = useTheme();
  const [payment, setPayment] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const order = useQuery({
    queryKey: ["app-order", customer?.id, reference],
    queryFn: () => appOrders.detail(reference),
    refetchInterval: (query) =>
      !active ||
      ["completed", "cancelled", "failed", "reversed"].includes(
        query.state.data?.status || "",
      )
        ? false
        : 15_000,
    enabled: !!customer && active && reference?.startsWith("APP-"),
  });
  const { celebrate, endCelebration } = usePaymentSuccess(
    order.data,
    customer?.id || "",
    setError,
  );
  useEffect(() => {
    if (order.data && isVerifiedPayment(order.data)) setPayment(null);
  }, [order.data?.payment_state, order.data?.paid_at]);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await appOrders.verify(reference);
      await order.refetch();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment confirmation is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const result = await appOrders.start(reference);
      if (result.payment_url) setPayment(result.payment_url);
      else await verify();
      await order.refetch();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Check this existing order before paying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const value = order.data;
  async function shareReceipt() {
    setBusy(true);
    setError("");
    try {
      const receipt = appOrderSchema.parse(
        await api.get(
          `/v1/app-orders/${encodeURIComponent(reference)}/receipt`,
          { auth: true },
        ),
      );
      const pdf = await Print.printToFileAsync({
        html: appReceiptHtml(receipt),
      });
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(pdf.uri, {
          mimeType: "application/pdf",
          dialogTitle: `Receipt ${reference}`,
        });
      else
        setError(
          "Receipt sharing is unavailable on this device. Your receipt remains visible here.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The receipt could not be exported.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Track your cake" back>
      <Button
        variant="ghost"
        label="Order notifications"
        onPress={() => router.push("/notifications")}
      />
      {!customer ? (
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      ) : !reference?.startsWith("APP-") ? (
        <Notice message="This is a legacy website order. App orders have an APP reference. Contact support here for help with an older receipt." />
      ) : order.isPending ? (
        <Feedback loading />
      ) : order.isError ? (
        <Feedback error={order.error} onRetry={() => void order.refetch()} />
      ) : value ? (
        <>
          {value.payment_test ? (
            <Notice message="SIMULATED TEST: no Pesapal payment or real charge. This order tests kitchen and delivery tracking. KES 100 qualifying value was assigned to your normal Club by the test rule." />
          ) : null}
          <Text>{value.reference}</Text>
          <Text
            style={{
              color: colors.brandStrong,
              fontSize: 25,
              fontWeight: "800",
            }}
          >
            {orderStageLabel(value.status)}
          </Text>
          <DeliveryComplete key={value.reference} order={value} />
          <Text>
            {money(value.total_minor / 100)} ·{" "}
            {value.payment_test
              ? "SIMULATED TEST - no money charged"
              : value.environment === "sandbox"
                ? "Sandbox"
                : "App sale"}
          </Text>
          <View
            style={{
              padding: 20,
              gap: 14,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text
              style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}
            >
              Your cake's journey
            </Text>
            <Text>
              Made to order. Progress updates appear here as our team prepares
              your celebration.
            </Text>
            {value.snapshot?.route ? (
              <>
                <Text>Prepared at {value.snapshot.route.origin_name}</Text>
                <Text>
                  {value.snapshot.route.destination_name}
                  {value.snapshot.route.destination_address
                    ? `: ${value.snapshot.route.destination_address}`
                    : `: ${value.snapshot.route.destination.latitude.toFixed(5)}, ${value.snapshot.route.destination.longitude.toFixed(5)}`}
                </Text>
                <Text>
                  {value.snapshot.route.distance_meters / 1000} km by road.{" "}
                  {value.snapshot.route.rate}. Transport:{" "}
                  {money(value.snapshot.route.fee_minor / 100)}.
                </Text>
              </>
            ) : null}
            {value.dispatch ? (
              <Text>
                Delivery contact: {value.dispatch.rider_name} ·{" "}
                {value.dispatch.rider_phone}
              </Text>
            ) : null}
            {value.deliveries?.map((delivery, index) => (
              <View key={delivery.id} style={{ gap: 4 }}>
                <Text>
                  Delivery {index + 1}: {delivery.status.replaceAll("_", " ")}
                </Text>
                {delivery.scheduled_at ? (
                  <Text>
                    {new Date(delivery.scheduled_at).toLocaleString()}
                    {delivery.slot ? ` · ${delivery.slot}` : ""}
                  </Text>
                ) : null}
              </View>
            ))}
            {orderTracking(value).map((step, index, steps) => (
              <View
                key={step.label}
                style={{ flexDirection: "row", gap: 14, minHeight: 52 }}
              >
                <View style={{ alignItems: "center", width: 24 }}>
                  <Ionicons
                    name={step.at ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={step.at ? colors.brandStrong : colors.muted}
                  />
                  {index < steps.length - 1 ? (
                    <View
                      style={{
                        width: 1,
                        flex: 1,
                        minHeight: 18,
                        backgroundColor: colors.border,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 4, paddingBottom: 14 }}>
                  <Text
                    style={{
                      color: step.at ? colors.ink : colors.muted,
                      fontWeight: step.at ? "700" : "400",
                      fontSize: 14,
                    }}
                  >
                    {step.label}
                  </Text>
                  {step.at ? (
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {new Date(step.at).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {value.payment_state !== "completed" ? (
              <Notice
                message={`Payment status: ${value.payment_state.replaceAll("_", " ")}. Preparation starts after verified payment.`}
              />
            ) : null}
            {value.snapshot?.checkout.fulfilment === "pickup" &&
            typeof value.snapshot.pickup_instructions === "string" ? (
              <Text>{value.snapshot.pickup_instructions}</Text>
            ) : null}
            <Button
              variant="outline"
              label="Refresh tracking"
              onPress={() => void order.refetch()}
            />
          </View>
          {value.snapshot?.lines.map((line, i) => (
            <Text key={i}>
              {line.quantity} × {line.name} — {money(line.line_minor / 100)}
              {Array.isArray(line.selection.variation_attributes)
                ? line.selection.variation_attributes
                    .map(
                      (a: { attribute: string; value: string }) =>
                        ` / ${a.attribute}: ${a.value}`,
                    )
                    .join("")
                : ""}
            </Text>
          ))}
          {value.paid_at ? (
            <Notice
              message={`${value.payment_test ? "SIMULATED TEST receipt (no charge)" : "Payment receipt"}: RCPT-${value.reference}. ${value.payment_test ? "Confirmed" : "Paid"} ${new Date(value.paid_at).toLocaleString()}. ${value.payment_state === "reversed" ? "Payment reversed; contact support." : ""} This is not an eTIMS tax invoice.`}
            />
          ) : null}
          {value.paid_at ? (
            <Button
              variant="outline"
              label="Share receipt PDF"
              disabled={busy}
              onPress={() => void shareReceipt()}
            />
          ) : null}
          {error ? <Notice error message={error} /> : null}
          {!value.payment_test &&
          ["not_started", "pending"].includes(value.payment_state) ? (
            <Button
              label="Pay inside the app"
              disabled={busy}
              onPress={() => void pay()}
            />
          ) : null}
          <Button
            variant="outline"
            label="Check payment status"
            disabled={busy}
            onPress={() => void verify()}
          />
          <Button
            variant="outline"
            label="Get order support"
            onPress={() => router.push("/requests")}
          />
        </>
      ) : null}
      {celebrate ? <PaymentConfetti onComplete={endCelebration} /> : null}
      {payment ? (
        <InAppPayment
          url={payment}
          onClose={() => {
            setPayment(null);
            void verify();
          }}
        />
      ) : null}
    </Screen>
  );
}
