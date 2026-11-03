import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import { Button } from "@/components/ui/Button";
import {
  Feedback,
  Notice,
  Screen,
  ui as baseUi,
} from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { money } from "@/features/commerce/contracts";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { purchaseTest, purchaseTestOrigin } from "./client";
import { purchaseName } from "./model";
import { receiptHtml, receiptText } from "./receipt";
import { usePurchasePreview } from "./usePurchasePreview";

export function PurchaseOrders() {
  const query = usePurchasePreview();
  const { colors } = useTheme();
  const ui = useThemedStyles(baseUi);
  return (
    <Screen
      title="Your orders"
      subtitle="Your purchases and receipts, all in one place."
    >
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {!query.isPending && !query.isError && !query.data?.history.length ? (
        <>
          <Feedback empty="Your purchases will appear here once payment is confirmed." />
          <Button
            label="Browse treats"
            onPress={() => router.push("/checkout")}
          />
        </>
      ) : null}
      {query.data?.history.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={`Open purchase ${row.id.slice(-6)}`}
          disabled={row.status !== "succeeded"}
          onPress={() =>
            router.push({
              pathname: "/order/[reference]",
              params: { reference: row.id },
            })
          }
          style={ui.panel}
        >
          <View style={ui.spread}>
            <Text style={ui.heading}>
              {row.items.map((item) => purchaseName(item.name)).join(", ")}
            </Text>
            <Ionicons
              name={
                row.status === "succeeded"
                  ? "checkmark-circle-outline"
                  : "time-outline"
              }
              size={24}
              color={colors.brandStrong}
            />
          </View>
          <Text style={ui.body}>
            {new Date(row.created_at).toLocaleString()}
          </Text>
          <View style={ui.spread}>
            <Text style={ui.heading}>{money(row.amount_minor / 100)}</Text>
            <Text style={{ color: colors.muted }}>
              {row.status === "succeeded"
                ? row.refunded_minor
                  ? "Refund adjusted"
                  : "Paid"
                : row.status.replaceAll("_", " ")}
            </Text>
          </View>
          {row.status === "succeeded" ? (
            <Text style={{ color: colors.brandStrong, fontSize: 13 }}>
              View receipt
            </Text>
          ) : null}
        </Pressable>
      ))}
    </Screen>
  );
}

export function PurchaseReceipt({ reference }: { reference: string }) {
  const query = useQuery({
    queryKey: ["purchase-receipt", purchaseTestOrigin(), reference],
    queryFn: () => purchaseTest.receipt(reference),
    retry: false,
  });
  const receipt = query.data;
  const { colors } = useTheme();
  const ui = useThemedStyles(baseUi);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function share(pdf: boolean) {
    if (!receipt || busy) return;
    setBusy(true);
    setError("");
    try {
      if (!pdf) {
        await Share.share({ message: receiptText(receipt) });
        return;
      }
      if (Platform.OS === "web") {
        const preview = window.open("", "_blank");
        if (!preview)
          throw new Error("Allow the receipt window, then try again.");
        preview.opener = null;
        preview.document.open();
        preview.document.write(receiptHtml(receipt));
        preview.document.close();
        preview.print();
      } else {
        const Print = await import("expo-print");
        const Sharing = await import("expo-sharing");
        if (!(await Sharing.isAvailableAsync()))
          throw new Error(
            "File sharing is unavailable. Use Share receipt text.",
          );
        const file = await Print.printToFileAsync({
          html: receiptHtml(receipt),
        });
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          UTI: ".pdf",
          dialogTitle: "Save receipt",
        });
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The receipt could not be shared.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Purchase receipt"
      subtitle="Your payment, points and receipt."
      back
    >
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {error ? <Notice error message={error} /> : null}
      {receipt ? (
        <>
          <View
            testID="purchase-confirmation"
            style={[ui.panel, { alignItems: "center" }]}
          >
            <Ionicons
              name="checkmark-circle"
              size={48}
              color={colors.success}
            />
            <Text style={ui.title}>Payment confirmed</Text>
            <Text
              style={{
                color: colors.brandStrong,
                fontSize: 18,
                fontWeight: "700",
              }}
            >
              +{receipt.points_earned} Club points
            </Text>
            <Text style={ui.body}>
              {receipt.membership_at_purchase.tier} membership ·{" "}
              {receipt.membership_at_purchase.points} points at purchase
            </Text>
          </View>
          <View style={ui.panel}>
            <Text style={ui.heading}>
              Receipt {receipt.id.slice(-6).toUpperCase()}
            </Text>
            <Text style={ui.body}>
              {new Date(receipt.issued_at).toLocaleString()}
            </Text>
            {receipt.items.map((item) => (
              <View key={item.sku} style={ui.spread}>
                <Text style={ui.body}>
                  {item.quantity} × {purchaseName(item.name)}
                </Text>
                <Text style={ui.body}>
                  {money((item.quantity * item.unit_minor) / 100)}
                </Text>
              </View>
            ))}
            <View style={ui.spread}>
              <Text style={ui.heading}>Total</Text>
              <Text style={ui.heading}>
                {money(receipt.amount_minor / 100)}
              </Text>
            </View>
            <Text style={ui.body}>
              {receipt.billing.name}
              {"\n"}
              {receipt.billing.email}
              {"\n"}
              {receipt.billing.address}
            </Text>
            {receipt.current_refunded_minor ? (
              <Text style={ui.body}>
                Refund adjustment: {money(receipt.current_refunded_minor / 100)}
              </Text>
            ) : null}
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              Preview receipt · simulated payment · no money charged · not a tax
              invoice.
            </Text>
          </View>
          <Button
            label="View my Club"
            onPress={() => router.push("/(tabs)/loyalty")}
          />
          <Button
            label="View my orders"
            variant="outline"
            onPress={() => router.push("/(tabs)/orders")}
          />
          <Button
            label="Save / share receipt PDF"
            loading={busy}
            variant="outline"
            onPress={() => void share(true)}
          />
          <Button
            label="Share receipt text"
            disabled={busy}
            variant="ghost"
            onPress={() => void share(false)}
          />
          <Button
            label="Buy again"
            variant="ghost"
            onPress={() => router.push("/checkout")}
          />
        </>
      ) : null}
    </Screen>
  );
}
