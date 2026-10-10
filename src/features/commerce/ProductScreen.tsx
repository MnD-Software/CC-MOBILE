import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "@/components/ui/Typography";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  BagButton,
  FavouriteButton,
  Feedback,
  IconButton,
  Screen,
  useToast,
} from "@/components/ui/Commerce";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { performHaptic } from "@/design";
import {
  money,
  plainText,
  productPrice,
  selectableVariations,
  variationCartAttributes,
  variationLabel,
  type CakeSelection,
  type StoreProduct,
  type BagLine,
} from "./contracts";
import { CATALOGUE_GC_TIME_MS, CATALOGUE_STALE_TIME_MS, shopApi } from "./api";
import { fetchLiveVariations, liveVariationPrice } from "./store-variations";
import { useBag, usePreferences } from "./store";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { api } from "@/api/client";
import { z } from "zod";
import { storeProductSchema } from "./contracts";
import { rankPairings } from "./pairings";
import { trackCommerceEvent } from "@/observability/commerce-events";
import { contentApi, mediaSource } from "@/features/editorial/content";
import { VideoClip } from "@/features/editorial/VideoClip";
import { confirmedServings } from "@/features/celebrations/planning";
import { Reveal } from "@/components/ui/Delight";

function ProductSkeleton() {
  const styles = useThemedStyles(baseStyles);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading cake details"
      style={styles.loading}
    >
      <Skeleton height={370} radius={28} />
      <View style={styles.loadingDetails}>
        <Skeleton width="28%" height={11} radius={6} />
        <Skeleton width="84%" height={27} radius={8} />
        <Skeleton width="38%" height={19} radius={7} />
        <Skeleton width="100%" height={60} radius={18} />
      </View>
    </View>
  );
}

async function livePairings(product: StoreProduct, signal?: AbortSignal) {
  try {
    const result = await api.get<unknown>(
      `/v1/catalogue/products/${product.id}/pairings`,
      { signal },
    );
    const payload = z
      .object({
        products: storeProductSchema.array(),
        curated_ids: z.array(z.number().int().positive()),
      })
      .parse(result);
    return rankPairings(product, payload.products, 6, payload.curated_ids);
  } catch (error) {
    if (signal?.aborted) throw error;
    // Older deployments can still provide live complementary records. A failed
    // search must not discard the other successful searches.
    const results = await Promise.allSettled(
      ["cupcake", "candle", "cake"].map((search) =>
        shopApi.products({ page: 1, perPage: 12, search }, signal),
      ),
    );
    if (signal?.aborted) throw error;
    const successful = results.filter((r) => r.status === "fulfilled");
    if (!successful.length) throw error;
    return rankPairings(
      product,
      successful.flatMap((r) => r.value.data),
    );
  }
}

export function ProductScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { id, slug } = useLocalSearchParams<{ id: string; slug?: string }>();
  const { customer } = useAuth();
  const lookup = slug || id;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const addBundle = useBag((state) => state.addBundle);
  const remember = usePreferences((state) => state.view);
  const [activeImage, setActiveImage] = useState(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [variationOpen, setVariationOpen] = useState(false);
  const [pairingsReady, setPairingsReady] = useState(false);
  const [selectedPairingIds, setSelectedPairingIds] = useState<number[]>([]);
  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(
    null,
  );
  const viewportWidth = Math.min(
    Math.max(1, width - insets.left - insets.right),
    600,
  );
  const product = useQuery({
    queryKey: ["product", lookup],
    queryFn: ({ signal }) => shopApi.product(lookup, signal),
    initialData: () => shopApi.cachedProduct(lookup) ?? undefined,
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    networkMode: "always",
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
  const cake = product.data;
  const editorial = useQuery({
    queryKey: ["product-editorial", cake?.id],
    queryFn: ({ signal }) => contentApi.product(cake!.id, signal),
    enabled: !!cake && pairingsReady,
    staleTime: 60_000,
    retry: false,
  });
  const variations = cake ? selectableVariations(cake) : [];
  const variationIds = variations.map((variation) => variation.id);
  const liveVariations = useQuery({
    queryKey: ["product-variations", cake?.id ?? lookup, variationIds],
    queryFn: ({ signal }) => fetchLiveVariations(variationIds, signal),
    enabled: variationIds.length > 0,
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    retry: 1,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
  const pairings = useQuery({
    queryKey: ["product-pairings", cake?.id ?? lookup, "context-v2"],
    queryFn: ({ signal }) => (cake ? livePairings(cake, signal) : []),
    // Pairings are a secondary merchandising request. Let the first image,
    // price and add-to-bag controls win the network and render budget.
    enabled: !!cake && pairingsReady,
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    retry: 1,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setActiveImage(0);
    setPhotoOpen(false);
    setVideoOpen(false);
    setVariationOpen(false);
    setSelectedVariationId(null);
    setSelectedPairingIds([]);
    if (cake) {
      remember(customer?.id ? String(customer.id) : null, cake.slug);
      trackCommerceEvent("product_viewed", {
        product_id: cake.id,
        source: "product_detail",
      });
    }
  }, [cake?.slug, customer?.id, remember]);

  useEffect(() => {
    setPairingsReady(false);
    if (!cake) return;
    const timer = setTimeout(() => setPairingsReady(true), 450);
    return () => clearTimeout(timer);
  }, [cake?.id]);

  useEffect(() => {
    setActiveImage(0);
  }, [viewportWidth]);

  if (!cake) {
    return (
      <Screen title="Cake details" back>
        {product.isFetching || product.isPending ? (
          <ProductSkeleton />
        ) : (
          <Feedback
            error={product.error}
            empty={
              !product.error
                ? "This cake is no longer in today’s collection."
                : undefined
            }
            onRetry={() => void product.refetch()}
          />
        )}
      </Screen>
    );
  }

  const variationById = new Map(
    (liveVariations.data ?? [])
      .filter((variation) => variation.parent === cake.id)
      .map((variation) => [variation.id, variation]),
  );
  const basePrice = productPrice(cake);
  const images = [
    ...cake.images,
    ...(editorial.data?.image_urls ?? [])
      .filter(
        (url) => !cake.images.some((image) => image.src === mediaSource(url)),
      )
      .map((url, index) => ({
        id: -index - 1,
        src: mediaSource(url),
        alt: editorial.data?.photography_notes ?? "Cake City detail photograph",
      })),
  ];
  const description =
    plainText(cake.short_description || cake.description) ||
    "Cake City will share the latest details for this celebration.";
  const optionGroups = cake.attributes.filter(
    (attribute) => attribute.terms.length > 0,
  );
  const selectedVariation = variations.find(
    (variation) => variation.id === selectedVariationId,
  );
  const variationRequired =
    cake.type === "variable" || cake.variations.length > 0;
  const selectedVariationLabel = selectedVariation
    ? variationLabel(cake, selectedVariation)
    : null;
  const selectedLiveVariation = selectedVariation
    ? variationById.get(selectedVariation.id)
    : undefined;
  const selectedVariationPrice = selectedLiveVariation
    ? liveVariationPrice(selectedLiveVariation)
    : null;
  // A variable parent price is a live starting price, not the price of an
  // unselected combination. Never put it in the bag or label it as selected.
  const price = variationRequired ? selectedVariationPrice : basePrice;
  const selectedPairings = (pairings.data ?? [])
    .map((entry) => entry.product)
    .filter(
      (item) =>
        selectedPairingIds.includes(item.id) &&
        item.type === "simple" &&
        !item.variations.length &&
        item.is_in_stock &&
        item.is_purchasable &&
        productPrice(item) !== null,
    );
  const combinedPrice =
    price === null
      ? null
      : price +
        selectedPairings.reduce((sum, item) => sum + productPrice(item)!, 0);
  const priceText =
    price !== null
      ? money(combinedPrice!)
      : variationRequired && !selectedVariation && basePrice !== null
        ? `From ${money(basePrice)}`
        : selectedVariation && liveVariations.isFetching
          ? "Checking price…"
          : variationRequired
            ? "Price unavailable"
            : "Price on request";
  const priceCaption =
    selectedPairings.length && price !== null
      ? "CAKE + EXTRAS"
      : price !== null
        ? variationRequired
          ? "YOUR SELECTION"
          : "PRICE"
        : variationRequired && !selectedVariation
          ? "STARTING FROM"
          : "PRICE CHECK";
  const needsVariationChoice = variationRequired && !selectedVariation;
  const needsVariationPrice =
    variationRequired && !!selectedVariation && price === null;
  const canAddToBag =
    (!variationRequired ||
      (!!selectedVariation &&
        !!selectedLiveVariation &&
        selectedLiveVariation.is_in_stock &&
        selectedLiveVariation.is_purchasable)) &&
    cake.is_in_stock &&
    cake.is_purchasable &&
    price !== null;
  const size: CakeSelection["size"] = /(?:^|\D)2(?:\.0)?\s*kg/i.test(
    selectedVariationLabel ?? plainText(cake.name),
  )
    ? "2kg"
    : /1[.\s-]*5\s*kg/i.test(selectedVariationLabel ?? plainText(cake.name))
      ? "1.5kg"
      : "1kg";
  const orderCake = cake;
  const canChooseVariation = variationRequired && variations.length > 0;
  const actionDisabled = !canAddToBag && !canChooseVariation;
  const addButtonLabel = canAddToBag
    ? "Add to bag"
    : needsVariationChoice
      ? "Choose option"
      : needsVariationPrice
        ? "Check price"
        : "Unavailable";
  const buyButtonLabel = canAddToBag
    ? "Buy now"
    : needsVariationChoice
      ? "Choose option"
      : needsVariationPrice
        ? "Check price"
        : "Unavailable";

  function addCake(openBag = false) {
    if (!canAddToBag || price === null) return;
    const bundle: BagLine[] = [
      {
        key: "",
        product_id: orderCake.id,
        slug: orderCake.slug,
        name: selectedVariationLabel
          ? `${plainText(orderCake.name)} · ${selectedVariationLabel}`
          : plainText(orderCake.name),
        image: orderCake.images[0]?.src ?? null,
        price,
        quantity: 1,
        selection: {
          size,
          message: "",
          add_ons: [],
          variation_id: selectedVariation?.id,
          variation_attributes: selectedVariation
            ? variationCartAttributes(orderCake, selectedVariation)
            : undefined,
        },
      },
    ];
    for (const pairing of selectedPairings) {
      bundle.push({
        key: "",
        product_id: pairing.id,
        slug: pairing.slug,
        name: plainText(pairing.name),
        image: pairing.images[0]?.src ?? null,
        price: productPrice(pairing)!,
        quantity: 1,
        selection: { size: "1kg", message: "", add_ons: [] },
      });
    }
    if (!addBundle(bundle)) {
      toast(
        "Your bag is at its item limit. Remove an item or reduce its quantity, then add this cake and extras together.",
      );
      return;
    }
    void performHaptic("addToCart");
    toast(
      selectedPairings.length
        ? "Cake and selected extras added to your bag."
        : "Added to your bag.",
    );
    if (openBag) router.push("/cart");
  }

  function chooseVariation() {
    if (!canChooseVariation) return;
    setVariationOpen(true);
    if (liveVariations.isError) void liveVariations.refetch();
  }

  function addOrChoose(openBag = false) {
    if (canAddToBag) {
      addCake(openBag);
      return;
    }
    chooseVariation();
  }

  async function shareCake() {
    const url = `https://cakecity.co.ke/product/${encodeURIComponent(orderCake.slug)}/`;
    try {
      await Share.share({
        title: plainText(orderCake.name),
        message: `Take a look at ${plainText(orderCake.name)} from Cake City: ${url}`,
        url,
      });
    } catch {
      toast("This cake could not be shared right now.");
    }
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.page}>
      <View style={styles.layout}>
        <Modal
          visible={photoOpen}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setPhotoOpen(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View
              style={{
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: colors.ink }}>
                Photo {activeImage + 1} of {images.length}
              </Text>
              <IconButton
                name="close"
                label="Close photo"
                onPress={() => setPhotoOpen(false)}
              />
            </View>
            <Image
              source={{ uri: images[activeImage]?.src }}
              contentFit="contain"
              cachePolicy="memory-disk"
              style={{ flex: 1, width: "100%" }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                padding: 16,
              }}
            >
              <IconButton
                name="arrow-back"
                label="Previous photo"
                onPress={() =>
                  setActiveImage(
                    (index) => (index - 1 + images.length) % images.length,
                  )
                }
              />
              <Text
                style={{ color: colors.muted, flex: 1, paddingHorizontal: 12 }}
              >
                {images[activeImage]?.alt}
              </Text>
              <IconButton
                name="arrow-forward"
                label="Next photo"
                onPress={() =>
                  setActiveImage((index) => (index + 1) % images.length)
                }
              />
            </View>
          </SafeAreaView>
        </Modal>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 18 }}
        >
          <View style={[styles.gallery, { width: viewportWidth }]}>
            <FlatList
              key={`${cake.id}:${viewportWidth}`}
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialNumToRender={1}
              maxToRenderPerBatch={1}
              windowSize={3}
              getItemLayout={(_, index) => ({
                index,
                length: viewportWidth,
                offset: viewportWidth * index,
              })}
              keyExtractor={(image) => String(image.id)}
              onMomentumScrollEnd={({ nativeEvent }) =>
                setActiveImage(
                  Math.round(nativeEvent.contentOffset.x / viewportWidth),
                )
              }
              renderItem={({ item: image }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View photo ${images.indexOf(image) + 1} of ${images.length}`}
                  onPress={() => setPhotoOpen(true)}
                >
                  <Image
                    source={{ uri: image.src }}
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    contentPosition="center"
                    recyclingKey={`${cake.id}:${image.id}:${image.src}`}
                    transition={180}
                    style={{
                      width: viewportWidth,
                      height: viewportWidth * 0.94,
                    }}
                  />
                </Pressable>
              )}
              ListEmptyComponent={
                <View
                  style={[
                    styles.imageFallback,
                    { width: viewportWidth, height: viewportWidth * 0.94 },
                  ]}
                >
                  <Ionicons
                    name="image-outline"
                    size={44}
                    color={colors.cocoa}
                  />
                  <Text style={styles.imageFallbackText}>
                    Photography coming soon
                  </Text>
                </View>
              }
            />
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
              <View style={styles.galleryActions}>
                <BagButton />
                <IconButton
                  name="share-outline"
                  label={`Share ${plainText(orderCake.name)}`}
                  plain
                  onPress={() => void shareCake()}
                />
                <FavouriteButton product={cake} />
              </View>
            </View>
            {images.length > 1 ? (
              <View style={styles.dots}>
                {images.map((image, index) => (
                  <View
                    key={image.id}
                    style={[
                      styles.dot,
                      index === activeImage && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.details}>
            {images.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {images.map((image, index) => (
                  <Pressable
                    key={image.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Enlarge photo ${index + 1}`}
                    onPress={() => {
                      setActiveImage(index);
                      setPhotoOpen(true);
                    }}
                  >
                    <Image
                      source={{ uri: image.src }}
                      cachePolicy="memory-disk"
                      contentFit="contain"
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.topline}>
              <Text style={styles.kicker}>
                {cake.on_sale ? "SPECIAL PRICE" : "MADE FOR YOUR MOMENT"}
              </Text>
              {cake.is_in_stock ? (
                <View style={styles.stock}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={colors.success}
                  />
                  <Text style={styles.stockText}>In stock</Text>
                </View>
              ) : null}
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {plainText(cake.name)}
            </Text>
            <Text style={styles.price}>{priceText}</Text>
            {editorial.data?.flavour ||
            editorial.data?.servings ||
            confirmedServings(cake) ||
            (editorial.data?.preparation_hours !== null &&
              editorial.data?.preparation_hours !== undefined) ? (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  padding: 14,
                  borderRadius: 18,
                  gap: 8,
                }}
              >
                {editorial.data?.flavour ? (
                  <Text style={{ color: colors.ink }}>
                    Flavour · {editorial.data.flavour}
                  </Text>
                ) : null}
                {editorial.data?.servings || confirmedServings(cake) ? (
                  <Text style={{ color: colors.ink }}>
                    Servings ·{" "}
                    {editorial.data?.servings || confirmedServings(cake)}
                  </Text>
                ) : null}
                {editorial.data?.preparation_hours !== null &&
                editorial.data?.preparation_hours !== undefined ? (
                  <Text style={{ color: colors.ink }}>
                    {editorial.data.preparation_hours === 0
                      ? "Ready to order · subject to branch availability"
                      : `Allow ${editorial.data.preparation_hours} hours for preparation`}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {editorial.data?.video_url ? (
              videoOpen ? (
                <VideoClip url={editorial.data.video_url} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setVideoOpen(true)}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="play-circle"
                    color={colors.brandStrong}
                    size={24}
                  />
                  <Text
                    style={{ color: colors.brandStrong, fontWeight: "700" }}
                  >
                    A closer look at this cake
                  </Text>
                </Pressable>
              )
            ) : null}
            {variationRequired ? (
              <Text style={styles.priceNote}>
                {selectedVariation
                  ? "Price for your selected size and flavour."
                  : "Choose a variation to see its exact Cake City price."}
              </Text>
            ) : null}

            {cake.review_count > 0 ? (
              <View style={styles.rating}>
                <Ionicons name="star" size={14} color={colors.sunshine} />
                <Text style={styles.ratingText}>
                  {cake.average_rating} · {cake.review_count} reviews
                </Text>
              </View>
            ) : null}

            {variationRequired && !variations.length ? (
              <View style={styles.variationUnavailable}>
                <Ionicons
                  color={colors.brandStrong}
                  name="alert-circle-outline"
                  size={20}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>Options unavailable</Text>
                  <Text style={styles.variationHint}>
                    Cake City has not published a selectable combination for
                    this cake yet.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh cake options"
                  onPress={() => void product.refetch()}
                  style={({ pressed }) => [
                    styles.retryVariationButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.retryVariationText}>Refresh</Text>
                </Pressable>
              </View>
            ) : null}

            {variations.length ? (
              <View style={styles.variationGroup}>
                <View style={styles.variationHeading}>
                  <View>
                    <Text style={styles.optionLabel}>
                      Choose your variation
                    </Text>
                    <Text style={styles.variationHint}>
                      Required before adding this cake
                    </Text>
                  </View>
                  {selectedVariation ? (
                    <Ionicons
                      color={colors.success}
                      name="checkmark-circle"
                      size={19}
                    />
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: variationOpen }}
                  accessibilityLabel="Choose a cake variation"
                  onPress={() => setVariationOpen((open) => !open)}
                  style={({ pressed }) => [
                    styles.variationTrigger,
                    variationOpen && styles.variationTriggerOpen,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.variationValue}>
                      {selectedVariationLabel ?? "Select a size or finish"}
                    </Text>
                    <Text style={styles.variationSubtext}>
                      {selectedVariation
                        ? price !== null
                          ? `${money(price)} · available today`
                          : liveVariations.isFetching
                            ? "Checking price…"
                            : "Price not confirmed. Choose another option or retry."
                        : liveVariations.isFetching
                          ? "Loading prices…"
                          : `${variations.length} selectable combinations`}
                    </Text>
                  </View>
                  <Ionicons
                    color={colors.brandStrong}
                    name={variationOpen ? "chevron-up" : "chevron-down"}
                    size={19}
                  />
                </Pressable>
                {liveVariations.isError ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading option prices"
                    onPress={() => void liveVariations.refetch()}
                    style={({ pressed }) => [
                      styles.variationRetry,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      color={colors.brandStrong}
                      name="refresh-outline"
                      size={15}
                    />
                    <Text style={styles.variationRetryText}>
                      Couldn’t confirm prices. Retry
                    </Text>
                  </Pressable>
                ) : null}
                {variationOpen ? (
                  <Reveal style={styles.variationMenu}>
                    {variations.map((variation) => {
                      const label = variationLabel(cake, variation);
                      const selected = variation.id === selectedVariationId;
                      const liveVariation = variationById.get(variation.id);
                      const optionPrice = liveVariation
                        ? liveVariationPrice(liveVariation)
                        : null;
                      const unavailable =
                        liveVariations.isSuccess &&
                        (!liveVariation ||
                          !liveVariation.is_in_stock ||
                          !liveVariation.is_purchasable ||
                          optionPrice === null);
                      const priceCopy = liveVariations.isFetching
                        ? "Checking price"
                        : optionPrice !== null
                          ? money(optionPrice)
                          : "Unavailable";
                      return (
                        <Pressable
                          key={variation.id}
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected,
                            disabled: unavailable,
                          }}
                          accessibilityLabel={`${label}. ${priceCopy}`}
                          disabled={unavailable}
                          onPress={() => {
                            setSelectedVariationId(variation.id);
                            setVariationOpen(false);
                          }}
                          style={({ pressed }) => [
                            styles.variationOption,
                            selected && styles.variationOptionSelected,
                            unavailable && styles.variationOptionUnavailable,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            style={[
                              styles.radio,
                              selected && styles.radioSelected,
                            ]}
                          >
                            {selected ? <View style={styles.radioDot} /> : null}
                          </View>
                          <View style={styles.variationOptionCopy}>
                            <Text
                              numberOfLines={2}
                              style={styles.variationOptionText}
                            >
                              {label}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.variationOptionPrice,
                                unavailable &&
                                  styles.variationOptionPriceUnavailable,
                              ]}
                            >
                              {priceCopy}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </Reveal>
                ) : null}
              </View>
            ) : null}

            {optionGroups
              .filter((attribute) => !attribute.has_variations)
              .map((attribute) => (
                <View key={attribute.id} style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>
                    {plainText(attribute.name)}
                  </Text>
                  <View style={styles.options}>
                    {attribute.terms.slice(0, 8).map((term) => (
                      <View key={term.id} style={styles.option}>
                        <Text style={styles.optionText}>
                          {plainText(term.name)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}

            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionTitle}>About this cake</Text>
              <Text style={styles.description}>{description}</Text>
            </View>

            <View style={styles.orderNotice}>
              <Ionicons name="bag-check-outline" size={22} color="#FFFFFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNoticeTitle}>Ready when you are</Text>
                <Text style={styles.orderNoticeCopy}>
                  {canAddToBag
                    ? "Add this cake to your bag, choose your quantity, then continue to Cake City’s secure checkout."
                    : "Choose the available size and finish your order on Cake City’s secure checkout."}
                </Text>
              </View>
            </View>

            {pairings.isError ? (
              <View style={styles.pairingGroup}>
                <Text style={styles.pairingCopy}>Extras could not load.</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pairings.refetch()}
                >
                  <Text style={styles.pairingTitle}>Try pairings again</Text>
                </Pressable>
              </View>
            ) : null}
            {pairings.data?.length ? (
              <View style={styles.pairingGroup}>
                <View style={styles.pairingHeading}>
                  <View>
                    <Text style={styles.pairingTitle}>Pair it with</Text>
                    <Text style={styles.pairingCopy}>
                      Select extras to add with your cake. The total updates
                      below.
                    </Text>
                  </View>
                  <Ionicons
                    color={colors.brandStrong}
                    name="sparkles-outline"
                    size={19}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pairingRail}
                >
                  {pairings.data.map(({ product: pairing, reason }) => {
                    const pairingPrice = productPrice(pairing);
                    const pairingImage = pairing.images[0]?.src;
                    const selectable =
                      pairing.type === "simple" &&
                      !pairing.variations.length &&
                      pairingPrice !== null &&
                      pairing.is_in_stock &&
                      pairing.is_purchasable;
                    const selected = selectedPairings.some(
                      (item) => item.id === pairing.id,
                    );
                    return (
                      <Pressable
                        key={pairing.id}
                        accessibilityHint={
                          selectable
                            ? "Select or remove this extra from your cake purchase"
                            : "Opens this item to choose its options"
                        }
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${plainText(pairing.name)}. ${
                          pairingPrice === null
                            ? "Price on request"
                            : money(pairingPrice)
                        }`}
                        accessibilityRole="button"
                        onPress={() => {
                          if (selectable) {
                            setSelectedPairingIds((ids) =>
                              ids.includes(pairing.id)
                                ? ids.filter((id) => id !== pairing.id)
                                : [...ids, pairing.id],
                            );
                            return;
                          }
                          router.push({
                            pathname: "/product/[id]",
                            params: {
                              id: String(pairing.id),
                              slug: pairing.slug,
                            },
                          });
                        }}
                        style={({ pressed }) => [
                          styles.pairingCard,
                          selected && {
                            borderColor: colors.brandStrong,
                            backgroundColor: colors.brandLight,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.pairingImageFrame}>
                          {pairingImage ? (
                            <Image
                              cachePolicy="memory-disk"
                              contentFit="contain"
                              contentPosition="center"
                              recyclingKey={`${pairing.id}:${pairingImage}`}
                              source={{ uri: pairingImage }}
                              style={styles.pairingImage}
                              transition={100}
                            />
                          ) : (
                            <Ionicons
                              color={colors.muted}
                              name="gift-outline"
                              size={24}
                            />
                          )}
                        </View>
                        <Text numberOfLines={2} style={styles.pairingName}>
                          {plainText(pairing.name)}
                        </Text>
                        <Text numberOfLines={2} style={styles.pairingCopy}>
                          {reason}
                        </Text>
                        <Text style={styles.pairingPrice}>
                          {pairingPrice === null
                            ? "View item"
                            : money(pairingPrice)}
                        </Text>
                        <Text
                          style={{
                            color: colors.brandStrong,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {selected
                            ? "✓ Selected"
                            : selectable
                              ? "+ Add with cake"
                              : "Choose options"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <GlassSurface
          style={[styles.footer, { marginBottom: insets.bottom + 90 }]}
        >
          <View style={styles.footerPrice}>
            <Text style={styles.footerLabel}>{priceCaption}</Text>
            <Text numberOfLines={1} style={styles.footerValue}>
              {priceText}
            </Text>
          </View>
          {canAddToBag ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                canAddToBag ? "Add one cake to bag" : "Choose a cake variation"
              }
              disabled={actionDisabled}
              onPress={() => addOrChoose(false)}
              style={({ pressed }) => [
                styles.addToBagButton,
                actionDisabled && styles.actionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="bag-add-outline"
                size={18}
                color={colors.brandStrong}
              />
              <Text style={styles.addToBagText}>{addButtonLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              canAddToBag ? "Buy this cake" : "Choose cake options"
            }
            disabled={actionDisabled}
            onPress={() => addOrChoose(true)}
            style={({ pressed }) => [
              styles.purchaseButton,
              actionDisabled && styles.purchaseButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.purchaseButtonText}>{buyButtonLabel}</Text>
            <Ionicons
              name={canAddToBag ? "arrow-forward" : "options-outline"}
              size={18}
              color="#FFFFFF"
            />
          </Pressable>
        </GlassSurface>
      </View>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: tokens.color.background },
  layout: { flex: 1, backgroundColor: tokens.color.background },
  gallery: {
    maxWidth: 600,
    alignSelf: "center",
    overflow: "hidden",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.96)",
    backgroundColor: tokens.color.surfaceTint,
  },
  galleryHeader: {
    position: "absolute",
    top: 12,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  galleryActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: tokens.color.surfaceTint,
  },
  imageFallbackText: { color: tokens.color.cocoa, fontSize: 13 },
  dots: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.66)",
  },
  dotActive: { width: 20, backgroundColor: "#FFFFFF" },
  details: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    marginTop: -20,
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 26,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: tokens.color.background,
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    color: tokens.color.brandStrong,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  stock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: tokens.color.successLight,
  },
  stockText: { color: tokens.color.success, fontSize: 11, fontWeight: "700" },
  title: {
    color: tokens.color.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.55,
  },
  price: {
    color: tokens.color.brandStrong,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
  },
  priceNote: { marginTop: -10, color: tokens.color.muted, fontSize: 11.5 },
  rating: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -7 },
  ratingText: { color: tokens.color.muted, fontSize: 12, fontWeight: "600" },
  optionGroup: { gap: 8 },
  optionLabel: {
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  optionText: { color: tokens.color.cocoa, fontSize: 12, fontWeight: "600" },
  variationGroup: { gap: 9 },
  variationUnavailable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 17,
    backgroundColor: tokens.color.brandLight,
  },
  retryVariationButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  retryVariationText: {
    color: tokens.color.brandStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  variationHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  variationHint: {
    marginTop: 2,
    color: tokens.color.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  variationTrigger: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.94)",
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: "#BFC9D4",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  variationTriggerOpen: {
    borderColor: "rgba(236,0,140,0.32)",
    backgroundColor: "#FFF9FC",
  },
  variationValue: {
    color: tokens.color.ink,
    fontSize: 13.5,
    fontWeight: "800",
  },
  variationSubtext: {
    marginTop: 2,
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  variationRetry: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
    paddingVertical: 3,
  },
  variationRetryText: {
    color: tokens.color.brandStrong,
    fontSize: 11,
    fontWeight: "700",
  },
  variationMenu: {
    gap: 7,
    padding: 8,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(247,250,252,0.94)",
  },
  variationOption: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  variationOptionSelected: { backgroundColor: "#FFF0F8" },
  variationOptionUnavailable: { opacity: 0.52 },
  variationOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  variationOptionText: {
    color: tokens.color.cocoa,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
  },
  variationOptionPrice: {
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    fontWeight: "800",
  },
  variationOptionPriceUnavailable: { color: tokens.color.muted },
  radio: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: tokens.color.mutedSoft,
    backgroundColor: "#FFFFFF",
  },
  radioSelected: { borderColor: tokens.color.brandStrong },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.brandStrong,
  },
  descriptionBlock: {
    gap: 8,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
  },
  descriptionTitle: {
    color: tokens.color.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  description: { color: tokens.color.muted, fontSize: 14, lineHeight: 21 },
  orderNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: tokens.color.cocoa,
    ...tokens.shadow.card,
  },
  orderNoticeTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  orderNoticeCopy: {
    marginTop: 3,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    lineHeight: 18,
  },
  pairingGroup: { gap: 10, paddingTop: 3 },
  pairingHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pairingTitle: { color: tokens.color.ink, fontSize: 15, fontWeight: "800" },
  pairingCopy: {
    marginTop: 2,
    color: tokens.color.muted,
    fontSize: 11.5,
  },
  pairingRail: { gap: 10, paddingRight: 4 },
  pairingCard: {
    width: 118,
    gap: 5,
    padding: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  pairingImageFrame: {
    width: "100%",
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 11,
    backgroundColor: tokens.color.surfaceTint,
  },
  pairingImage: { width: "100%", height: "100%" },
  pairingName: {
    color: tokens.color.cocoa,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
  },
  pairingPrice: {
    color: tokens.color.brandStrong,
    fontSize: 10.5,
    fontWeight: "900",
  },
  footer: {
    width: "94%",
    maxWidth: 600,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 28,
  },
  footerPrice: { minWidth: 66, flexShrink: 1, gap: 2 },
  footerLabel: {
    color: tokens.color.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  footerValue: { color: tokens.color.ink, fontSize: 14, fontWeight: "800" },
  addToBagButton: {
    minWidth: 92,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
    backgroundColor: tokens.color.brandLight,
  },
  addToBagText: {
    color: tokens.color.brandStrong,
    fontSize: 12,
    fontWeight: "800",
  },
  actionDisabled: { opacity: 0.52 },
  purchaseButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 17,
    backgroundColor: tokens.color.brandStrong,
    ...tokens.shadow.card,
  },
  purchaseButtonDisabled: { opacity: 0.52 },
  purchaseButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  loading: { flex: 1, gap: 0 },
  loadingDetails: { gap: 15, padding: 20 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
