import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  Feedback,
  Notice,
  Screen,
  ui as baseUi,
} from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { CheckoutProgress } from "@/components/storefront/CheckoutProgress";
import { loadBillingProfile } from "@/features/commerce/billing-profile";
import { money } from "@/features/commerce/contracts";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import {
  purchaseTest,
  purchaseTestOrigin,
  type TestBilling,
  type TestOutcome,
} from "./client";
import { purchaseName } from "./model";
import { usePurchasePreview, useRefreshPurchase } from "./usePurchasePreview";

export function PurchaseTestScreen({
  fromCheckout = false,
}: { fromCheckout?: boolean } = {}) {
  const router = useRouter();
  const { customer } = useAuth();
  const { colors } = useTheme();
  const ui = useThemedStyles(baseUi);
  const query = usePurchasePreview();
  const refresh = useRefreshPurchase();
  const state = query.data;
  const [code, setCode] = useState("");
  const [billing, setBilling] = useState<TestBilling>({
    name: "",
    email: "",
    address: "",
  });
  const [busy, setBusy] = useState(false);
  const [billingReady, setBillingReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmFresh, setConfirmFresh] = useState(false);
  const flight = useRef(false);
  const active = useRef(true);
  const dirty = useRef(false);
  useEffect(() => {
    active.current = true;
    let current = true;
    setBillingReady(false);
    dirty.current = false;
    void (async () => {
      const attempt = await purchaseTest.pending();
      const previousBilling = await purchaseTest.billing();
      const saved = customer ? await loadBillingProfile(customer.id) : null;
      if (!current) return;
      setPending(Boolean(attempt));
      if (attempt) setBilling(attempt.billing);
      else if (
        !saved &&
        previousBilling &&
        (!customer ||
          previousBilling.email.toLowerCase() ===
            customer.email.toLowerCase()) &&
        !dirty.current
      )
        setBilling(previousBilling);
      else if (!dirty.current)
        setBilling({
          name: saved
            ? `${saved.firstName} ${saved.lastName}`
            : [customer?.first_name, customer?.last_name]
                .filter(Boolean)
                .join(" "),
          email: saved?.email ?? customer?.email ?? "",
          address: saved
            ? [saved.address, saved.area, saved.city, saved.postcode]
                .filter(Boolean)
                .join(", ")
            : "",
        });
    })()
      .catch((reason) => {
        if (current) setError(reason.message);
      })
      .finally(() => {
        if (current) setBillingReady(true);
      });
    return () => {
      current = false;
      active.current = false;
    };
  }, [customer?.id]);

  async function action(work: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (reason) {
      if (active.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Your payment could not finish. Please retry.",
        );
        setPending(Boolean(await purchaseTest.pending().catch(() => null)));
      }
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function pay(outcome: TestOutcome = "succeeded") {
    await action(async () => {
      if (
        !pending &&
        (!billing.name.trim() ||
          !billing.address.trim() ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email.trim()))
      )
        throw new Error(
          "Enter your name, billing email and address before paying.",
        );
      const result = await purchaseTest.pay(billing, outcome);
      await refresh();
      if (!active.current) return;
      setPending(false);
      if (result.status === "succeeded")
        router.replace({
          pathname: "/order/[reference]",
          params: { reference: result.id },
        });
      else
        setNotice(
          "Payment was not completed. No points were added and no receipt was issued.",
        );
    });
  }
  if (!purchaseTestOrigin())
    return (
      <Screen title="Checkout" back>
        <Notice message="In-app payment is not currently available." />
      </Screen>
    );
  return (
    <Screen
      title="Secure checkout"
      subtitle="One payment for your celebration."
      back
    >
      <CheckoutProgress current={2} />
      <Feedback
        loading={query.isPending || !billingReady}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {error ? <Notice error message={error} /> : null}
      {notice ? <Notice message={notice} /> : null}
      {!query.isPending && !state ? (
        <View style={ui.panel}>
          <Text style={ui.heading}>Connect your membership</Text>
          <Text style={ui.body}>
            Enter your private access code once to connect purchases, points and
            receipts.
          </Text>
          <Input
            label="Access code"
            value={code}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            onChangeText={setCode}
          />
          <Button
            label="Connect membership"
            loading={busy}
            disabled={code.trim().length !== 8}
            onPress={() =>
              void action(async () => {
                await purchaseTest.connect(code);
                await refresh();
                if (active.current) setCode("");
              })
            }
          />
        </View>
      ) : null}
      {state && billingReady ? (
        <>
          <View style={ui.panel}>
            <View style={ui.row}>
              <Ionicons
                name="gift-outline"
                size={28}
                color={colors.brandStrong}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={ui.heading}>
                  {purchaseName(state.product.name)}
                </Text>
                <Text style={ui.body}>Collection · 1 cupcake</Text>
              </View>
              <Text style={ui.heading}>
                {money(state.product.unit_minor / 100)}
              </Text>
            </View>
            <Text
              style={{
                color: colors.brandStrong,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Earn +{state.product.test_points} Club points with this purchase
            </Text>
          </View>
          <Disclosure title="Billing details" defaultOpen={!billing.address}>
            {(
              [
                ["name", "Full name"],
                ["email", "Billing email"],
                ["address", "Billing address"],
              ] as const
            ).map(([key, label]) => (
              <Input
                key={key}
                label={label}
                value={billing[key]}
                editable={!busy && !pending}
                keyboardType={key === "email" ? "email-address" : "default"}
                autoCapitalize={key === "email" ? "none" : "sentences"}
                onChangeText={(value) => {
                  dirty.current = true;
                  setBilling((previous) => ({ ...previous, [key]: value }));
                }}
              />
            ))}
            {customer ? (
              <Button
                variant="ghost"
                label="Manage saved billing details"
                onPress={() => router.push("/billing-details")}
              />
            ) : null}
          </Disclosure>
          <View style={[ui.panel, ui.spread]}>
            <Text style={ui.heading}>Total</Text>
            <Text style={ui.heading}>
              {money(state.product.unit_minor / 100)}
            </Text>
          </View>
          {pending ? (
            <Notice message="A payment is waiting for confirmation. Continue to recover it without a second purchase." />
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            Preview payment · no money will be charged. Your regular shopping
            bag is kept.
          </Text>
          <Button
            label={
              pending
                ? "Check payment status"
                : `Pay ${money(state.product.unit_minor / 100)}`
            }
            loading={busy}
            onPress={() => void pay()}
          />
          {!fromCheckout ? (
            <Disclosure title="Payment review controls">
              {(["failed", "timed_out", "cancelled"] as const).map(
                (outcome) => (
                  <Button
                    key={outcome}
                    label={`Simulate ${outcome.replaceAll("_", " ")}`}
                    variant="outline"
                    disabled={busy || pending}
                    onPress={() => void pay(outcome)}
                  />
                ),
              )}
              <Button
                label={
                  confirmFresh
                    ? "Confirm new preview membership"
                    : "Start a new preview membership"
                }
                variant="ghost"
                disabled={busy || pending}
                onPress={() => {
                  if (!confirmFresh) {
                    setConfirmFresh(true);
                    return;
                  }
                  void action(async () => {
                    await purchaseTest.fresh();
                    await refresh();
                    if (active.current) setConfirmFresh(false);
                  });
                }}
              />
            </Disclosure>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
