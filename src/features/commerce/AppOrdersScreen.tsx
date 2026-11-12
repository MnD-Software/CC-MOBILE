import { OrderJourney } from "./OrderJourney";
import { useScreenActive } from "@/design/useScreenActive";
import { useTheme } from "@/theme/ThemeProvider";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen, IconButton } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { usePaymentSuccess } from "./usePaymentSuccess";
import { PaymentConfetti } from "./PaymentConfetti";
import { isVerifiedPayment } from "./checkout-success";
import { Disclosure } from "@/components/ui/Disclosure";
import { appOrders } from "./app-orders";
import { isPastOrder } from "./order-history";
import { InAppPayment } from "./InAppPayment";
import { money } from "./contracts";
import { api } from "@/api/client";
import { appOrderSchema } from "./app-orders";
import { appReceiptHtml } from "./app-receipt";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { DeliveryComplete } from "./DeliveryComplete";

export { OrdersHistoryScreen as AppOrdersScreen } from "./OrdersHistoryScreen";

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
        : query.state.data?.status === "out_for_delivery" ||
            query.state.data?.status === "ready"
          ? 5_000
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
    <Screen
      title={value && isPastOrder(value) ? "Order details" : "Track your cake"}
      back
      right={
        <IconButton
          name="notifications-outline"
          label="Order notifications"
          onPress={() => router.push("/notifications")}
        />
      }
    >
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
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
              Preview · no charge. Follow your order through the kitchen and
              delivery.
            </Text>
          ) : null}
          {isPastOrder(value) ? (
            <Disclosure title="Preparation & delivery history">
              <OrderJourney
                order={value}
                refresh={() => void order.refetch()}
                refreshing={order.isFetching}
              />
            </Disclosure>
          ) : (
            <OrderJourney
              order={value}
              refresh={() => void order.refetch()}
              refreshing={order.isFetching}
            />
          )}
          <DeliveryComplete key={value.reference} order={value} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {money(value.total_minor / 100)}
            {value.payment_test ? " · Preview · no charge" : ""}
          </Text>
          <Disclosure title="Order details & receipt">
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
          </Disclosure>
          {error ? <Notice error message={error} /> : null}
          {!value.payment_test &&
          ["not_started", "pending"].includes(value.payment_state) ? (
            <Button
              label="Pay inside the app"
              disabled={busy}
              onPress={() => void pay()}
            />
          ) : null}
          {!value.paid_at && !value.payment_test ? (
            <Button
              variant="outline"
              label="Check payment status"
              disabled={busy}
              onPress={() => void verify()}
            />
          ) : null}
          <Button
            variant="outline"
            label="Get order support"
            onPress={() =>
              router.push({
                pathname: "/requests",
                params: { kind: "support", reference: value.reference },
              })
            }
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
