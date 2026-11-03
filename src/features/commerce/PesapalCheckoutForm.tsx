import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
import { Disclosure } from "@/components/ui/Disclosure";
import { useTheme } from "@/theme/ThemeProvider";
import { usePaymentSuccess } from "./usePaymentSuccess";
import { PaymentConfetti } from "./PaymentConfetti";
import { isVerifiedPayment } from "./checkout-success";
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
  const { colors } = useTheme();
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
  const { celebrate, endCelebration } = usePaymentSuccess(
    order,
    owner,
    setError,
  );
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
    if (options.data?.pickup_enabled && !options.data.delivery_zones.length)
      setFulfilment("pickup");
  }, [options.data]);
  useEffect(() => {
    if (order && isVerifiedPayment(order)) setPayment(null);
  }, [order?.payment_state, order?.paid_at]);
  useEffect(() => {
    if (
      !order ||
      !["creating", "pending", "uncertain"].includes(order.payment_state)
    )
      return;
    let active = true,
      polls = 0;
    const timer = setInterval(() => {
      if (++polls > 24) {
        clearInterval(timer);
        return;
      }
      void appOrders
        .detail(order.reference)
        .then((current) => {
          if (active && alive.current) setOrder(current);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order?.reference, order?.payment_state]);
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
      <View style={{ gap: 16, position: "relative" }}>
        {celebrate ? <PaymentConfetti onComplete={endCelebration} /> : null}
        <LinearGradient
          colors={
            isVerifiedPayment(order)
              ? ["#FFF0F7", "#FFFFFF"]
              : ["#FAF7FB", "#FFFFFF"]
          }
          style={checkoutStyles.confirmation}
        >
          <View
            style={[
              checkoutStyles.successIcon,
              {
                backgroundColor: isVerifiedPayment(order)
                  ? "#E5F5EE"
                  : "#FFF0F7",
              },
            ]}
          >
            <Ionicons
              name={
                isVerifiedPayment(order) ? "checkmark-circle" : "time-outline"
              }
              size={42}
              color={isVerifiedPayment(order) ? "#26744D" : "#B80068"}
            />
          </View>
          <Text style={checkoutStyles.eyebrow}>
            {isVerifiedPayment(order) ? "PAYMENT CONFIRMED" : "YOUR APP ORDER"}
          </Text>
          <Text style={[checkoutStyles.heroTitle, { color: colors.ink }]}>
            {isVerifiedPayment(order)
              ? "A little joy is on its way."
              : "We’re keeping your order safe."}
          </Text>
          <Text
            style={[checkoutStyles.orderTotal, { color: colors.brandStrong }]}
          >
            {money(order.total_minor / 100)}
          </Text>
          <Text selectable style={{ color: colors.muted, textAlign: "center" }}>
            {order.reference}
          </Text>
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            {order.status.replaceAll("_", " ")}
          </Text>
        </LinearGradient>
        {error ? <Notice error message={error} /> : null}
        {isVerifiedPayment(order) ? (
          <>
            <Notice message="Thank you! Your cake is made to order. Follow preparation and fulfilment in Your orders, where your payment receipt is saved." />
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
            void (
              isVerifiedPayment(order)
                ? deleteStorageItem(key)
                : Promise.resolve()
            ).then(() =>
              router.push({
                pathname: "/order/[reference]",
                params: { reference: order.reference },
              }),
            )
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
    <View style={{ gap: 18 }}>
      <LinearGradient
        colors={["#FFF0F7", "#FFF9F3"]}
        style={checkoutStyles.intro}
      >
        <Text style={checkoutStyles.eyebrow}>THE FINAL SWEET DETAIL</Text>
        <Text style={[checkoutStyles.heroTitle, { color: colors.ink }]}>
          Make someone’s day.
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          Your chosen cake, made for your occasion. Review your details and pay
          securely with Pesapal.
        </Text>
        <View style={checkoutStyles.secure}>
          <Ionicons name="lock-closed-outline" color="#B80068" size={15} />
          <Text
            style={{
              color: colors.brandStrong,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            Secure in-app payment
          </Text>
        </View>
      </LinearGradient>
      {!lines.length ? <Notice message="Your bag is empty." /> : null}
      <CheckoutSection
        step="01"
        title="Your celebration"
        subtitle="Your selected options and quantities."
      >
        {lines.map((line) => (
          <View key={line.key} style={checkoutStyles.bagLine}>
            {line.image ? (
              <Image
                source={{ uri: line.image }}
                contentFit="contain"
                style={checkoutStyles.bagImage}
              />
            ) : (
              <View style={checkoutStyles.bagImage} />
            )}
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ fontWeight: "700", color: colors.ink }}>
                {line.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {line.selection.size} · Qty {line.quantity}
              </Text>
              {line.selection.variation_attributes?.length ? (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {line.selection.variation_attributes
                    .map((a) => `${a.attribute}: ${a.value}`)
                    .join(" · ")}
                </Text>
              ) : null}
            </View>
            <Text style={{ color: colors.brandStrong, fontWeight: "800" }}>
              {money(line.price * line.quantity)}
            </Text>
          </View>
        ))}
        <Button
          variant="outline"
          label="Edit shopping bag"
          onPress={() => router.push("/cart")}
        />
      </CheckoutSection>
      <CheckoutSection
        step="02"
        title="Your details"
        subtitle="For your order updates and payment receipt."
      >
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
      </CheckoutSection>
      <CheckoutSection
        step="03"
        title="Pickup or delivery"
        subtitle="Choose one of Cake City’s configured fulfilment options."
      >
        {options.data?.pickup_enabled ? (
          <Button
            variant="outline"
            label={
              fulfilment === "pickup" ? "Pickup selected" : "Choose pickup"
            }
            onPress={() => setFulfilment("pickup")}
          />
        ) : null}
        {fulfilment === "pickup" && options.data?.pickup_instructions ? (
          <Notice message={options.data.pickup_instructions} />
        ) : null}
        {options.data?.delivery_zones.length ? (
          <Button
            variant="outline"
            label={
              fulfilment === "delivery"
                ? "Delivery selected"
                : "Choose delivery"
            }
            onPress={() => setFulfilment("delivery")}
          />
        ) : null}
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
        {options.data &&
        !options.data.pickup_enabled &&
        !options.data.delivery_zones.length ? (
          <Notice message="Pickup and delivery are not configured yet. Your bag is saved; payment will be available once Cake City confirms these options." />
        ) : null}
      </CheckoutSection>
      <Disclosure title="Sending a gift? Add recipient details">
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
      </Disclosure>
      <Disclosure title="Have a promotion code?">
        <Input label="App coupon" value={coupon} onChangeText={setCoupon} />
      </Disclosure>
      {error ? <Notice error message={error} /> : null}
      <CheckoutSection
        step="04"
        title="Review & pay"
        subtitle="Your final price is checked by Cake City before payment."
      >
        <Button
          label="Review confirmed total"
          disabled={
            busy ||
            !restored ||
            !lines.length ||
            options.isPending ||
            options.isError ||
            !(
              options.data?.pickup_enabled ||
              options.data?.delivery_zones.length
            )
          }
          onPress={() => void review()}
        />
        {quote ? (
          <>
            <PriceRow
              label="Your cakes & extras"
              value={quote.subtotal_minor}
            />
            <PriceRow
              label={fulfilment === "pickup" ? "Pickup" : "Delivery"}
              value={quote.delivery_minor}
            />
            {quote.discount_minor > 0 ? (
              <PriceRow
                label="Promotion savings"
                value={-quote.discount_minor}
              />
            ) : null}
            {quote.tax_minor > 0 ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Tax in confirmed total: {money(quote.tax_minor / 100)}
              </Text>
            ) : null}
            <View
              style={[checkoutStyles.totalRow, { borderColor: colors.border }]}
            >
              <Text
                style={{ fontWeight: "800", fontSize: 19, color: colors.ink }}
              >
                Total
              </Text>
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 25,
                  color: colors.brandStrong,
                }}
              >
                {money(quote.total_minor / 100)}
              </Text>
            </View>
            <Button
              label={`Pay ${money(quote.total_minor / 100)} inside the app`}
              disabled={busy}
              onPress={() => void pay()}
            />
          </>
        ) : null}
        <View style={checkoutStyles.secure}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={colors.muted}
          />
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Payment confirmation and your receipt stay in the app.
          </Text>
        </View>
      </CheckoutSection>
    </View>
  );
}

function CheckoutSection({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        checkoutStyles.section,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={checkoutStyles.sectionHeading}>
        <View style={checkoutStyles.step}>
          <Text
            style={{
              color: colors.brandStrong,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            {step}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}>
            {title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            {subtitle}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}
function PriceRow({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
    >
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: "600" }}>
        {money(value / 100)}
      </Text>
    </View>
  );
}
const checkoutStyles = StyleSheet.create({
  intro: { padding: 23, borderRadius: 25, gap: 12 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "800",
    color: "#B80068",
  },
  heroTitle: {
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  secure: { flexDirection: "row", alignItems: "center", gap: 8 },
  section: { padding: 18, borderRadius: 22, borderWidth: 1, gap: 15 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 4,
  },
  step: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#FFF0F7",
    alignItems: "center",
    justifyContent: "center",
  },
  bagLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  bagImage: {
    width: 58,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#FAF5F8",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 4,
  },
  confirmation: {
    padding: 25,
    borderRadius: 25,
    gap: 14,
    alignItems: "center",
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  orderTotal: { fontSize: 32, fontWeight: "800", letterSpacing: -1 },
});
