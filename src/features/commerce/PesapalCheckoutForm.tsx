import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api, ApiError } from "@/api/client";
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
import {
  loadBillingProfile,
  saveBillingProfile,
  validateBillingProfile,
} from "./billing-profile";
import { useBag } from "./store";
import { money, type CheckoutInput } from "./contracts";
import { distanceOptionsSchema, type DeliveryRouteQuote } from "./app-delivery";
import { HqDeliveryPicker } from "./HqDeliveryPicker";
import { CheckoutProgress } from "@/components/storefront/CheckoutProgress";

const quoteSchema = z.object({
  id: z.string(),
  total_minor: z.number(),
  subtotal_minor: z.number(),
  delivery_minor: z.number(),
  discount_minor: z.number(),
  tax_minor: z.number(),
});
const optionsSchema = z.object({
  distance_delivery: distanceOptionsSchema.optional(),
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
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);
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
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryRouteQuote | null>(
    null,
  );
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
  const [unresolvedCreation, setUnresolvedCreation] = useState(false);
  const recoveryFailed = useRef(false);
  const key = `cakecity.app-checkout.${owner}`;
  const fingerprint = JSON.stringify({
    lines,
    billing,
    fulfilment,
    zone,
    deliveryQuote,
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
    if (
      options.data?.pickup_enabled &&
      !options.data.delivery_zones.length &&
      !options.data.distance_delivery?.enabled
    )
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
        const value = z
          .object({
            owner: z.string(),
            attempt: z.object({
              quote_id: z.string().uuid(),
              key: z.string().min(16).max(80),
              fingerprint: z.string(),
            }),
            reference: z.string().regex(/^APP-/).optional(),
          })
          .parse(JSON.parse(saved));
        if (value.owner !== owner)
          throw new Error("Checkout recovery belongs to another account.");
        attempt.current = value.attempt;
        if (alive.current) setUnresolvedCreation(true);
        if (value.reference) {
          const recovered = await appOrders.detail(value.reference);
          if (alive.current) {
            setOrder(recovered);
            setUnresolvedCreation(false);
          }
        } else if (value.attempt?.key) {
          if (alive.current) setUnresolvedCreation(true);
          const recovery = z
            .object({ order: appOrderSchema.nullable() })
            .parse(
              await api.get(
                `/v1/app-checkout/recovery?request_key=${encodeURIComponent(value.attempt.key)}`,
                { auth: true },
              ),
            );
          if (alive.current && recovery.order) {
            setOrder(recovery.order);
            setUnresolvedCreation(false);
          } else if (!recovery.order) {
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
    if (unresolvedCreation) {
      setError(
        "Recover the existing order request before reviewing another checkout.",
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const requirements = {
        address:
          fulfilment === "pickup"
            ? ("none" as const)
            : options.data?.distance_delivery?.enabled
              ? ("street" as const)
              : ("full" as const),
        postcode: false,
      };
      const valid = validateBillingProfile(billing, requirements);
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
            delivery_quote_id: deliveryQuote?.id || null,
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
      void saveBillingProfile(owner, valid, requirements).catch(() => {});
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
  async function resumeCreation() {
    if (flight.current || !attempt.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const current = appOrderSchema.parse(
        await api.post(
          "/v1/app-orders",
          { quote_id: attempt.current.quote_id },
          { auth: true, headers: { "Idempotency-Key": attempt.current.key } },
        ),
      );
      if (!alive.current) return;
      setOrder(current);
      setUnresolvedCreation(false);
      setRestored(true);
      recoveryFailed.current = false;
      await setStorageItem(
        key,
        JSON.stringify({
          owner,
          attempt: attempt.current,
          reference: current.reference,
        }),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && attempt.current) {
        try {
          const recovered = z
            .object({ order: appOrderSchema.nullable() })
            .parse(
              await api.get(
                `/v1/app-checkout/recovery?request_key=${encodeURIComponent(attempt.current.key)}`,
                { auth: true },
              ),
            );
          if (recovered.order) {
            if (alive.current) {
              setOrder(recovered.order);
              setUnresolvedCreation(false);
              setRestored(true);
            }
          } else {
            await deleteStorageItem(key);
            attempt.current = null;
            if (alive.current) {
              setQuote(null);
              setUnresolvedCreation(false);
              setRestored(true);
              recoveryFailed.current = false;
            }
          }
        } catch {
          /* Keep the original recovery record when its outcome is unknown. */
        }
      }
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "The existing order could not be recovered. Try recovery again before another payment.",
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
        setUnresolvedCreation(true);
        current = appOrderSchema.parse(
          await api.post(
            "/v1/app-orders",
            { quote_id: attempt.current.quote_id },
            { auth: true, headers: { "Idempotency-Key": attempt.current.key } },
          ),
        );
        if (alive.current) {
          setOrder(current);
          setUnresolvedCreation(false);
        }
        await setStorageItem(
          key,
          JSON.stringify({
            owner,
            attempt: attempt.current,
            reference: current.reference,
          }),
        );
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
          colors={[colors.brandLight, colors.surface]}
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
  if (unresolvedCreation)
    return (
      <View style={{ gap: 16 }}>
        <Notice message="Your order request has been saved. Recover that same request before starting another checkout." />
        {error ? <Notice error message={error} /> : null}
        <Button
          label="Recover existing order request"
          disabled={busy}
          loading={busy}
          onPress={() => void resumeCreation()}
        />
        <Button
          variant="outline"
          label="View app orders"
          onPress={() => router.push("/orders")}
        />
      </View>
    );
  return (
    <View style={{ gap: 18 }}>
      <CheckoutProgress current={quote ? 2 : 1} />
      <LinearGradient
        colors={["#930052", "#B80068", "#DB218D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={checkoutStyles.intro}
      >
        <View style={checkoutStyles.heroTop}>
          <View style={checkoutStyles.heroCopy}>
            <Text style={checkoutStyles.heroEyebrow}>
              BAKED FOR YOUR MOMENT
            </Text>
            <Text style={checkoutStyles.introTitle}>Almost yours.</Text>
            <Text style={checkoutStyles.heroSubtitle}>
              Add your details, choose delivery, then review before paying.
            </Text>
          </View>
          {lines[0]?.image ? (
            <View style={checkoutStyles.heroImageFrame}>
              <Image
                source={{ uri: lines[0].image }}
                contentFit="contain"
                style={checkoutStyles.heroImage}
              />
            </View>
          ) : (
            <Ionicons
              accessible={false}
              name="gift-outline"
              size={46}
              color="#FFFFFF"
            />
          )}
        </View>
        <View style={checkoutStyles.heroFooter}>
          <View style={checkoutStyles.secure}>
            <Ionicons name="bag-handle-outline" color="#FFFFFF" size={15} />
            <Text style={checkoutStyles.heroMeta}>
              {itemCount} {itemCount === 1 ? "item" : "items"} in your bag
            </Text>
          </View>
          <View style={checkoutStyles.secure}>
            <Ionicons name="lock-closed-outline" color="#FFFFFF" size={14} />
            <Text style={checkoutStyles.heroMeta}>Secured by Pesapal</Text>
          </View>
        </View>
      </LinearGradient>
      <View
        style={[
          checkoutStyles.quoteHint,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
          },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Bag subtotal · {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 22, fontWeight: "800" }}>
            {money(
              lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
            )}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Delivery and discounts confirmed before payment.
          </Text>
        </View>
        <Button
          variant="ghost"
          label="Edit bag"
          onPress={() => router.push("/cart")}
        />
      </View>
      {!lines.length ? <Notice message="Your bag is empty." /> : null}
      <View style={checkoutStyles.columns}>
        <View style={checkoutStyles.mainColumn}>
          <CheckoutSection
            step="01"
            title="Your details"
            subtitle="For your order updates and payment receipt."
          >
            <View style={checkoutStyles.contactGrid}>
              {Object.entries({
                firstName: "First name",
                lastName: "Last name",
                email: "Email",
                phone: "Phone",
              }).map(([field, label]) => (
                <View
                  key={field}
                  style={
                    field === "firstName" || field === "lastName"
                      ? checkoutStyles.nameField
                      : checkoutStyles.fullField
                  }
                >
                  <Input
                    label={label}
                    style={{
                      backgroundColor: colors.background,
                      borderRadius: 14,
                    }}
                    keyboardType={
                      field === "phone"
                        ? "phone-pad"
                        : field === "email"
                          ? "email-address"
                          : "default"
                    }
                    autoCapitalize={field === "email" ? "none" : "words"}
                    value={billing[field as keyof typeof billing]}
                    onChangeText={(value) =>
                      setBilling((b) => ({ ...b, [field]: value }))
                    }
                  />
                </View>
              ))}
            </View>
          </CheckoutSection>
          <CheckoutSection
            step="02"
            title="How should it arrive?"
            subtitle="Delivered to your door or collected from a branch."
          >
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Pickup or delivery"
              style={checkoutStyles.fulfilmentChoices}
            >
              {options.data?.delivery_zones.length ||
              options.data?.distance_delivery?.enabled ? (
                <FulfilmentChoice
                  title="Delivery"
                  description="To your doorstep"
                  icon="bicycle-outline"
                  selected={fulfilment === "delivery"}
                  onPress={() => {
                    if (fulfilment !== "delivery") {
                      setDeliveryQuote(null);
                      setFulfilment("delivery");
                    }
                  }}
                />
              ) : null}
              {options.data?.pickup_enabled ? (
                <FulfilmentChoice
                  title="Pickup"
                  description="From a Cake City branch"
                  icon="storefront-outline"
                  selected={fulfilment === "pickup"}
                  onPress={() => {
                    if (fulfilment !== "pickup") {
                      setDeliveryQuote(null);
                      setFulfilment("pickup");
                    }
                  }}
                />
              ) : null}
            </View>
            {fulfilment === "pickup" && options.data?.pickup_instructions ? (
              <Notice message={options.data.pickup_instructions} />
            ) : null}
            {options.data?.distance_delivery?.enabled ? (
              <HqDeliveryPicker
                options={options.data.distance_delivery}
                fulfilment={fulfilment}
                onChange={setDeliveryQuote}
                onAddressSelect={(address) =>
                  setBilling((previous) => ({ ...previous, address }))
                }
              />
            ) : null}
            {fulfilment === "delivery" ? (
              <>
                <Input
                  label="Building, street and apartment / delivery entrance"
                  value={billing.address}
                  onChangeText={(address) =>
                    setBilling((b) => ({ ...b, address }))
                  }
                />
                {options.data?.distance_delivery?.enabled ? (
                  <Disclosure title="Additional address details (optional)">
                    {(["area", "city", "postcode"] as const).map((field) => (
                      <Input
                        key={field}
                        label={
                          field === "postcode"
                            ? "Postal code (optional)"
                            : field === "city"
                              ? "City"
                              : "Area"
                        }
                        value={billing[field]}
                        onChangeText={(value) =>
                          setBilling((b) => ({ ...b, [field]: value }))
                        }
                      />
                    ))}
                  </Disclosure>
                ) : (
                  <>
                    <Input
                      label="Area"
                      value={billing.area}
                      onChangeText={(area) =>
                        setBilling((b) => ({ ...b, area }))
                      }
                    />
                    <Input
                      label="City"
                      value={billing.city}
                      onChangeText={(city) =>
                        setBilling((b) => ({ ...b, city }))
                      }
                    />
                  </>
                )}
              </>
            ) : null}
            {fulfilment === "delivery" &&
            !options.data?.distance_delivery?.enabled
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
            !options.data.distance_delivery?.enabled &&
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
        </View>
        <View style={checkoutStyles.summaryColumn}>
          <CheckoutSection
            step="03"
            title="Your order"
            subtitle="Made to order, with your chosen details."
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
                  <Text
                    style={{
                      color: colors.brandStrong,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  >
                    {money(line.price * line.quantity)}
                  </Text>
                  {line.selection.variation_attributes?.length ? (
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {line.selection.variation_attributes
                        .map((a) => `${a.attribute}: ${a.value}`)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            <Button
              variant="ghost"
              label="Edit shopping bag"
              onPress={() => router.push("/cart")}
            />
          </CheckoutSection>
          {error ? <Notice error message={error} /> : null}
          <CheckoutSection
            step="04"
            title="The sweet total"
            subtitle="Review your total, then pay securely."
          >
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
                  style={[
                    checkoutStyles.totalRow,
                    { borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 19,
                      color: colors.ink,
                    }}
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
              </>
            ) : (
              <View
                style={[
                  checkoutStyles.quoteHint,
                  { backgroundColor: colors.brandLight },
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={26}
                  color={colors.brandStrong}
                />
                <Text
                  style={{
                    flex: 1,
                    color: colors.cocoa,
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  Your final total will appear here after we confirm your
                  details and{" "}
                  {fulfilment === "pickup" ? "pickup fee" : "delivery fee"}.
                </Text>
              </View>
            )}
            <Button
              size="lg"
              style={checkoutStyles.payButton}
              icon={
                <Ionicons
                  name={quote ? "lock-closed-outline" : "arrow-forward"}
                  color="#FFFFFF"
                  size={18}
                />
              }
              label={
                quote
                  ? `Pay ${money(quote.total_minor / 100)}`
                  : "Review confirmed total"
              }
              loading={busy}
              disabled={
                busy ||
                !restored ||
                !lines.length ||
                options.isPending ||
                options.isError ||
                (options.data?.distance_delivery?.enabled && !deliveryQuote) ||
                !(
                  options.data?.pickup_enabled ||
                  options.data?.distance_delivery?.enabled ||
                  options.data?.delivery_zones.length
                )
              }
              onPress={() => void (quote ? pay() : review())}
            />
            <View style={checkoutStyles.secure}>
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={colors.muted}
              />
              <Text
                style={{
                  flex: 1,
                  color: colors.muted,
                  fontSize: 11,
                  lineHeight: 17,
                }}
              >
                Your payment, order tracking and receipt stay in the app.
              </Text>
            </View>
          </CheckoutSection>
        </View>
      </View>
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
        <View
          style={[checkoutStyles.step, { backgroundColor: colors.brandLight }]}
        >
          <Ionicons
            name={
              step === "01"
                ? "person-outline"
                : step === "02"
                  ? "location-outline"
                  : step === "03"
                    ? "bag-handle-outline"
                    : "wallet-outline"
            }
            size={21}
            color={colors.brandStrong}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}
          >
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

function FulfilmentChoice({
  title,
  description,
  icon,
  selected,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        checkoutStyles.choice,
        {
          backgroundColor: selected ? colors.brandLight : colors.background,
          borderColor: selected ? colors.brandStrong : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={checkoutStyles.choiceTop}>
        <Ionicons
          name={icon}
          size={25}
          color={selected ? colors.brandStrong : colors.muted}
        />
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={20}
          color={selected ? colors.brandStrong : colors.muted}
        />
      </View>
      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 15 }}>
        {title}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>
        {description}
      </Text>
    </Pressable>
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
  intro: { padding: 22, borderRadius: 26, gap: 20, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroCopy: { flex: 1, gap: 9 },
  heroEyebrow: {
    color: "#FFE1F0",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  introTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  heroSubtitle: { color: "#FFE1F0", fontSize: 12, lineHeight: 18 },
  heroImageFrame: {
    width: 82,
    height: 96,
    borderRadius: 22,
    padding: 5,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "6deg" }],
  },
  heroImage: { width: "100%", height: "100%", borderRadius: 17 },
  heroFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.25)",
    paddingTop: 15,
  },
  heroMeta: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  columns: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 18,
  },
  mainColumn: {
    flexBasis: 420,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 18,
  },
  summaryColumn: {
    flexBasis: 300,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 18,
  },
  contactGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  nameField: { flexBasis: 120, flexGrow: 1, minWidth: 0 },
  fullField: { width: "100%" },
  fulfilmentChoices: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    flexBasis: 125,
    flexGrow: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  choiceTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  quoteHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 16,
  },
  payButton: { borderRadius: 16 },
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
  secure: { flexDirection: "row", alignItems: "center", gap: 7 },
  section: {
    padding: 18,
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    boxShadow: "0px 4px 20px rgba(73, 30, 51, 0.04)",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 4,
  },
  step: {
    width: 42,
    height: 42,
    borderRadius: 15,
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
    width: 72,
    height: 80,
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
