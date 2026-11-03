import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { appOrders } from "./app-orders";
import { InAppPayment } from "./InAppPayment";
import { money } from "./contracts";
import { api } from "@/api/client";
import { appOrderSchema } from "./app-orders";
import { appReceiptHtml } from "./app-receipt";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export function AppOrdersScreen() {
  const { customer } = useAuth();
  const orders = useQuery({
    queryKey: ["app-orders", customer?.id],
    queryFn: appOrders.list,
    enabled: !!customer,
  });
  return (
    <Screen
      title="Your app orders"
      subtitle="App order numbers, payments and receipts."
      back
    >
      {!customer ? (
        <Button
          label="Sign in to view orders"
          onPress={() => router.push("/sign-in")}
        />
      ) : orders.isPending ? (
        <Feedback loading />
      ) : orders.isError ? (
        <Feedback error={orders.error} onRetry={() => void orders.refetch()} />
      ) : !orders.data?.data.length ? (
        <Notice message="Orders you place in the app will appear here." />
      ) : (
        orders.data.data.map((order) => (
          <View key={order.reference} style={{ padding: 16, gap: 8 }}>
            <Text>{order.reference}</Text>
            <Text>
              {order.status.replaceAll("_", " ")} ·{" "}
              {money(order.total_minor / 100)}
            </Text>
            <Button
              variant="outline"
              label="View order and receipt"
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
    </Screen>
  );
}

export function AppOrderScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { customer } = useAuth();
  const [payment, setPayment] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const order = useQuery({
    queryKey: ["app-order", customer?.id, reference],
    queryFn: () => appOrders.detail(reference),
    enabled: !!customer && reference?.startsWith("APP-"),
  });
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
    <Screen title="App order" back>
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
          <Text>{value.reference}</Text>
          <Text>{value.status.replaceAll("_", " ")}</Text>
          <Text>
            {money(value.total_minor / 100)} ·{" "}
            {value.environment === "sandbox" ? "Sandbox" : "App sale"}
          </Text>
          {value.snapshot?.lines.map((line, i) => (
            <Text key={i}>
              {line.quantity} × {line.name} — {money(line.line_minor / 100)}
            </Text>
          ))}
          {value.paid_at ? (
            <Notice
              message={`Payment receipt: RCPT-${value.reference}. Paid ${new Date(value.paid_at).toLocaleString()}. ${value.payment_state === "reversed" ? "Payment reversed; contact support." : ""} This is not an eTIMS tax invoice.`}
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
          {["not_started", "pending"].includes(value.payment_state) ? (
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
