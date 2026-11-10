import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import {
  getStorageItem,
  setStorageItem,
  deleteStorageItem,
} from "@/auth/secure-storage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { Notice, Screen } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { z } from "zod";
import { appOrderSchema, type AppOrder } from "./app-orders";
import { PaymentConfetti } from "./PaymentConfetti";
import { CheckoutProgress } from "@/components/storefront/CheckoutProgress";

const attemptSchema = z.object({
  quote_id: z.string().uuid(),
  key: z.string().min(16),
});

export function PaymentTestScreen() {
  const { customer } = useAuth();
  return customer &&
    ["admin", "staff", "ecommerce_manager"].includes(customer.role) ? (
    <TestPurchase key={customer.id} customer={customer} />
  ) : (
    <Screen title="Purchase test" back>
      <Notice message="Sign in with an app commerce staff account to run this test." />
      {!customer ? (
        <Button
          label="Sign in to test checkout"
          onPress={() => router.push("/sign-in")}
        />
      ) : null}
    </Screen>
  );
}

function TestPurchase({
  customer,
}: {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string | null;
  };
}) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const [phone, setPhone] = useState(customer.phone || "");
  const [destination, setDestination] = useState("");
  const [order, setOrder] = useState<AppOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const attempt = useRef<z.infer<typeof attemptSchema> | null>(null);
  const flight = useRef(false);
  const key = `cakecity.simulated-purchase.${customer.id}`;
  useEffect(() => {
    let active = true;
    void getStorageItem(key)
      .then((saved) => {
        if (active && saved)
          attempt.current = attemptSchema.parse(JSON.parse(saved));
        if (active) setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            "The previous test request could not be recovered. Check Your orders before retrying.",
          );
      });
    return () => {
      active = false;
    };
  }, [key]);

  async function run() {
    if (flight.current || !ready) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      let current = order;
      if (!current && attempt.current) {
        const recovery = z
          .object({ order: appOrderSchema.nullable() })
          .parse(
            await api.get(
              `/v1/app-checkout/recovery?request_key=${encodeURIComponent(attempt.current.key)}`,
              { auth: true },
            ),
          );
        current = recovery.order;
      }
      if (!current) {
        if (!attempt.current) {
          if (!/^(?:\+?254|0)[17][0-9]{8}$/.test(phone.trim()))
            throw new Error("Enter a valid Kenyan phone number.");
          if (!destination.trim())
            throw new Error(
              "Add a test delivery address or pickup branch so dispatch has a destination.",
            );
          const product = z
            .object({ id: z.number() })
            .parse(
              await api.post(
                "/v1/admin/payment-test/product",
                {},
                { auth: true },
              ),
            );
          const quote = z
            .object({ id: z.string().uuid(), total_minor: z.literal(100) })
            .parse(
              await api.post(
                "/v1/app-checkout/quote",
                {
                  items: [
                    {
                      product_id: product.id,
                      quantity: 1,
                      size: "Test product",
                      add_ons: [],
                    },
                  ],
                  fulfilment,
                  billing: {
                    first_name: customer.first_name,
                    last_name: customer.last_name,
                    email: customer.email,
                    phone: phone.trim(),
                    address: destination,
                    area: "",
                    city: "Nairobi",
                  },
                  notes: `SIMULATED TEST ONLY. ${fulfilment === "pickup" ? "Pickup branch" : "Delivery destination"}: ${destination || "HQ test route"}. No physical dispatch required.`,
                },
                { auth: true },
              ),
            );
          attempt.current = { quote_id: quote.id, key: randomUUID() };
          await setStorageItem(key, JSON.stringify(attempt.current));
        }
        // Persist again on recovery; storage failure must never start an order.
        await setStorageItem(key, JSON.stringify(attempt.current));
        current = appOrderSchema.parse(
          await api.post(
            "/v1/app-orders",
            { quote_id: attempt.current.quote_id },
            { auth: true, headers: { "Idempotency-Key": attempt.current.key } },
          ),
        );
        setOrder(current);
      }
      const completed = appOrderSchema.parse(
        await api.post(
          `/v1/admin/payment-test/orders/${encodeURIComponent(current.reference)}/complete`,
          {},
          { auth: true },
        ),
      );
      setOrder(completed);
      await deleteStorageItem(key);
      attempt.current = null;
      setCelebrate(true);
      await Promise.all(
        ["club", "club-transactions", "app-orders"].map((query) =>
          client.invalidateQueries({ queryKey: [query] }),
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The test request needs recovery. Retry to resume the same order.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const done = order?.payment_state === "completed";
  return (
    <Screen
      title="Test cake checkout"
      subtitle="Order → Club → kitchen → delivery"
      back
    >
      {celebrate ? (
        <PaymentConfetti onComplete={() => setCelebrate(false)} />
      ) : null}
      <CheckoutProgress current={reviewed || order ? 2 : 1} />
      <LinearGradient
        colors={["#930052", "#B80068", "#DB218D"]}
        style={{ padding: 22, borderRadius: 26, gap: 14 }}
      >
        <Text
          style={{
            color: "#FFE1F0",
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 1.5,
          }}
        >
          DEMO PRODUCT • NOT A REAL CAKE
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              backgroundColor: "rgba(255,255,255,0.18)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="flask-outline" size={38} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "800" }}>
              Cake City test cake
            </Text>
            <Text style={{ color: "#FFE1F0", lineHeight: 20 }}>
              1 test item · KES 1.00
            </Text>
          </View>
        </View>
        <Text style={{ color: "#FFFFFF", lineHeight: 20 }}>
          Your complete order journey, without a charge.
        </Text>
      </LinearGradient>
      <Notice message="SIMULATED PURCHASE — no money is charged and Pesapal is not called. This is a dedicated test item, not part of your real shopping bag. No physical cake or delivery is requested." />
      <View
        style={{
          padding: 22,
          borderRadius: 24,
          backgroundColor: colors.brandLight,
          gap: 12,
        }}
      >
        <Text
          style={{ color: colors.brandStrong, fontSize: 24, fontWeight: "800" }}
        >
          KES 1.00 total
        </Text>
        <Text style={{ color: colors.ink }}>
          Test cake × 1: KES 1 · Delivery / pickup: KES 0 · Tax: KES 0
        </Text>
        <Disclosure title="How this test updates Club">
          <Text style={{ color: colors.muted }}>
            Counts as KES 100 qualifying spend in your normal Club, using its
            current earning rule. This does not mean 100 points. Test activity
            is labelled in orders and the dashboard.
          </Text>
        </Disclosure>
      </View>
      {!order && !attempt.current && !reviewed ? (
        <>
          <Input
            label="Phone"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              style={{ flex: 1 }}
              variant={fulfilment === "delivery" ? "primary" : "outline"}
              label="Delivery"
              disabled={busy}
              onPress={() => setFulfilment("delivery")}
            />
            <Button
              style={{ flex: 1 }}
              variant={fulfilment === "pickup" ? "primary" : "outline"}
              label="Pickup"
              disabled={busy}
              onPress={() => setFulfilment("pickup")}
            />
          </View>
          <Input
            placeholder={
              fulfilment === "pickup"
                ? "e.g. Head Office — test pickup"
                : "e.g. Westlands, test building, reception"
            }
            label={
              fulfilment === "pickup"
                ? "Pickup branch (test)"
                : "Delivery address (test)"
            }
            value={destination}
            onChangeText={setDestination}
            editable={!busy}
          />
        </>
      ) : null}
      {reviewed && !order && !attempt.current ? (
        <View
          style={{
            padding: 20,
            gap: 12,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>
            Review your test order
          </Text>
          <Text style={{ color: colors.ink }}>
            {customer.first_name} {customer.last_name} · {phone}
          </Text>
          <Text style={{ color: colors.muted }}>
            {fulfilment === "pickup" ? "Pickup" : "Delivery"}: {destination}
          </Text>
          <Text style={{ color: colors.brandStrong, fontWeight: "800" }}>
            Simulated total: KES 1.00 · Actual charge: KES 0.00
          </Text>
          <Button
            variant="ghost"
            label="Edit test details"
            onPress={() => setReviewed(false)}
          />
        </View>
      ) : null}
      {error ? <Notice error message={error} /> : null}
      {done ? (
        <>
          <Notice
            message={`Test purchase confirmed: ${order.reference}. Club is updated. Open the dashboard Kitchen module to start preparation, then Dispatch & delivery to finish the journey.`}
          />
          <Button
            label="Track this test order"
            onPress={() =>
              router.push({
                pathname: "/order/[reference]",
                params: { reference: order.reference },
              })
            }
          />
          <Button
            variant="outline"
            label="View my Club"
            onPress={() => router.push("/(tabs)/loyalty")}
          />
          <Button
            variant="outline"
            label="Continue in Kitchen"
            onPress={() => router.push("/kitchen")}
          />
          <Button
            variant="outline"
            label="Open Dispatch"
            onPress={() => router.push("/dispatch")}
          />
          <Notice message="Next: in Kitchen, find this order reference, choose a location, assign production and mark it ready. In Dispatch, select a rider and assign the items. Sign in separately at /rider-login with the assigned rider account to accept, collect and confirm delivery. Track this same reference in Your orders. Pickup orders finish through the staff collection workflow." />
          <Button
            variant="outline"
            label="Run another KES 1 test"
            onPress={() => {
              setOrder(null);
              setReviewed(false);
              setCelebrate(false);
            }}
          />
        </>
      ) : (
        <Button
          label={
            order || attempt.current
              ? "Resume the same test purchase"
              : reviewed
                ? "Simulate KES 1 purchase"
                : "Review test order"
          }
          loading={busy}
          disabled={!ready || busy}
          onPress={() => {
            if (order || attempt.current || reviewed) {
              void run();
              return;
            }
            if (!/^(?:\+?254|0)[17][0-9]{8}$/.test(phone.trim())) {
              setError("Enter a valid Kenyan phone number.");
              return;
            }
            if (!destination.trim()) {
              setError(
                "Add a test delivery address or pickup branch so dispatch has a destination.",
              );
              return;
            }
            setError("");
            setReviewed(true);
          }}
        />
      )}
    </Screen>
  );
}
