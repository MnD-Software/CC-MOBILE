import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  BagButton,
  Chip,
  FavouriteButton,
  Feedback,
  IconButton,
  ProductTile,
  Screen,
  Section,
  useToast,
} from "@/components/ui/Commerce";
import { CakeArtwork } from "@/components/ui/ReferenceArtwork";
import { tokens } from "@/theme/tokens";
import { shopApi } from "./api";
import {
  checkoutBlock,
  money,
  plainText,
  productPrice,
  type CakeSelection,
  type CheckoutInput,
} from "./contracts";
import {
  referenceBackendSlug,
  referenceCake,
  referenceCakes,
} from "./reference-catalogue";
import { VariationPicker } from "./VariationPicker";
import { useBag, usePreferences } from "./store";

const sizes = ["1kg", "1.5kg", "2kg"] as const;

export function ProductScreen() {
  const { id, slug } = useLocalSearchParams<{ id: string; slug?: string }>();
  const reference = referenceCake(slug ?? id);
  const defaultFlavor = reference?.slug.includes("red-velvet")
    ? "Red Velvet"
    : reference?.slug.includes("vanilla")
      ? "Vanilla"
      : reference?.slug.includes("biscoff")
        ? "Lotus Biscoff"
        : "Chocolate";
  const flavors = Array.from(
    new Set([defaultFlavor, "Chocolate", "Vanilla", "Red Velvet"]),
  );
  const toast = useToast();
  const branch = usePreferences((state) => state.branch);
  const add = useBag((state) => state.add);
  const remember = usePreferences((state) => state.view);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const viewportWidth = Math.min(width, 600);
  const galleryHeight = viewportWidth * 0.98;
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState<CakeSelection["size"]>("1kg");
  const [flavor, setFlavor] = useState("Chocolate");
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<number>();
  const [activeImage, setActiveImage] = useState(0);
  const [availabilityRequested, setAvailabilityRequested] = useState(false);

  const product = useQuery({
    queryKey: ["product", id, slug],
    queryFn: ({ signal }) => {
      const lookupSlug = reference ? referenceBackendSlug(reference.id) : slug;
      return lookupSlug
        ? shopApi
            .products({ slug: lookupSlug }, signal)
            .then(
              (result) =>
                result.data.find((item) => item.slug === lookupSlug) ?? null,
            )
        : shopApi.product(id, signal);
    },
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  const p = reference ?? product.data;
  const orderable = product.data;
  useEffect(() => {
    setQuantity(1);
    setSize("1kg");
    setMessage("");
    setVariant(undefined);
    setActiveImage(0);
    setAvailabilityRequested(false);
    setFlavor(defaultFlavor);
  }, [id, slug]);
  useEffect(() => {
    if (p) remember(p.slug);
  }, [p?.slug, remember]);

  const input: CheckoutInput = {
    items: orderable
      ? [
          {
            product_slug: orderable.slug,
            quantity,
            size,
            message,
            add_ons: [],
            variation_id: variant,
          },
        ]
      : [],
    fulfilment: "pickup",
    branch_id: branch?.id,
  };
  const [quoteInput, setQuoteInput] = useState(input);
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    const timer = setTimeout(() => setQuoteInput(input), 350);
    return () => clearTimeout(timer);
  }, [inputKey]);
  const quote = useQuery({
    queryKey: ["product-quote", quoteInput],
    queryFn: ({ signal }) => shopApi.quote(quoteInput, signal),
    enabled: quoteInput.items.length > 0,
    staleTime: 15000,
  });

  if (!p)
    return (
      <Screen title="Product Details" back>
        <Feedback
          loading={product.isPending}
          error={product.error}
          empty={
            !product.isPending && !product.error
              ? "This cake is currently unavailable."
              : undefined
          }
          onRetry={() => void product.refetch()}
        />
      </Screen>
    );

  const currentQuote =
    inputKey === JSON.stringify(quoteInput) && quote.isSuccess;
  const quoteProblem =
    currentQuote && quote.data
      ? checkoutBlock(input, quote.data, null)
      : "Please wait while we confirm availability and your price.";
  const variationBlocked =
    orderable?.type === "variable" &&
    (!variant || !config.data?.capabilities.variation_checkout);
  // A display reference is never an orderable product. Its exact backend record
  // and accepted configuration must exist before it can enter a real cart.
  const referenceBlocked =
    !!reference &&
    (!quote.data?.accepted_configuration ||
      (flavor !== defaultFlavor && !variant));
  const canAdd =
    !!orderable?.is_in_stock &&
    !!orderable.is_purchasable &&
    !quoteProblem &&
    !variationBlocked &&
    !referenceBlocked &&
    currentQuote;
  const price =
    currentQuote && quote.data
      ? quote.data.lines[0].unit_price
      : productPrice(p);

  function addToCart() {
    if (!p) return;
    if (!canAdd || !quote.data || !orderable) {
      setAvailabilityRequested(true);
      toast(
        !orderable
          ? "This reference cake is not available to order yet. Cake City needs to confirm its catalogue listing."
          : variationBlocked
            ? "Choose an available cake option before adding to your cart."
            : quote.error
              ? "We could not confirm your price. Please try again."
              : referenceBlocked
                ? "Cake City needs to confirm this cake design and flavor before it can be ordered."
                : (quoteProblem ?? "This cake is currently unavailable."),
      );
      if (orderable) void quote.refetch();
      else void product.refetch();
      return;
    }
    const block = checkoutBlock(input, quote.data, null);
    if (block) {
      toast(block);
      void quote.refetch();
      return;
    }
    add({
      key: "",
      slug: orderable.slug,
      name: plainText(p.name),
      image: orderable.images[0]?.src ?? null,
      price: quote.data.lines[0].unit_price,
      quantity,
      selection: { size, message, add_ons: [], variation_id: variant },
    });
    toast("Added to your cart.");
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.layout}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <View
              style={[
                styles.gallery,
                { width: viewportWidth, height: galleryHeight },
              ]}
            >
              <LinearGradient
                colors={["#F4C2CF", "#F8D3DB", "#D78B9E"]}
                style={StyleSheet.absoluteFill}
              />
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={({ nativeEvent }) =>
                  setActiveImage(
                    Math.round(nativeEvent.contentOffset.x / viewportWidth),
                  )
                }
                style={styles.galleryScroll}
              >
                {p.images.length ? (
                  p.images.map((image) => (
                    <View
                      key={image.id}
                      style={{
                        width: viewportWidth,
                        height: galleryHeight - 78,
                      }}
                    >
                      <CakeArtwork source={image.src} detail />
                    </View>
                  ))
                ) : (
                  <View
                    style={{
                      width: viewportWidth,
                      height: galleryHeight - 78,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="image-outline"
                      size={44}
                      color={tokens.color.cocoa}
                    />
                  </View>
                )}
              </ScrollView>
              <View style={styles.galleryHeader}>
                <IconButton
                  name="arrow-back"
                  label="Go back"
                  plain
                  onPress={() =>
                    router.canGoBack()
                      ? router.back()
                      : router.replace("/(tabs)/shop")
                  }
                />
                <Text accessibilityRole="header" style={styles.galleryTitle}>
                  Product Details
                </Text>
                <View style={styles.galleryActions}>
                  <FavouriteButton product={p} />
                  <BagButton />
                </View>
              </View>
              {p.images.length > 1 && (
                <View style={styles.dots}>
                  {p.images.map((image, index) => (
                    <View
                      key={image.id}
                      style={[
                        styles.dot,
                        index === activeImage && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>

            <View style={styles.detailsCard}>
              <View style={styles.badgeRow}>
                <Ionicons name="star-outline" size={14} color="#F7A200" />
                <Text style={styles.badgeText}>
                  {reference
                    ? "Bestseller"
                    : p.on_sale
                      ? "Special price"
                      : "Cake City favourite"}
                </Text>
              </View>
              <View>
                <View style={styles.titleRow}>
                  <Text style={styles.productTitle}>{plainText(p.name)}</Text>
                  {p.review_count > 0 && (
                    <View style={styles.rating}>
                      <Ionicons name="star" size={13} color="#F8AF00" />
                      <Text style={styles.ratingText}>
                        {p.average_rating} ({p.review_count} reviews)
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.price}>
                  {price !== null ? money(price) : "Price unavailable"}
                </Text>
              </View>

              {reference && !orderable?.variations.length ? (
                <>
                  <View style={styles.optionSection}>
                    <Text style={styles.optionLabel}>Size</Text>
                    <View style={styles.optionRow}>
                      {sizes.map((candidate) => (
                        <Chip
                          compact
                          key={candidate}
                          label={candidate.replace("kg", " Kg")}
                          selected={size === candidate}
                          onPress={() => setSize(candidate)}
                        />
                      ))}
                    </View>
                  </View>
                  <View style={styles.optionSection}>
                    <Text style={styles.optionLabel}>Flavor</Text>
                    <View style={styles.optionRow}>
                      {flavors.map((candidate) => (
                        <Chip
                          compact
                          key={candidate}
                          label={candidate}
                          selected={flavor === candidate}
                          onPress={() => setFlavor(candidate)}
                        />
                      ))}
                    </View>
                  </View>
                </>
              ) : orderable?.type === "variable" ? (
                <VariationPicker
                  key={orderable.id}
                  product={orderable}
                  onChange={setVariant}
                />
              ) : null}

              {!reference &&
                orderable?.type !== "variable" &&
                orderable?.attributes.some((attribute) =>
                  /size|weight/i.test(attribute.name),
                ) && (
                  <View style={styles.optionSection}>
                    <Text style={styles.optionLabel}>Size</Text>
                    <View style={styles.optionRow}>
                      {sizes
                        .filter((candidate) =>
                          orderable.attributes.some(
                            (attribute) =>
                              /size|weight/i.test(attribute.name) &&
                              attribute.terms.some(
                                (term) =>
                                  term.name.replace(/\s/g, "").toLowerCase() ===
                                  candidate,
                              ),
                          ),
                        )
                        .map((candidate) => (
                          <Chip
                            compact
                            key={candidate}
                            label={candidate.replace("kg", " Kg")}
                            selected={size === candidate}
                            onPress={() => setSize(candidate)}
                          />
                        ))}
                    </View>
                  </View>
                )}

              <View style={styles.optionSection}>
                <Text style={styles.optionLabel}>Add a Message (Optional)</Text>
                <TextInput
                  accessibilityLabel="Add a Message (Optional)"
                  placeholder="Happy Birthday!"
                  placeholderTextColor={tokens.color.cocoa}
                  value={message}
                  onChangeText={setMessage}
                  maxLength={32}
                  selectionColor={tokens.color.brandStrong}
                  style={styles.messageInput}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a branch for delivery availability"
                onPress={() => router.push("/branches")}
                style={styles.deliveryNote}
              >
                <Ionicons
                  name="alarm-outline"
                  size={24}
                  color={tokens.color.brandStrong}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryTitle}>
                    Delivery for your celebration
                  </Text>
                  <Text style={styles.deliveryCopy}>
                    {branch
                      ? "Ordering from " + branch.name
                      : "Choose a branch to confirm availability"}
                  </Text>
                </View>
              </Pressable>

              {availabilityRequested && (!canAdd || quote.error) && (
                <View style={styles.availabilityNote}>
                  <Text style={styles.availabilityText}>
                    {!orderable
                      ? "This reference cake needs a matching Cake City catalogue listing before ordering."
                      : quote.error
                        ? "We couldn't confirm availability. Please try adding again."
                        : (quoteProblem ??
                          "This configuration needs confirmation from Cake City.")}
                  </Text>
                </View>
              )}

              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionTitle}>About this cake</Text>
                <Text style={styles.description}>
                  {plainText(p.short_description || p.description) ||
                    "Ask Cake City for the latest product details."}
                </Text>
              </View>
              <Section title="You may also like" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {referenceCakes
                  .filter((item) => item.id !== p.id)
                  .map((item) => (
                    <ProductTile key={item.id} product={item} width={155} />
                  ))}
              </ScrollView>
            </View>
          </ScrollView>

          <View
            style={[
              styles.purchaseFooter,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.quantityControl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                disabled={quantity <= 1}
                onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                style={styles.quantityButton}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={tokens.color.brandStrong}
                />
              </Pressable>
              <Text
                accessibilityLabel={"Quantity " + quantity}
                style={styles.quantityValue}
              >
                {quantity}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                disabled={quantity >= 20}
                onPress={() => setQuantity((value) => Math.min(20, value + 1))}
                style={styles.quantityButton}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={tokens.color.brandStrong}
                />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to Cart"
              accessibilityState={{ busy: quote.isFetching }}
              onPress={addToCart}
              style={({ pressed }) => [
                styles.addButton,
                pressed && { opacity: 0.8 },
              ]}
            >
              <LinearGradient
                colors={["#D60060", "#CD0759"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {quote.isFetching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="bag-handle" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.addButtonText}>Add to Cart</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F4C2CF" },
  layout: { flex: 1, backgroundColor: tokens.color.background },
  gallery: {
    maxWidth: 600,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "#F5C9D5",
  },
  galleryScroll: {
    position: "absolute",
    top: 70,
    left: 0,
    right: 0,
    bottom: 8,
  },
  galleryHeader: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 16,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  galleryTitle: {
    position: "absolute",
    left: 54,
    right: 54,
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    pointerEvents: "none",
  },
  galleryActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  dots: { position: "absolute", right: 18, top: "54%", gap: 5 },
  dot: { width: 5, height: 9, borderRadius: 3, backgroundColor: "#FFFFFFB0" },
  dotActive: { backgroundColor: "#814354" },
  detailsCard: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    marginTop: -18,
    paddingHorizontal: 18,
    paddingTop: 23,
    paddingBottom: 24,
    gap: 15,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: tokens.color.background,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  badgeText: { color: tokens.color.brandStrong, fontSize: 11 },
  titleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  productTitle: {
    flex: 1,
    color: tokens.color.ink,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "700",
    letterSpacing: -0.45,
    maxWidth: 240,
  },
  price: {
    marginTop: 7,
    color: tokens.color.brandStrong,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingBottom: 2,
  },
  ratingText: { color: tokens.color.muted, fontSize: 12 },
  optionSection: { gap: 6 },
  optionLabel: {
    color: tokens.color.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  messageInput: {
    height: 34,
    paddingHorizontal: 11,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: "#E7D6DD",
    borderRadius: 10,
    color: tokens.color.ink,
    backgroundColor: "#FFF9FA",
    fontSize: 13,
  },
  deliveryNote: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 1,
  },
  deliveryTitle: {
    color: tokens.color.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  deliveryCopy: {
    marginTop: 2,
    color: tokens.color.cocoa,
    fontSize: 12,
    lineHeight: 16,
  },
  availabilityNote: {
    padding: 12,
    backgroundColor: tokens.color.brandLight,
    borderRadius: 10,
  },
  availabilityText: { color: tokens.color.cocoa, fontSize: 12, lineHeight: 18 },
  descriptionBlock: {
    gap: 7,
    paddingTop: 19,
    marginTop: 9,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  descriptionTitle: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  description: { color: tokens.color.muted, fontSize: 13, lineHeight: 20 },
  purchaseFooter: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: tokens.color.background,
  },
  quantityControl: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EDCFDB",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  quantityButton: {
    width: 37,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    minWidth: 28,
    color: tokens.color.ink,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  addButton: {
    flex: 1,
    minWidth: 0,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: tokens.color.brandStrong,
    overflow: "hidden",
  },
  addButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
