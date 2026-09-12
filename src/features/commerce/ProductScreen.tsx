import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
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
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import {
  BagButton,
  Chip,
  Feedback,
  IconButton,
  Notice,
  ProductTile,
  Screen,
  Section,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Input } from "@/components/ui/Input";
import { tokens } from "@/theme/tokens";
import { customerApi, shopApi } from "./api";
import {
  checkoutBlock,
  money,
  plainText,
  productPrice,
  variationLabel,
  type CakeSelection,
  type CheckoutInput,
} from "./contracts";
import { VariationPicker } from "./VariationPicker";
import { useBag, usePreferences } from "./store";

export function ProductScreen() {
  const { id, slug } = useLocalSearchParams<{ id: string; slug?: string }>();
  const { customer } = useAuth();
  const cache = useQueryClient();
  const toast = useToast();
  const branch = usePreferences((state) => state.branch);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const viewportWidth = Math.min(width, 900);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState<CakeSelection["size"]>("1kg");
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<number>();

  const product = useQuery({
    queryKey: ["product", id, slug],
    queryFn: ({ signal }) =>
      slug
        ? shopApi
            .products({ slug }, signal)
            .then((result) => result.data[0] ?? null)
        : shopApi.product(id, signal),
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  const favourites = useQuery({
    queryKey: ["favourites", customer?.id],
    queryFn: customerApi.favourites,
    enabled: !!customer,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: 15 * 60000,
  });

  const p = product.data;
  const accessories = categories.data?.find((category) =>
    /accessor|party supplies|candle|topper/i.test(category.name),
  );
  const related = useQuery({
    queryKey: ["related", accessories?.id ?? p?.categories[0]?.id],
    queryFn: ({ signal }) =>
      shopApi.products(
        {
          category: accessories?.id ?? p?.categories[0]?.id,
          orderby: "popularity",
        },
        signal,
      ),
    enabled: !!p,
  });
  const view = usePreferences((state) => state.view);
  const add = useBag((state) => state.add);

  useEffect(() => {
    if (p) view(p.slug);
  }, [p, view]);

  const input: CheckoutInput = {
    items: p
      ? [
          {
            product_slug: p.slug,
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

  useEffect(() => {
    const timer = setTimeout(() => setQuoteInput(input), 350);
    return () => clearTimeout(timer);
  }, [p?.slug, quantity, size, message, variant, branch?.id]);

  const quote = useQuery({
    queryKey: ["product-quote", quoteInput],
    queryFn: ({ signal }) => shopApi.quote(quoteInput, signal),
    enabled: quoteInput.items.length > 0,
    staleTime: 15000,
  });
  const favourite = useMutation({
    mutationFn: () =>
      customerApi.favourite(
        p!.slug,
        Boolean(favourites.data?.some((item) => item.slug === p!.slug)),
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["favourites"] });
      toast("Your favourites have been updated.");
    },
    onError: (error) => toast(error.message),
  });

  if (!p) {
    return (
      <Screen title="Product details" back>
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
  }

  const price = productPrice(p);
  const selectedVariation = p.variations.find((item) => item.id === variant);
  const variationBlocked =
    p.type === "variable" &&
    (!variant || !config.data?.capabilities.variation_checkout);
  const currentQuote =
    JSON.stringify(input) === JSON.stringify(quoteInput) && quote.isSuccess;
  const quoteProblem =
    currentQuote && quote.data
      ? checkoutBlock(input, quote.data, null)
      : "Your price is being confirmed.";
  const canAdd =
    !quoteProblem &&
    p.is_in_stock &&
    p.is_purchasable &&
    price !== null &&
    !variationBlocked &&
    currentQuote &&
    (!variant || quote.data?.accepted_configuration);
  const isFavourite = Boolean(
    favourites.data?.some((item) => item.slug === p.slug),
  );
  const displayedPrice =
    currentQuote && quote.data
      ? money(quote.data.total)
      : price !== null
        ? `${p.type === "variable" ? "From " : ""}${money(price)}`
        : "Price unavailable";

  function addToBag() {
    if (!canAdd || !quote.data || !p) return;
    const block = checkoutBlock(input, quote.data, null);
    if (block) {
      toast(block);
      void quote.refetch();
      return;
    }
    add({
      key: "",
      slug: p.slug,
      name:
        plainText(p.name) +
        (selectedVariation ? ` · ${variationLabel(p, selectedVariation)}` : ""),
      image: p.images[0]?.src ?? null,
      price: quote.data.lines[0].unit_price,
      quantity,
      selection: { size, message, add_ons: [], variation_id: variant },
    });
    toast("Added to your cart.");
  }

  function updateFavourite() {
    if (!customer) {
      router.push("/sign-in");
      return;
    }
    favourite.mutate();
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={styles.page}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.layout}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 28 }}
          >
            <View style={[styles.gallery, { width: viewportWidth }]}>
              {p.images.length ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                >
                  {p.images.map((image) => (
                    <Image
                      key={image.id}
                      source={image.src}
                      accessibilityLabel={image.alt || plainText(p.name)}
                      cachePolicy="memory-disk"
                      contentFit="contain"
                      contentPosition="center"
                      transition={180}
                      style={{ width: viewportWidth, height: 374 }}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.imageFallback}>
                  <Ionicons
                    name="image-outline"
                    size={44}
                    color={tokens.color.brandStrong}
                  />
                </View>
              )}

              <View style={styles.galleryHeader}>
                <IconButton
                  name="arrow-back"
                  label="Go back"
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
                  <IconButton
                    name={isFavourite ? "heart" : "heart-outline"}
                    label={
                      isFavourite
                        ? "Remove from favourites"
                        : "Save to favourites"
                    }
                    onPress={updateFavourite}
                  />
                  <BagButton />
                </View>
              </View>

              {p.images.length > 1 ? (
                <View style={styles.dots}>
                  {p.images.slice(0, 5).map((image, index) => (
                    <View
                      key={image.id}
                      style={[styles.dot, index === 0 && styles.dotActive]}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.detailsCard}>
              <View style={styles.badgeRow}>
                <Ionicons name="star" size={15} color="#F6A700" />
                <Text style={styles.badgeText}>
                  {p.on_sale ? "Special price" : "Cake City favourite"}
                </Text>
              </View>

              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productTitle}>{plainText(p.name)}</Text>
                  <Text style={styles.price}>{displayedPrice}</Text>
                </View>
                {p.review_count > 0 ? (
                  <View style={styles.rating}>
                    <Ionicons name="star" size={14} color="#F6A700" />
                    <Text style={styles.ratingText}>
                      {p.average_rating} ({p.review_count})
                    </Text>
                  </View>
                ) : null}
              </View>

              {p.type === "variable" ? (
                <View style={styles.optionSection}>
                  <Text style={styles.optionLabel}>Choose your cake</Text>
                  <VariationPicker
                    key={p.id}
                    product={p}
                    onChange={setVariant}
                  />
                  {!config.data?.capabilities.variation_checkout ? (
                    <Notice message="Cake City must confirm this variation price before it can be ordered in the app." />
                  ) : null}
                </View>
              ) : null}

              {p.attributes.some(
                (attribute) =>
                  /weight|size/i.test(attribute.name) &&
                  attribute.terms.some((term) =>
                    ["1kg", "1.5kg", "2kg"].includes(
                      term.name.replace(/\s/g, ""),
                    ),
                  ),
              ) && p.type !== "variable" ? (
                <View style={styles.optionSection}>
                  <Text style={styles.optionLabel}>Size</Text>
                  <View style={styles.optionRow}>
                    {(["1kg", "1.5kg", "2kg"] as const)
                      .filter((candidate) =>
                        p.attributes.some((attribute) =>
                          attribute.terms.some(
                            (term) =>
                              term.name.replace(/\s/g, "") === candidate,
                          ),
                        ),
                      )
                      .map((candidate) => (
                        <Chip
                          key={candidate}
                          label={candidate.replace("kg", " Kg")}
                          selected={size === candidate}
                          onPress={() => setSize(candidate)}
                        />
                      ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.optionSection}>
                <Input
                  label="Add a Message (Optional)"
                  placeholder="Happy Birthday!"
                  value={message}
                  onChangeText={setMessage}
                  maxLength={32}
                />
              </View>

              <View style={styles.deliveryNote}>
                <View style={styles.deliveryIcon}>
                  <Ionicons
                    name="time-outline"
                    size={19}
                    color={tokens.color.brandStrong}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deliveryTitle}>
                    Delivery availability is confirmed at checkout
                  </Text>
                  <Text style={styles.deliveryCopy}>
                    {branch
                      ? `Ordering from ${branch.name}`
                      : "Choose a branch for coverage, timing and fees"}
                  </Text>
                </View>
              </View>

              {quote.error ? (
                <Feedback
                  error={quote.error}
                  onRetry={() => void quote.refetch()}
                />
              ) : null}
              {!p.is_in_stock ? (
                <Notice message="This cake is currently unavailable. Save it to your favourites for another day." />
              ) : null}

              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionTitle}>About this cake</Text>
                <Text style={styles.description}>
                  {plainText(p.short_description || p.description) ||
                    "Ask Cake City for the latest product details."}
                </Text>
              </View>

              <Section
                title={
                  accessories
                    ? "Complete the celebration"
                    : "More to fall in love with"
                }
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRail}
              >
                {(related.data?.data ?? [])
                  .filter((item) => item.id !== p.id)
                  .slice(0, 6)
                  .map((item) => (
                    <ProductTile key={item.id} product={item} width={150} />
                  ))}
              </ScrollView>
            </View>
          </ScrollView>

          <View
            style={[
              styles.purchaseFooter,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <View style={styles.quantityControl}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
                disabled={quantity <= 1}
                onPress={() => setQuantity((value) => value - 1)}
                style={styles.quantityButton}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={
                    quantity <= 1
                      ? tokens.color.mutedSoft
                      : tokens.color.brandStrong
                  }
                />
              </Pressable>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
                disabled={quantity >= 20}
                onPress={() => setQuantity((value) => value + 1)}
                style={styles.quantityButton}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={
                    quantity >= 20
                      ? tokens.color.mutedSoft
                      : tokens.color.brandStrong
                  }
                />
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add to cart"
              accessibilityState={{ disabled: !canAdd, busy: quote.isFetching }}
              disabled={!canAdd}
              onPress={addToBag}
              style={({ pressed }) => [
                styles.addButton,
                !canAdd && styles.addButtonDisabled,
                pressed && canAdd && styles.addButtonPressed,
              ]}
            >
              {quote.isFetching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="bag-handle-outline" size={19} color="#FFFFFF" />
              )}
              <Text numberOfLines={1} style={styles.addButtonText}>
                {quote.isError
                  ? "Price unavailable"
                  : currentQuote && quote.data
                    ? `Add to Cart · ${money(quote.data.total)}`
                    : "Confirming price..."}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F8D8E1" },
  layout: { flex: 1, backgroundColor: tokens.color.background },
  gallery: {
    height: 374,
    maxWidth: 900,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "#F5C9D5",
  },
  imageFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  galleryHeader: {
    position: "absolute",
    top: 10,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  galleryTitle: {
    flex: 1,
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(255,255,255,.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  galleryActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  dots: {
    position: "absolute",
    right: 16,
    top: "54%",
    gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFFA8" },
  dotActive: { height: 17, backgroundColor: "#FFFFFF" },
  detailsCard: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    marginTop: -18,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 30,
    gap: 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: tokens.color.background,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeText: {
    color: tokens.color.brandStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  productTitle: {
    color: tokens.color.ink,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  price: {
    marginTop: 6,
    color: tokens.color.brandStrong,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 4,
  },
  ratingText: { color: tokens.color.muted, fontSize: 11, fontWeight: "700" },
  optionSection: { gap: 9 },
  optionLabel: { color: tokens.color.ink, fontSize: 13, fontWeight: "800" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deliveryNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  deliveryIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: tokens.color.brandLight,
  },
  deliveryTitle: { color: tokens.color.ink, fontSize: 12, fontWeight: "800" },
  deliveryCopy: { marginTop: 2, color: tokens.color.muted, fontSize: 10.5 },
  descriptionBlock: {
    gap: 7,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  descriptionTitle: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  description: { color: tokens.color.muted, fontSize: 13, lineHeight: 20 },
  relatedRail: { gap: 10, paddingRight: 8 },
  purchaseFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: "rgba(255,255,255,.98)",
    shadowColor: "#4B2432",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  quantityControl: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 15,
    backgroundColor: tokens.color.surface,
  },
  quantityButton: {
    width: 38,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityValue: {
    minWidth: 24,
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  addButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: tokens.color.brandStrong,
  },
  addButtonDisabled: { backgroundColor: "#B7A8AE" },
  addButtonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  addButtonText: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});
