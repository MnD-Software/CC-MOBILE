import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  AccountRequired,
  Section,
  Chip,
  Notice,
  Feedback,
  ui,
} from "@/components/ui/Commerce";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useBag, usePreferences } from "./store";
import { shopApi, customerApi, payments } from "./api";
import {
  checkoutBlock,
  money,
  type CheckoutInput,
  type DeliveryQuote,
} from "./contracts";
import {
  createAttempt,
  restoreAttempt,
  persistAttempt,
  clearAttempt,
  type PaymentAttempt,
} from "./payment-recovery";

export function CheckoutScreen() {
  const { customer } = useAuth();
  return (
    <Screen title="The final sweet details." back right={null}>
      <AccountRequired>
        <CheckoutForm key={customer?.id ?? "guest"} />
      </AccountRequired>
    </Screen>
  );
}
function CheckoutForm() {
  const { customer } = useAuth();
  const cache = useQueryClient();
  const bag = useBag();
  const branch = usePreferences((s) => s.branch);
  const [method, setMethod] = useState<"delivery" | "pickup">("delivery");
  const [payment, setPayment] = useState<"mpesa" | "card" | "wallet">("mpesa");
  const [name, setName] = useState(
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" "),
  );
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Nairobi");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [delivery, setDelivery] = useState<DeliveryQuote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [now, setNow] = useState(Date.now());
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryRetry, setRecoveryRetry] = useState(0);
  const settlement = useRef(false);
  const gate = useRef(false);
  const addresses = useQuery({
    queryKey: ["addresses", customer?.id],
    queryFn: customerApi.addresses,
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  const input: CheckoutInput = {
    items: bag.lines.map((l) => ({
      product_slug: l.slug,
      quantity: l.quantity,
      ...l.selection,
    })),
    fulfilment: method,
    delivery_area: area || undefined,
    coupon_code: applied || undefined,
    branch_id: branch?.id,
    delivery_quote_id: method === "delivery" ? delivery?.id : undefined,
  };
  const quote = useQuery({
    queryKey: ["checkout-quote", input],
    queryFn: ({ signal }) => shopApi.quote(input, signal),
    enabled: !!input.items.length && !attempt,
    staleTime: 15000,
    retry: false,
  });
  const status = useQuery({
    queryKey: ["payment-status", attempt?.intent?.id],
    queryFn: () =>
      payments.status(attempt!.intent!.id, attempt!.intent!.client_secret),
    enabled: !!attempt?.intent,
    refetchInterval: (q) =>
      ["paid", "failed", "cancelled", "review_required"].includes(
        q.state.data?.state ?? "",
      )
        ? false
        : 5000,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setRecoveryError("");
    void restoreAttempt(customer!.id)
      .then((a) => {
        if (active) setAttempt(a);
      })
      .catch((e) => {
        if (active)
          setRecoveryError(
            e instanceof Error
              ? e.message
              : "Your saved payment could not be read. Please try again.",
          );
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [customer?.id, recoveryRetry]);
  useEffect(() => {
    setDelivery(null);
  }, [
    branch?.id,
    location?.latitude,
    location?.longitude,
    line1,
    area,
    city,
    JSON.stringify(input.items),
  ]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        setNow(Date.now());
        if (attempt?.intent) void status.refetch();
      }
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [attempt?.intent?.id]);
  const confirmed = status.data?.state === "paid";
  useEffect(() => {
    if (!confirmed || !attempt?.intent || settlement.current) return;
    settlement.current = true;
    void (async () => {
      if (!useBag.persist.hasHydrated()) await useBag.persist.rehydrate();
      if (!useBag.persist.hasHydrated())
        throw new Error(
          "Your bag could not be restored. Your payment is confirmed; reopen the app to update your bag.",
        );
      await useBag
        .getState()
        .settle(attempt.intent!.id, attempt.payload.checkout.items);
      await clearAttempt(customer!.id);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["orders"] }),
        cache.invalidateQueries({ queryKey: ["rewards"] }),
      ]);
    })().catch((e) => {
      settlement.current = false;
      setError(
        e instanceof Error
          ? e.message
          : "Your payment is confirmed. Reopen the app to update your bag.",
      );
    });
  }, [confirmed, attempt, customer?.id, cache]);
  async function locate() {
    setBusy(true);
    setError("");
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted")
        throw new Error(
          "Location permission is needed for a distance quote. You can choose pickup instead.",
        );
      const point = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: point.coords.latitude,
        longitude: point.coords.longitude,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your location could not be found.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function quoteDelivery() {
    if (!branch || !location) return;
    setBusy(true);
    setError("");
    try {
      setDelivery(
        await shopApi.delivery({
          branch_id: branch.id,
          ...location,
          items: input.items,
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Delivery is currently unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError("");
    try {
      let current = attempt;
      if (!current) {
        if (recoveryError) throw new Error(recoveryError);
        if (!customer) throw new Error("Please sign in again.");
        if (
          branch &&
          !(method === "pickup"
            ? branch.pickup_available
            : branch.delivery_available)
        )
          throw new Error(
            "This branch does not offer your selected fulfilment method.",
          );
        if (
          !name.trim() ||
          !/^\S+@\S+\.\S+$/.test(email) ||
          !/^(?:\+?254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ""))
        )
          throw new Error("Check your name, email and Kenyan phone number.");
        if (method === "delivery" && (!line1.trim() || !area.trim()))
          throw new Error("Enter your full delivery address.");
        const refreshed = await quote.refetch();
        if (refreshed.isError || !refreshed.data)
          throw refreshed.error ?? new Error("Refresh your order quote.");
        const block = checkoutBlock(input, refreshed.data, delivery);
        if (block) throw new Error(block);
        if (
          quote.data &&
          Math.abs(quote.data.total - refreshed.data.total) > 0.01
        )
          throw new Error("Your order total changed. Review it before paying.");
        current = await createAttempt(customer.id, {
          method: payment,
          checkout: input,
          customer: {
            name: name.trim(),
            email: email.trim(),
            phone: phone.replace(/\s/g, ""),
          },
          delivery_address:
            method === "delivery"
              ? { line1, area, city, notes: notes || undefined }
              : undefined,
        });
        setAttempt(current);
      }
      const intent =
        current.intent ?? (await payments.create(current.payload, current.key));
      const next = { ...current, intent };
      setAttempt(next);
      await persistAttempt(next);
      if (intent.action.type === "redirect" && intent.action.redirect_url) {
        const url = new URL(intent.action.redirect_url);
        if (url.protocol !== "https:")
          throw new Error("The payment page could not be verified.");
        await Linking.openURL(url.toString());
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Payment could not be started. Your order has not been confirmed.",
      );
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  if (restoring) return <Feedback loading />;
  if (recoveryError)
    return (
      <>
        <Feedback
          error={new Error(recoveryError)}
          onRetry={() => setRecoveryRetry((n) => n + 1)}
        />
        <Button
          variant="outline"
          label="Contact Cake City"
          onPress={() => router.push("/help")}
        />
      </>
    );
  if (confirmed)
    return (
      <View style={{ gap: 22 }}>
        <View
          style={[
            ui.panel,
            { backgroundColor: "#EAF8FE", borderWidth: 0, padding: 28 },
          ]}
        >
          <Text style={ui.eyebrow}>PAYMENT CONFIRMED</Text>
          <Text style={ui.title}>Your celebration is officially underway.</Text>
          <Text style={ui.body}>{status.data?.order_reference}</Text>
          <Text style={ui.heading}>{money(status.data!.amount)}</Text>
          <Text style={ui.body}>
            We’ll keep you posted as your order comes together.
          </Text>
        </View>
        {error ? <Notice error message={error} /> : null}
        {attempt?.payload.checkout.items.map((item, index) => (
          <Text key={index} style={ui.body}>
            {item.quantity} × {item.product_slug.replace(/-/g, " ")}
            {item.message ? " · “" + item.message + "”" : ""}
          </Text>
        ))}
        <Button
          label="Track my order"
          onPress={() =>
            router.replace({
              pathname: "/order/[reference]",
              params: { reference: status.data!.order_reference },
            })
          }
        />
        <Button
          variant="outline"
          label="Continue shopping"
          onPress={() => router.replace("/(tabs)/shop")}
        />
      </View>
    );
  if (attempt)
    return (
      <View style={{ gap: 20 }}>
        <Section title="Your payment" />
        <Text style={ui.body}>
          {attempt.intent?.order_reference ?? "Recovering your payment request"}
        </Text>
        <Notice
          message={
            status.data?.failure_message ??
            (status.data?.state === "review_required"
              ? "Cake City is reviewing this payment. Contact our team with your order reference before trying another payment."
              : null) ??
            attempt.intent?.action.message ??
            "Keep this screen open while Cake City confirms your payment. Returning from the payment page does not confirm payment."
          }
        />
        {attempt.intent ? (
          <Text style={ui.heading}>
            {money(status.data?.amount ?? attempt.intent.amount)}
          </Text>
        ) : null}
        {error ? <Notice error message={error} /> : null}
        {status.error ? (
          <Feedback
            error={status.error}
            onRetry={() => void status.refetch()}
          />
        ) : null}
        {["failed", "cancelled"].includes(status.data?.state ?? "") ? (
          <Button
            label="Review order and try again"
            onPress={async () => {
              try {
                await clearAttempt(customer!.id);
                setAttempt(null);
                setError("");
                settlement.current = false;
              } catch {
                setError(
                  "Your saved payment could not be cleared. Please try again.",
                );
              }
            }}
          />
        ) : (
          <>
            <Button
              disabled={status.data?.state === "review_required"}
              label={
                attempt.intent?.action.type === "redirect"
                  ? "Open secure payment page"
                  : "Resume payment check"
              }
              loading={busy}
              onPress={() =>
                attempt.intent?.action.type === "await_mpesa"
                  ? void status.refetch()
                  : void pay()
              }
            />
            {attempt.intent ? (
              <Button
                variant="outline"
                label="Check payment status"
                onPress={() => void status.refetch()}
              />
            ) : null}
          </>
        )}
        <Text style={ui.body}>
          Your payment request is saved securely, so you can return here after
          an interruption.
        </Text>
      </View>
    );
  if (!bag.lines.length) return <Feedback empty="Your bag is empty." />;
  const blocked =
    branch &&
    !(method === "pickup" ? branch.pickup_available : branch.delivery_available)
      ? "Choose a branch that offers this fulfilment method."
      : quote.isError
        ? "Refresh your order quote before paying."
        : quote.data
          ? checkoutBlock(input, quote.data, delivery, now)
          : "An order quote is required.";
  return (
    <View style={{ gap: 22 }}>
      <Section title="01 / You" />
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        maxLength={240}
      />
      <Input
        label="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Phone for this order"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Section title="02 / Your celebration, your way" />
      <View style={ui.row}>
        <Chip
          label="Delivery"
          selected={method === "delivery"}
          onPress={() => setMethod("delivery")}
        />
        <Chip
          label="Pickup"
          selected={method === "pickup"}
          onPress={() => setMethod("pickup")}
        />
      </View>
      <Button
        variant="outline"
        label={branch?.name ?? "Choose your branch"}
        onPress={() => router.push("/branches")}
      />
      {method === "delivery" ? (
        <>
          {addresses.data?.map((a) => (
            <Chip
              key={a.id}
              label={a.label + " · " + a.area}
              selected={line1 === a.line1}
              onPress={() => {
                setLine1([a.line1, a.line2].filter(Boolean).join(", "));
                setArea(a.area);
                setCity(a.city);
                setNotes(a.delivery_notes ?? "");
                setName(a.recipient_name);
                setPhone(a.phone);
                setLocation(null);
              }}
            />
          ))}
          <Input
            label="Building, street and apartment"
            value={line1}
            onChangeText={setLine1}
            autoComplete="street-address"
          />
          <Input label="Area" value={area} onChangeText={setArea} />
          <Input label="City" value={city} onChangeText={setCity} />
          <Input
            label="Delivery instructions (optional)"
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
          />
          <Notice message="Use the device at your delivery address to confirm the location. Delivery is priced from the selected branch to this point." />
          <Button
            variant="outline"
            label={
              location ? "Update delivery location" : "Use my current location"
            }
            loading={busy}
            onPress={() => void locate()}
          />
          {location ? (
            <Text style={ui.body}>
              Location selected: {location.latitude.toFixed(5)},{" "}
              {location.longitude.toFixed(5)}
            </Text>
          ) : null}
          {!config.data?.capabilities.distance_delivery ? (
            <Notice message="Distance-based delivery is unavailable at the moment. Please try again later or select pickup." />
          ) : (
            <Button
              variant="secondary"
              label="Calculate delivery"
              disabled={!branch || !location || !line1 || !area}
              loading={busy}
              onPress={() => void quoteDelivery()}
            />
          )}{" "}
          {delivery ? (
            <Notice
              message={
                delivery.distance_km.toFixed(1) +
                " km · " +
                money(delivery.delivery_fee) +
                " · estimated " +
                delivery.estimated_delivery_minutes +
                " minutes"
              }
            />
          ) : null}
        </>
      ) : null}
      <Section title="03 / A little extra value" />
      <Input
        label="Offer code"
        value={coupon}
        onChangeText={setCoupon}
        autoCapitalize="characters"
        maxLength={80}
      />
      <Button
        variant="outline"
        label={applied ? "Remove offer" : "Apply offer"}
        disabled={!applied && !coupon.trim()}
        onPress={() => setApplied(applied ? "" : coupon.trim())}
      />
      <Section title="04 / Your order" />
      {bag.lines.map((l) => (
        <View key={l.key} style={ui.spread}>
          <Text style={[ui.body, { flex: 1 }]}>
            {l.quantity} × {l.name}
          </Text>
          <Text style={ui.label}>{money(l.price * l.quantity)}</Text>
        </View>
      ))}
      <Feedback
        loading={quote.isPending}
        error={quote.error}
        onRetry={() => void quote.refetch()}
      />
      {quote.data ? (
        <View style={ui.panel}>
          {[
            ["Cakes & extras", quote.data.subtotal],
            ["Delivery", quote.data.delivery_fee],
            ["Discount", -quote.data.discount],
          ].map(([label, amount]) => (
            <View key={label} style={ui.spread}>
              <Text style={ui.body}>{label}</Text>
              <Text style={ui.label}>{money(Number(amount))}</Text>
            </View>
          ))}
          <View style={ui.line} />
          <View style={ui.spread}>
            <Text style={ui.heading}>Total</Text>
            <Text style={ui.heading}>{money(quote.data.total)}</Text>
          </View>
        </View>
      ) : null}
      {blocked ? <Notice message={blocked} /> : null}
      <Section title="05 / Secure payment" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["mpesa", "card", "wallet"] as const).map((p) => (
          <Chip
            key={p}
            label={
              { mpesa: "M-Pesa", card: "Card", wallet: "Cake City credit" }[p]
            }
            selected={payment === p}
            onPress={() => setPayment(p)}
          />
        ))}
      </View>
      {error ? <Notice error message={error} /> : null}
      <Button
        label={
          "Pay securely" + (quote.data ? " · " + money(quote.data.total) : "")
        }
        disabled={!!blocked || quote.isFetching}
        loading={busy}
        onPress={() => void pay()}
      />
      <Text style={[ui.body, { fontSize: 12, textAlign: "center" }]}>
        Your payment is confirmed directly by Cake City’s payment service.
      </Text>
    </View>
  );
}
