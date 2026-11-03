import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import {
  deleteStorageItem,
  getStorageItem,
  setStorageItem,
} from "@/auth/secure-storage";
import { appOrderSchema, appOrders, type AppOrder } from "./app-orders";
import { InAppPayment } from "./InAppPayment";
import { loadBillingProfile, validateBillingProfile } from "./billing-profile";
import { useBag } from "./store";
import { money, type CheckoutInput } from "./contracts";

const quoteSchema = z.object({
  id: z.string(),
  total_minor: z.number(),
  subtotal_minor: z.number(),
  delivery_minor: z.number(),
  discount_minor: z.number(),
  tax_minor: z.number(),
});
const optionsSchema = z.object({
  pickup_enabled: z.boolean(),
  pickup_instructions: z.string().default(""),
  delivery_zones: z.array(
    z.object({ id: z.string(), name: z.string(), fee_minor: z.number() }),
  ),
});

export function PesapalCheckoutForm() {
  const { customer } = useAuth();
  return customer ? (
    <AppCheckout key={customer.id} owner={customer.id} />
  ) : (
    <>
      <Notice message="Sign in to keep your app orders, payments and receipts together." />
      <Button
        label="Sign in to checkout"
        onPress={() => router.push("/sign-in")}
      />
    </>
  );
}

function AppCheckout({ owner }: { owner: string }) {
  const { customer } = useAuth();
  const lines = useBag((s) => s.lines);
  const settle = useBag((s) => s.settle);
  const [billing, setBilling] = useState({
    firstName: customer?.first_name || "",
    lastName: customer?.last_name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: "",
    area: "",
    city: "Nairobi",
    postcode: "",
  });
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">(
    "delivery",
  );
  const [zone, setZone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [quote, setQuote] = useState<z.infer<typeof quoteSchema> | null>(null);
  const [order, setOrder] = useState<AppOrder | null>(null);
  const [payment, setPayment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const flight = useRef(false);
  const attempt = useRef<{
    quote_id: string;
    key: string;
    fingerprint: string;
  } | null>(null);
  const [restored, setRestored] = useState(false);
  const recoveryFailed = useRef(false);
  const key = `cakecity.app-checkout.${owner}`;
  const fingerprint = JSON.stringify({
    lines,
    billing,
    fulfilment,
    zone,
    coupon,
    notes,
    recipient,
    recipientPhone,
  });
  const options = useQuery({
    queryKey: ["app-checkout-options"],
    queryFn: async () =>
      optionsSchema.parse(await api.get("/v1/app-checkout/options")),
  });
  useEffect(() => {
    alive.current = true;
    void loadBillingProfile(owner).then((p) => {
      if (p && alive.current) setBilling(p);
    });
    void getStorageItem(key)
      .then(async (saved) => {
        if (!saved) return;
        const value = JSON.parse(saved);
        if (value.owner !== owner)
          throw new Error("Checkout recovery belongs to another account.");
        attempt.current = value.attempt;
        if (value.reference) {
          const recovered = await appOrders.detail(value.reference);
          if (alive.current) setOrder(recovered);
        } else if (value.attempt?.key) {
          const recovery = z
            .object({ order: appOrderSchema.nullable() })
            .parse(
              await api.get(
                `/v1/app-checkout/recovery?request_key=${encodeURIComponent(value.attempt.key)}`,
                { auth: true },
              ),
            );
          if (alive.current && recovery.order) setOrder(recovery.order);
          else if (!recovery.order) {
            recoveryFailed.current = true;
            if (alive.current)
              setError(
                "The previous order request has not been confirmed. Open Your orders or contact support before starting another checkout.",
              );
          }
        }
      })
      .catch(() => {
        if (alive.current) {
          setError(
            "Check Your orders before making another payment; checkout recovery could not be loaded.",
          );
          recoveryFailed.current = true;
        }
      })
      .finally(() => {
        if (alive.current) setRestored(!recoveryFailed.current);
      });
    return () => {
      alive.current = false;
    };
  }, [owner]);
  useEffect(() => {
    setQuote(null);
  }, [fingerprint]);
  async function verify() {
    if (!order || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await appOrders.verify(order.reference);
      if (alive.current) setOrder(result);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Payment confirmation is unavailable.",
        );
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function review() {
    if (flight.current || !restored) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const valid = validateBillingProfile(billing);
      if (lines.some((l) => !l.product_id || l.selection.studio_quote_id))
        throw new Error(
          "This cake configuration needs an app quote. Contact support in Requests.",
        );
      const result = quoteSchema.parse(
        await api.post(
          "/v1/app-checkout/quote",
          {
            items: lines.map((l) => ({
              product_id: l.product_id,
              quantity: l.quantity,
              ...l.selection,
            })),
            fulfilment,
            delivery_zone_id: fulfilment === "delivery" ? zone : null,
            coupon_code: coupon.trim() || null,
            billing: {
              first_name: valid.firstName,
              last_name: valid.lastName,
              email: valid.email,
              phone: valid.phone,
              address: valid.address,
              area: valid.area,
              city: valid.city,
              postcode: valid.postcode,
            },
            notes,
            recipient_name: recipient,
            recipient_phone: recipientPhone,
          },
          { auth: true },
        ),
      );
      if (!alive.current) return;
      setQuote(result);
      attempt.current = { quote_id: result.id, key: randomUUID(), fingerprint };
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Your quote could not be confirmed.",
        );
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function pay() {
    if (flight.current || !restored) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      let current = order;
      if (!current) {
        if (
          !quote ||
          !attempt.current ||
          attempt.current.fingerprint !== fingerprint
        )
          throw new Error("Review the final price before paying.");
        // Recovery is persisted before the first non-idempotent order request.
        await setStorageItem(
          key,
          JSON.stringify({ owner, attempt: attempt.current }),
        );
        current = appOrderSchema.parse(
          await api.post(
            "/v1/app-orders",
            { quote_id: attempt.current.quote_id },
            { auth: true, headers: { "Idempotency-Key": attempt.current.key } },
          ),
        );
        await setStorageItem(
          key,
          JSON.stringify({
            owner,
            attempt: attempt.current,
            reference: current.reference,
          }),
        );
        if (alive.current) setOrder(current);
      }
      const result = await appOrders.start(current.reference);
      if (!alive.current) return;
      setOrder(result);
      if (result.payment_url) setPayment(result.payment_url);
      else if (["creating", "uncertain"].includes(result.payment_state))
        setError(
          "This payment is being confirmed. Keep this app order and do not start another payment.",
        );
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Check Your orders before paying again.",
        );
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (order)
    return (
      <View style={{ gap: 16 }}>
        <Text>{order.reference}</Text>
        <Text>
          {order.status.replaceAll("_", " ")} · {money(order.total_minor / 100)}
        </Text>
        {error ? <Notice error message={error} /> : null}
        {order.payment_state === "completed" ? (
          <>
            <Notice message="Your payment is verified. Your app receipt is available in Your orders." />
            <Button
              label="Continue shopping"
              onPress={() => {
                const items = (order.snapshot?.lines || []).map((l) => ({
                  product_slug: l.slug,
                  quantity: l.quantity,
                  ...l.selection,
                })) as CheckoutInput["items"];
                void settle(order.reference, items)
                  .then(() => deleteStorageItem(key))
                  .then(() => router.replace("/(tabs)"));
              }}
            />
          </>
        ) : (
          <>
            {["pending", "not_started"].includes(order.payment_state) ? (
              <Button
                label="Pay securely inside the app"
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
          </>
        )}
        <Button
          variant="outline"
          label="View app order and receipt"
          onPress={() =>
            router.push({
              pathname: "/order/[reference]",
              params: { reference: order.reference },
            })
          }
        />
        <Button
          variant="outline"
          label="Order support"
          onPress={() => router.push("/requests")}
        />
        {order.payment_state === "not_started" ? (
          <Button
            variant="outline"
            label="Cancel this unpaid order"
            disabled={busy}
            onPress={() => {
              void api
                .post(
                  `/v1/app-orders/${order.reference}/cancel`,
                  {},
                  { auth: true },
                )
                .then(() => deleteStorageItem(key))
                .then(() => {
                  setOrder(null);
                  setQuote(null);
                  attempt.current = null;
                })
                .catch((e) => setError(e.message));
            }}
          />
        ) : null}
        {["failed", "cancelled"].includes(order.payment_state) ? (
          <Button
            variant="outline"
            label="Return to bag"
            onPress={() => {
              void deleteStorageItem(key).then(() => router.replace("/cart"));
            }}
          />
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
      </View>
    );
  return (
    <View style={{ gap: 14 }}>
      {!lines.length ? <Notice message="Your bag is empty." /> : null}
      {Object.entries({
        firstName: "First name",
        lastName: "Last name",
        email: "Email",
        phone: "Phone",
        address: "Address",
        area: "Area",
        city: "City",
        postcode: "Postal code",
      }).map(([field, label]) => (
        <Input
          key={field}
          label={label}
          value={billing[field as keyof typeof billing]}
          onChangeText={(value) =>
            setBilling((b) => ({ ...b, [field]: value }))
          }
        />
      ))}
      {options.data?.pickup_enabled ? (
        <Button
          variant="outline"
          label={fulfilment === "pickup" ? "Pickup selected" : "Choose pickup"}
          onPress={() => setFulfilment("pickup")}
        />
      ) : null}
      {fulfilment === "pickup" && options.data?.pickup_instructions ? (
        <Notice message={options.data.pickup_instructions} />
      ) : null}
      <Button
        variant="outline"
        label={
          fulfilment === "delivery" ? "Delivery selected" : "Choose delivery"
        }
        onPress={() => setFulfilment("delivery")}
      />
      {fulfilment === "delivery"
        ? options.data?.delivery_zones.map((z) => (
            <Button
              key={z.id}
              variant="outline"
              label={`${zone === z.id ? "✓ " : ""}${z.name} · ${money(z.fee_minor / 100)}`}
              onPress={() => setZone(z.id)}
            />
          ))
        : null}
      {options.isError ? (
        <Notice
          error
          message="Delivery options could not be loaded. Retry checkout."
        />
      ) : null}
      <Input
        label="Recipient name (for a gift)"
        value={recipient}
        onChangeText={setRecipient}
      />
      <Input
        label="Recipient phone"
        value={recipientPhone}
        onChangeText={setRecipientPhone}
      />
      <Input label="Order notes" value={notes} onChangeText={setNotes} />
      <Input label="App coupon" value={coupon} onChangeText={setCoupon} />
      {error ? <Notice error message={error} /> : null}
      <Button
        label="Review confirmed total"
        disabled={busy || !restored || !lines.length}
        onPress={() => void review()}
      />
      {quote ? (
        <>
          <Text>
            Products {money(quote.subtotal_minor / 100)} · Delivery{" "}
            {money(quote.delivery_minor / 100)} · Discount{" "}
            {money(quote.discount_minor / 100)}
          </Text>
          <Text>Total {money(quote.total_minor / 100)}</Text>
          <Button
            label={`Pay ${money(quote.total_minor / 100)} inside the app`}
            disabled={busy}
            onPress={() => void pay()}
          />
        </>
      ) : null}
    </View>
  );
}
