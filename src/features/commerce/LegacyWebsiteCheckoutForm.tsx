import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, View, Switch, Pressable } from "react-native";
import { Disclosure } from "@/components/ui/Disclosure";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { trackCommerceEvent } from "@/observability/commerce-events";
import {
  Feedback,
  Notice,
  Screen,
  Section,
  ui as baseUi,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { CheckoutProgress } from "@/components/storefront/CheckoutProgress";
import { Input } from "@/components/ui/Input";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import {
  loadBillingProfile,
  saveBillingProfile,
  validateBillingProfile,
} from "./billing-profile";
import { money, type CheckoutInput, type BagLine } from "./contracts";
import { DeliveryLocationPicker } from "./DeliveryLocationPicker";
import { useBag } from "./store";
import { selectCouponCode, useCouponWallet } from "./coupon-wallet";
import {
  cartHasRequestedCoupon,
  normalizeCouponCode,
  websiteCartItemsMatch,
} from "./website-cart";
import {
  prepareWebsiteCheckoutCart,
  setWebsiteCartCoupon,
  submitWebsiteCheckout,
  websiteCartTotal,
  type WebsiteCheckoutSession,
  websiteOrderUrl,
  websitePaymentRedirect,
  type WebsiteCheckoutDetails,
  type WebsiteCheckoutResult,
} from "./website-checkout";
import {
  clearWebsiteCheckoutSession,
  clearWebsitePaymentAttempt,
  loadWebsitePaymentAttempt,
  saveWebsitePaymentAttempt,
  websiteCheckoutFingerprint,
  websiteCheckoutOwnerScope,
} from "./website-checkout-session";
import { saveWebsiteOrder } from "./website-order-history";
import {
  quotePesapalCheckout,
  submitPesapalCheckout,
  verifyPesapalCheckout,
} from "./pesapal-checkout";

type StartedCheckout = {
  order: WebsiteCheckoutResult;
  paymentUrl: string | null;
  items: CheckoutInput["items"];
};

const purchasedItems = (lines: BagLine[]): CheckoutInput["items"] =>
  lines.map((line) => ({
    product_slug: line.slug,
    quantity: line.quantity,
    ...line.selection,
  }));

function checkoutError(details: WebsiteCheckoutDetails) {
  try {
    validateBillingProfile(details);
  } catch (reason) {
    return reason instanceof Error
      ? reason.message
      : "Check your billing details.";
  }
  if (
    details.gift &&
    (!details.gift.firstName.trim() || !details.gift.lastName.trim())
  )
    return "Enter the recipient's first and last name.";
  if (
    details.gift &&
    !/^(?:\+?254|0)[17]\d{8}$/.test(details.gift.phone.replace(/\s/g, ""))
  )
    return "Enter a valid Kenyan phone number for the recipient.";
  return null;
}

// Shared cart/billing/recovery UI. The live app selects the server-side provider.
export function LegacyWebsiteCheckoutForm({
  paymentProvider = "website",
}: {
  paymentProvider?: "website" | "pesapal";
} = {}) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const ui = useThemedStyles(baseUi);
  const themedUi = ui;
  const wallet = useCouponWallet(customer?.id);
  const lines = useBag((state) => state.lines);
  const settleBag = useBag((state) => state.settle);
  const [firstName, setFirstName] = useState(customer?.first_name ?? "");
  const [lastName, setLastName] = useState(customer?.last_name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Nairobi");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [isGift, setIsGift] = useState(false);
  const [recipientFirst, setRecipientFirst] = useState("");
  const [recipientLast, setRecipientLast] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const deliveryEdited = useRef(false);
  const contactEdited = useRef(false);
  const [error, setError] = useState("");
  const [couponDraft, setCouponDraft] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [couponCart, setCouponCart] = useState<{
    fingerprint: string;
    session: WebsiteCheckoutSession;
  } | null>(null);
  const couponFlight = useRef(false);
  const paymentFlight = useRef(false);
  const verificationFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [started, setStarted] = useState<StartedCheckout | null>(null);
  const [paymentAttemptRestored, setPaymentAttemptRestored] = useState(false);
  const autoPreparedFingerprint = useRef<string | null>(null);
  const previousOwnerScope = useRef<string | null | undefined>(undefined);
  const ownerScope = websiteCheckoutOwnerScope(customer?.id);
  const fingerprint = websiteCheckoutFingerprint(lines, ownerScope);
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;

  async function checkPaymentStatus(attempt = started) {
    if (
      !attempt ||
      attempt.order.payment_provider !== "pesapal-api3" ||
      verificationFlight.current
    )
      return;
    verificationFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const order = await verifyPesapalCheckout(
        attempt.order,
        attempt.order.billing_email || email,
      );
      if (!mounted.current || currentFingerprint.current !== fingerprint)
        return;
      setStarted({
        ...attempt,
        order,
        paymentUrl: websitePaymentRedirect(order),
      });
      await Promise.all([
        saveWebsitePaymentAttempt(fingerprint, order, ownerScope),
        saveWebsiteOrder(order, order.billing_email || email, ownerScope),
      ]);
      if (order.payment_state === "failed")
        setError(
          "Payment was unsuccessful. Your shopping bag has been kept. Contact Cake City before starting another payment.",
        );
      if (order.payment_state === "reversed")
        setError(
          "Your payment was reversed. Contact Cake City to review this order.",
        );
    } catch (reason) {
      if (mounted.current && currentFingerprint.current === fingerprint)
        setError(
          reason instanceof Error
            ? reason.message
            : "Payment could not be confirmed. Do not pay again while confirmation is pending.",
        );
    } finally {
      verificationFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Payment is verified on return to the app, including after a process restart.
  useEffect(() => {
    if (paymentProvider !== "pesapal" || !started) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkPaymentStatus();
    });
    return () => subscription.remove();
  }, [paymentProvider, started, email, fingerprint]);

  const checkPaymentStatusRef = useRef(() => {
    void checkPaymentStatus();
  });
  checkPaymentStatusRef.current = () => {
    void checkPaymentStatus();
  };
  useFocusEffect(
    useCallback(() => {
      if (paymentProvider === "pesapal") checkPaymentStatusRef.current();
    }, [paymentProvider, fingerprint]),
  );
  const cartMutation = useMutation<WebsiteCheckoutSession, Error>({
    mutationKey: ["website-checkout-cart", fingerprint],
    mutationFn: () =>
      prepareWebsiteCheckoutCart(lines, fingerprint, ownerScope),
    retry: false,
  });

  // Mutation results are scoped to the exact bag that started them. A cart
  // built for a previous quantity or variation can never authorize payment.
  const cart =
    cartMutation.data && autoPreparedFingerprint.current === fingerprint
      ? couponCart?.fingerprint === fingerprint
        ? couponCart.session
        : cartMutation.data
      : null;
  const total = cart ? websiteCartTotal(cart.cart) : null;
  const couponConfirmed = Boolean(
    cart && cartHasRequestedCoupon(cart.cart, wallet.selected),
  );
  const couponDraftChanged =
    couponDraft.trim().toLowerCase() !== (wallet.selected ?? "");
  const couponBlocked =
    couponBusy ||
    Boolean(couponError) ||
    !couponConfirmed ||
    couponDraftChanged;
  const details: WebsiteCheckoutDetails = {
    firstName,
    lastName,
    email,
    phone,
    address,
    area,
    city,
    postcode,
    notes,
    gift: isGift
      ? {
          firstName: recipientFirst,
          lastName: recipientLast,
          phone: recipientPhone,
          message: giftMessage,
        }
      : undefined,
  };

  useEffect(() => {
    setCouponDraft(wallet.selected ?? "");
  }, [wallet.selected, wallet.scope]);

  async function updateCoupon(remove = false) {
    if (!cart || couponFlight.current || busy) return;
    couponFlight.current = true;
    setCouponBusy(true);
    setCouponError("");
    try {
      const requested = remove ? null : normalizeCouponCode(couponDraft);
      // Selection is a request, never evidence that the website accepted it.
      await selectCouponCode(wallet.scope, requested);
      const verified = await setWebsiteCartCoupon(
        cart,
        requested,
        fingerprint,
        ownerScope,
      );
      if (currentFingerprint.current !== fingerprint) return;
      setCouponCart({ fingerprint, session: verified });
      setCouponDraft(requested ?? "");
    } catch (reason) {
      if (currentFingerprint.current === fingerprint)
        setCouponError(
          reason instanceof Error
            ? reason.message
            : "Your coupon could not be verified. Try again or remove it before payment.",
        );
    } finally {
      couponFlight.current = false;
      if (currentFingerprint.current === fingerprint) setCouponBusy(false);
    }
  }

  // A restored or newly completed login can arrive after this screen mounts.
  // Preserve anything the customer has already edited, while filling only blank
  // billing contact fields from the authenticated account.
  useEffect(() => {
    if (!customer) return;
    setFirstName((current) => current || customer.first_name);
    setLastName((current) => current || customer.last_name);
    setEmail((current) => current || customer.email);
    setPhone((current) => current || customer.phone || "");
  }, [customer]);

  // A sign-in/out can occur while this screen is mounted. Do not leave an old
  // account's handoff, contact fields, or private order link on screen for the
  // next person using the device. The bag remains intentionally local.
  useEffect(() => {
    if (previousOwnerScope.current === undefined) {
      previousOwnerScope.current = ownerScope;
      return;
    }
    if (previousOwnerScope.current === ownerScope) return;
    previousOwnerScope.current = ownerScope;
    setStarted(null);
    setPaymentAttemptRestored(false);
    setFirstName(customer?.first_name ?? "");
    setLastName(customer?.last_name ?? "");
    setEmail(customer?.email ?? "");
    setPhone(customer?.phone ?? "");
    deliveryEdited.current = false;
    setProfileReady(false);
    setAddress("");
    setArea("");
    setCity("Nairobi");
    setPostcode("");
    setNotes("");
    setIsGift(false);
    setRecipientFirst("");
    setRecipientLast("");
    setRecipientPhone("");
    setGiftMessage("");
    void Promise.all([
      clearWebsiteCheckoutSession(),
      clearWebsitePaymentAttempt(),
    ]).catch(() => undefined);
  }, [customer, ownerScope]);

  // Returning from Billing details refreshes this still-mounted checkout.
  // Preserve fields already edited here while restoring the saved profile.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setProfileReady(false);
      if (!customer?.id) {
        setProfileReady(true);
        return;
      }
      void loadBillingProfile(customer.id)
        .then((profile) => {
          if (!active || !profile) return;
          if (!contactEdited.current) {
            setFirstName(profile.firstName);
            setLastName(profile.lastName);
            setEmail(profile.email);
            setPhone(profile.phone);
          }
          if (!deliveryEdited.current) {
            setAddress(profile.address);
            setArea(profile.area);
            setCity(profile.city || "Nairobi");
            setPostcode(profile.postcode);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setProfileReady(true);
        });
      return () => {
        active = false;
      };
    }, [customer?.id]),
  );

  // A Pesapal handoff may return to a fresh JavaScript process. Restore the
  // recorded order before preparing a new WooCommerce cart, so a foreground
  // event or app restart can never repost the same bag automatically.
  useEffect(() => {
    let active = true;
    setStarted(null);
    setPaymentAttemptRestored(false);
    void loadWebsitePaymentAttempt(fingerprint, ownerScope)
      .then((order) => {
        if (!active || !order) return;
        const recovered = {
          order,
          paymentUrl: websitePaymentRedirect(order),
          items: purchasedItems(lines),
        };
        setStarted(recovered);
        if (paymentProvider === "pesapal") void checkPaymentStatus(recovered);
      })
      .catch(() => {
        // A missing recovery record is not a checkout failure. The secure cart
        // preparation below remains the authoritative source of truth.
      })
      .finally(() => {
        if (active) setPaymentAttemptRestored(true);
      });
    return () => {
      active = false;
    };
  }, [fingerprint, ownerScope]);

  useEffect(() => {
    autoPreparedFingerprint.current = null;
    setCouponCart(null);
    setCouponError("");
    setCouponBusy(false);
    cartMutation.reset();
  }, [fingerprint]);

  useEffect(() => {
    if (
      !lines.length ||
      !paymentAttemptRestored ||
      started ||
      autoPreparedFingerprint.current === fingerprint
    )
      return;
    autoPreparedFingerprint.current = fingerprint;
    cartMutation.mutate();
  }, [
    cartMutation.mutate,
    fingerprint,
    lines.length,
    paymentAttemptRestored,
    started,
  ]);

  async function continueToPayment() {
    if (paymentFlight.current || started) return;
    const validation = checkoutError(details);
    if (validation) {
      setError(validation);
      return;
    }
    if (!cart) {
      setError("Your secure cart is not ready yet.");
      return;
    }
    if (couponBlocked) {
      setError(
        "Apply or remove your coupon and review the verified total before payment.",
      );
      return;
    }

    paymentFlight.current = true;
    setBusy(true);
    setError("");
    trackCommerceEvent("checkout_started", { line_count: lines.length });
    trackCommerceEvent("payment_started", {
      method: "pesapal",
      line_count: lines.length,
    });
    try {
      if (paymentProvider === "pesapal") {
        const quoted = await quotePesapalCheckout(
          cart,
          details,
          wallet.selected,
        );
        if (!mounted.current || currentFingerprint.current !== fingerprint)
          return;
        if (quoted.existingOrder) {
          const order = quoted.existingOrder;
          setStarted({
            order,
            paymentUrl: websitePaymentRedirect(order),
            items: purchasedItems(lines),
          });
          await Promise.all([
            saveWebsitePaymentAttempt(fingerprint, order, ownerScope),
            saveWebsiteOrder(order, order.billing_email, ownerScope),
          ]);
          return;
        }
        if (
          !websiteCartItemsMatch(quoted.cart, cart.cart.items) ||
          !cartHasRequestedCoupon(quoted.cart, wallet.selected)
        ) {
          setError(
            "Your cart items or coupon changed. Return to your bag and review them before payment.",
          );
          return;
        }
        if (quoted.cart.totals.total_price !== cart.cart.totals.total_price) {
          setCouponCart({ fingerprint, session: quoted });
          setError(
            "Cake City updated your delivery or order total. Review the total below, then tap Pay to confirm it.",
          );
          return;
        }
      }
      const order =
        paymentProvider === "pesapal"
          ? await submitPesapalCheckout(cart, details, wallet.selected)
          : await submitWebsiteCheckout(cart, details, wallet.selected);
      if (!mounted.current || currentFingerprint.current !== fingerprint) {
        // The order exists even if navigation or an account change made this
        // form stale. Retain its receipt under the captured account only.
        void saveWebsiteOrder(order, details.email, ownerScope).catch(
          () => undefined,
        );
        return;
      }
      if (customer) {
        void saveBillingProfile(customer.id, {
          firstName,
          lastName,
          email,
          phone,
          address,
          area,
          city,
          postcode,
        }).catch(() => {
          if (mounted.current)
            setError(
              "Your order has started, but billing details could not be saved. Open Manage billing details to save them again.",
            );
        });
      }
      const paymentUrl = websitePaymentRedirect(order);
      if (order.payment_result.redirect_url && !paymentUrl)
        setError(
          "Your order has started, but its payment link could not be verified. Use the official order update below.",
        );
      setStarted({ order, paymentUrl, items: purchasedItems(lines) });
      if (order.payment_result.payment_status === "success") {
        trackCommerceEvent("payment_success", { method: "pesapal" });
        trackCommerceEvent("order_completed", { method: "pesapal" });
      }
      try {
        await Promise.all([
          saveWebsiteOrder(order, details.email, ownerScope),
          saveWebsitePaymentAttempt(fingerprint, order, ownerScope),
        ]);
        await clearWebsiteCheckoutSession();
      } catch {
        // The WooCommerce order already exists at this point. Do not turn a
        // secure-storage issue into an invitation to submit payment again.
        setError(
          "Your Cake City order has started. Keep this screen open and use the order update if you need to return to payment.",
        );
      }
      if (paymentUrl) {
        if (!mounted.current || currentFingerprint.current !== fingerprint)
          return;
        try {
          await Linking.openURL(paymentUrl);
        } catch {
          setError(
            "Your secure payment page is ready. Use Return to secure payment below if it did not open automatically.",
          );
        }
      }
    } catch (reason) {
      if (!mounted.current || currentFingerprint.current !== fingerprint)
        return;
      trackCommerceEvent("payment_failed", { method: "pesapal" });
      setError(
        reason instanceof Error
          ? reason.message
          : "Cake City could not begin payment. Please try again.",
      );
    } finally {
      paymentFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!lines.length)
    return (
      <>
        <Feedback empty="Your bag is empty." />
        <Button
          label="Find your cake"
          onPress={() => router.replace("/(tabs)/shop")}
        />
      </>
    );

  if (!paymentAttemptRestored || cartMutation.isPending)
    return <Feedback loading />;

  if (cartMutation.isError)
    return (
      <>
        <Feedback
          error={cartMutation.error}
          onRetry={() => {
            cartMutation.reset();
            cartMutation.mutate();
          }}
        />
        <Button
          variant="outline"
          label="Return to bag"
          onPress={() => router.back()}
        />
      </>
    );

  if (started) {
    const receiptUrl = websiteOrderUrl(started.order);
    const awaitingPayment =
      started.order.payment_result.payment_status !== "success";
    return (
      <View style={{ gap: 20 }}>
        <CheckoutProgress current={2} />
        <View style={[ui.panel, { gap: 8 }]}>
          <Ionicons name="receipt-outline" size={28} color="#EC008C" />
          <Text style={ui.eyebrow}>CAKE CITY ORDER</Text>
          <Text style={ui.title}>Order {started.order.order_number}</Text>
          <Text style={ui.body}>
            {awaitingPayment
              ? "Your order is awaiting payment confirmation. Complete payment on the secure Pesapal page, then return here to check its status."
              : "Cake City has recorded your payment result. Open your order update for the latest status."}
          </Text>
        </View>
        {error ? <Notice error message={error} /> : null}
        {started.order.payment_provider === "pesapal-api3" ? (
          <Button
            label={busy ? "Checking payment…" : "Check payment status"}
            disabled={busy}
            onPress={() => void checkPaymentStatus()}
          />
        ) : null}
        {started.paymentUrl ? (
          <Button
            label="Return to secure payment"
            onPress={() => void Linking.openURL(started.paymentUrl!)}
          />
        ) : null}
        <Button
          variant="outline"
          label="Open order update"
          onPress={() => void Linking.openURL(receiptUrl)}
        />
        {ownerScope ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)/orders")}
            style={{
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.brandStrong, fontSize: 13 }}>
              View my orders
            </Text>
          </Pressable>
        ) : (
          <Notice message="For privacy on shared devices, keep your official Cake City order page or sign in before leaving this guest checkout." />
        )}
        {!awaitingPayment ? (
          <Pressable
            accessibilityRole="button"
            style={{
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
            onPress={() => {
              void clearWebsitePaymentAttempt().catch(() => undefined);
              void settleBag(
                `website-${started.order.order_id}`,
                started.items,
              );
              router.replace("/(tabs)");
            }}
          >
            <Text style={{ color: colors.brandStrong, fontSize: 13 }}>
              Continue shopping
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!cart) return <Feedback loading />;

  return (
    <View style={{ gap: 22 }}>
      <CheckoutProgress current={1} />

      <Section title="Contact details" />
      {customer ? (
        <View style={ui.row}>
          <Ionicons name="person-circle-outline" size={17} color="#EC008C" />
          <Text style={ui.body}>
            We filled the contact details available in your account.
          </Text>
        </View>
      ) : null}
      <Input
        autoComplete="given-name"
        label="First name"
        value={firstName}
        onChangeText={(value) => {
          contactEdited.current = true;
          setFirstName(value);
        }}
      />
      <Input
        autoComplete="family-name"
        label="Last name"
        value={lastName}
        onChangeText={(value) => {
          contactEdited.current = true;
          setLastName(value);
        }}
      />
      <Input
        autoComplete="email"
        label="Email address"
        value={email}
        onChangeText={(value) => {
          contactEdited.current = true;
          setEmail(value);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Input
        label="Phone number"
        value={phone}
        onChangeText={(value) => {
          contactEdited.current = true;
          setPhone(value);
        }}
        keyboardType="phone-pad"
        autoComplete="tel"
      />

      <View style={ui.spread}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={ui.heading}>Send as a gift</Text>
          <Text style={ui.body}>Deliver to someone special</Text>
        </View>
        <Switch
          accessibilityLabel="Send this order as a gift"
          value={isGift}
          onValueChange={(value) => {
            setIsGift(value);
            deliveryEdited.current = true;
            setAddress("");
            setArea("");
            setCity("Nairobi");
            setPostcode("");
          }}
          trackColor={{ true: colors.brand }}
        />
      </View>
      {isGift ? (
        <>
          <Input
            label="Recipient first name"
            value={recipientFirst}
            onChangeText={setRecipientFirst}
            maxLength={80}
          />
          <Input
            label="Recipient last name"
            value={recipientLast}
            onChangeText={setRecipientLast}
            maxLength={80}
          />
          <Input
            label="Recipient phone"
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
            maxLength={20}
          />
          <Input
            label="Gift message (optional)"
            value={giftMessage}
            onChangeText={setGiftMessage}
            multiline
            maxLength={300}
          />
          <Text style={ui.body}>
            Enter the recipient's delivery address below. Payment and order
            emails stay with you. Gift messages are sent as order notes; printed
            cards depend on the store.
          </Text>
        </>
      ) : null}
      <Section title="Delivery address" />
      <DeliveryLocationPicker
        key={wallet.scope}
        address={address}
        area={area}
        city={city}
        isGift={isGift}
        profileReady={profileReady}
        canAutofill={!deliveryEdited.current}
        recipientName={
          isGift
            ? [recipientFirst, recipientLast].filter(Boolean).join(" ")
            : [firstName, lastName].filter(Boolean).join(" ")
        }
        recipientPhone={isGift ? recipientPhone : phone}
        onChange={(value) => {
          deliveryEdited.current = true;
          setAddress(value.address);
          setArea(value.area);
          setCity(value.city || "Nairobi");
        }}
        onRecipientChange={(name, recipientNumber) => {
          const [first, ...rest] = name.split(/\s+/);
          setRecipientFirst(first);
          setRecipientLast(rest.join(" "));
          setRecipientPhone(recipientNumber);
        }}
      />
      <Input
        autoComplete="street-address"
        label="Building, street and apartment"
        value={address}
        onChangeText={(value) => {
          deliveryEdited.current = true;
          setAddress(value);
        }}
      />
      <Input
        autoComplete="address-line2"
        label="Area"
        value={area}
        onChangeText={(value) => {
          deliveryEdited.current = true;
          setArea(value);
        }}
      />
      <Input
        label="City"
        value={city}
        onChangeText={(value) => {
          deliveryEdited.current = true;
          setCity(value);
        }}
      />
      <Input
        label="Postal code"
        hint="Enter the five-digit postal code for this address."
        value={postcode}
        onChangeText={(value) => {
          deliveryEdited.current = true;
          setPostcode(value);
          setError("");
        }}
        autoComplete="postal-code"
        keyboardType="number-pad"
        maxLength={5}
      />
      <Disclosure title="Add a delivery note">
        <Input
          label="Order notes (optional)"
          value={notes}
          onChangeText={setNotes}
          maxLength={500}
        />
      </Disclosure>

      <Section title="Order summary" />
      {cart.cart.items.map((item) => (
        <View key={item.id} style={ui.spread}>
          <Text style={[ui.body, { flex: 1 }]}>
            {item.quantity} × {item.name}
          </Text>
        </View>
      ))}
      <Disclosure
        title={couponConfirmed ? "Promo code applied" : "Add a promo code"}
        defaultOpen={!!wallet.selected}
      >
        <Input
          label="Add a coupon"
          placeholder="Enter a Cake City code"
          value={couponDraft}
          onChangeText={setCouponDraft}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={100}
          editable={!busy && !couponBusy}
        />
        <Text style={themedUi.body}>
          {wallet.selected && !couponConfirmed
            ? "Your selected code still needs to be applied to this bag."
            : "Apply your code to check the discount."}
        </Text>
        <Button
          variant="outline"
          label="Apply coupon"
          loading={couponBusy}
          disabled={busy || couponBusy || !couponDraft.trim()}
          onPress={() => void updateCoupon()}
        />
        {wallet.selected || couponDraft || cart.cart.coupons.length ? (
          <Button
            variant="ghost"
            label="Remove coupon / continue without"
            disabled={busy || couponBusy}
            onPress={() => void updateCoupon(true)}
          />
        ) : null}
        {couponError ? <Notice error message={couponError} /> : null}
        {couponConfirmed && wallet.selected && !couponError ? (
          <Notice
            message={`Cake City confirmed coupon ${wallet.selected}. The verified total below includes its discount.`}
          />
        ) : null}
        {cart.cart.totals.total_discount &&
        Number(cart.cart.totals.total_discount) > 0 ? (
          <View style={themedUi.spread}>
            <Text style={themedUi.body}>Verified coupon savings</Text>
            <Text style={themedUi.heading}>
              {money(
                Number(cart.cart.totals.total_discount) /
                  10 ** cart.cart.totals.currency_minor_unit,
              )}
            </Text>
          </View>
        ) : null}
      </Disclosure>
      {couponBlocked ? (
        <Notice message="Open promo code above to apply or remove your selected code before payment." />
      ) : null}
      <View style={ui.panel}>
        <View style={ui.spread}>
          <Text style={ui.heading}>Verified total</Text>
          <Text style={ui.heading}>
            {total === null ? "Cake City will confirm" : money(total)}
          </Text>
        </View>
      </View>
      <Text style={ui.body}>
        Secure payment through Pesapal. Your order total is checked before
        payment.
      </Text>
      {error ? <Notice error message={error} /> : null}
      <Button
        label={
          total === null
            ? "Continue to secure payment"
            : `Pay ${money(total)} securely`
        }
        loading={busy}
        disabled={busy || couponBlocked}
        onPress={() => void continueToPayment()}
      />
    </View>
  );
}
