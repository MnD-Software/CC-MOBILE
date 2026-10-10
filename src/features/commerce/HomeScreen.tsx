import { Ionicons } from "@expo/vector-icons";
import { CampaignStories } from "@/features/editorial/CampaignStories";
import { CelebrationDashboard } from "@/features/celebrations/CelebrationDashboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "@/components/ui/Typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { ProfileAvatarButton } from "@/components/ProfileAvatar";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import {
  CommerceBrowseHeader,
  Feedback,
  ProductTile,
  Screen,
  Section,
} from "@/components/ui/Commerce";
import { Skeleton } from "@/components/ui/Skeleton";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { CATALOGUE_GC_TIME_MS, CATALOGUE_STALE_TIME_MS, shopApi } from "./api";
import { homeCollections } from "./collection-artwork";
import { money, plainText, productPrice, type StoreProduct } from "./contracts";
import { usePreferences } from "./store";

// Zustand requires a stable snapshot when there is no account history.
const EMPTY_RECENT_SLUGS: readonly string[] = [];

type CarouselItem =
  | { id: string; kind: "deal"; product: StoreProduct }
  | { id: "no-live-deals"; kind: "empty" };

type OccasionIdea = {
  id: string;
  title: string;
  query: string;
  image: string;
  tint: string;
  /**
   * The title shown by Shop after a compact occasion tile is selected. This
   * may be more descriptive than the compact rail label without changing the
   * live search that supplies the products.
   */
  department?: string;
};

function isDealsAndSteals(product: StoreProduct) {
  return (
    product.is_in_stock &&
    product.is_purchasable &&
    productPrice(product) !== null &&
    product.categories.some(
      (category) =>
        category.id === 206 ||
        category.slug === "deals-and-steals" ||
        plainText(category.name).toLocaleLowerCase() === "deals and steals",
    )
  );
}

/**
 * Compact navigation imagery sourced from Cake City media. These are not
 * product records, prices, or stock fallbacks: each tap opens a live Shop
 * query for the selected occasion.
 */
const occasionIdeas: readonly OccasionIdea[] = [
  {
    id: "birthday",
    title: "Birthday",
    query: "birthday",
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/SPONGEBOB-1-300x300.avif",
    tint: "#FFF0F8",
  },
  {
    id: "wedding",
    title: "Wedding",
    query: "wedding",
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2025/02/WhatsApp-Image-2026-04-02-at-12.40.45-Edit-with-AI.jpg-1.webp?fit=360%2C360&ssl=1",
    tint: "#F7F3FF",
  },
  {
    id: "baby-shower",
    title: "Baby shower",
    query: "baby shower",
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/BSHOWER-12-300x300.avif",
    tint: "#EAF8FE",
  },
  {
    id: "graduation",
    title: "Graduation",
    query: "graduation",
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/GRAD-4-300x300.avif",
    tint: "#FFF6DF",
  },
  {
    id: "pink-simba",
    title: "Pink Simba",
    query: "pink simba",
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/simba-Photoroom.webp?fit=520%2C520&ssl=1",
    tint: "#FFF0F8",
  },
  {
    id: "anniversary",
    title: "Anniversary",
    // The public catalogue does not return a reliable generic anniversary
    // search. This is a verified live Cake City product search for a romantic
    // floral cake, rather than silently substituting generic wedding results.
    query: "romantic red floral",
    department: "Anniversary cakes",
    image: "https://cakecity.co.ke/wp-content/uploads/2025/08/FLORAL-27.avif",
    tint: "#FFF5F7",
  },
];

function HomeSkeleton({ cardWidth }: { cardWidth: number }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View
      accessibilityLabel="Loading today’s Cake City collection"
      accessibilityRole="progressbar"
      style={styles.loading}
    >
      <Skeleton height={238} radius={28} />
      <OccasionRail />
      <CollectionGrid cardWidth={cardWidth} />
      <View style={styles.skeletonRail}>
        <Skeleton height={205} radius={22} width="47%" />
        <Skeleton height={205} radius={22} width="47%" />
      </View>
    </View>
  );
}

export function HomeScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  const { customer } = useAuth();
  const ownerKey = customer?.id ? String(customer.id) : null;
  const recentSlugs = usePreferences((state) =>
    ownerKey
      ? (state.recentSlugsByOwner?.[ownerKey] ?? EMPTY_RECENT_SLUGS)
      : EMPTY_RECENT_SLUGS,
  );
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeSlide, setActiveSlide] = useState(0);
  const availableWidth = Math.max(1, width - insets.left - insets.right);
  const contentWidth = Math.max(1, Math.min(availableWidth, 600) - 32);
  const collectionCardWidth = Math.max(0, (contentWidth - 12) / 2);
  const productCardWidth = Math.max(
    158,
    Math.min(184, (contentWidth - 24) / 2.2),
  );
  const catalogue = useQuery({
    queryKey: ["catalogue", "home", "deals-and-steals", 206],
    queryFn: ({ signal }) => shopApi.productsByCategory(206, signal),
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    // Permit the query function to reach its read-only cached-catalogue
    // fallback when NetInfo has already marked the device offline.
    networkMode: "always",
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });
  const signatures = useQuery({
    queryKey: ["catalogue", "home", "category", 229],
    queryFn: ({ signal }) => shopApi.productsByCategory(229, signal),
    // This rail owns its small, category-specific live request, so it can
    // begin alongside the carousel without delaying either first paint.
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    networkMode: "always",
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  const products = catalogue.data ?? [];
  const dealsAndSteals = useMemo(
    () => products.filter(isDealsAndSteals),
    [products],
  );
  const carouselItems = useMemo<CarouselItem[]>(
    () =>
      (dealsAndSteals.length
        ? dealsAndSteals
        : (signatures.data ?? [])
            .filter((product) => product.is_in_stock && product.is_purchasable)
            .slice(0, 3)
      ).map((product) => ({
        id: `deal-${product.id}`,
        kind: "deal" as const,
        product,
      })),
    [dealsAndSteals, signatures.data],
  );
  // FlatList measures its paging cells once. Re-key it when an orientation,
  // safe-area, or live-deal change alters their width/order, so it cannot hold
  // a partial old page with an incorrect indicator.
  const carouselLayoutKey = `${contentWidth}:${carouselItems
    .map((item) => item.id)
    .join("|")}`;
  const signatureProducts = useMemo(
    () =>
      (signatures.data ?? [])
        .filter(
          (product) =>
            product.is_in_stock &&
            product.is_purchasable &&
            productPrice(product) !== null,
        )
        .slice(0, 6),
    [signatures.data],
  );
  // This rail only contains products the customer actually opened and that we
  // still hold as live records in this app run. It never invents a personal
  // recommendation or downloads another home-blocking payload to fill space.
  const continueShopping = useMemo(() => {
    const visibleProducts = new Map<string, StoreProduct>(
      [...products, ...signatureProducts].map(
        (product) => [product.slug, product] as const,
      ),
    );
    return recentSlugs
      .flatMap((slug) => {
        const product =
          visibleProducts.get(slug) ?? shopApi.cachedProduct(slug);
        return product &&
          product.is_in_stock &&
          product.is_purchasable &&
          productPrice(product) !== null
          ? [product]
          : [];
      })
      .slice(0, 6);
  }, [products, recentSlugs, signatureProducts]);

  useEffect(() => {
    const urls = dealsAndSteals
      .slice(0, 2)
      .map((product) => product.images[0]?.src)
      .filter((url): url is string => Boolean(url));
    if (urls.length)
      void Image.prefetch(urls, "memory-disk").catch(() => false);
  }, [dealsAndSteals]);

  useEffect(() => {
    const urls = signatureProducts
      .slice(0, 2)
      .map((product) => product.images[0]?.src)
      .filter((url): url is string => Boolean(url));
    if (urls.length)
      void Image.prefetch(urls, "memory-disk").catch(() => false);
  }, [signatureProducts]);

  useEffect(() => {
    setActiveSlide(0);
  }, [carouselLayoutKey]);

  const openShop = () => router.push("/(tabs)/shop");
  const openProduct = (product: StoreProduct) =>
    router.push({
      pathname: "/product/[id]",
      params: { id: String(product.id), slug: product.slug },
    });
  const updateSlide = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveSlide(
      Math.max(
        0,
        Math.min(
          carouselItems.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / contentWidth),
        ),
      ),
    );
  };
  return (
    <Screen
      scroll={false}
      header={
        <CommerceBrowseHeader
          right={<ProfileAvatarButton />}
          brand={
            <View style={styles.brandBlock}>
              <BrandLogo width={108} />
            </View>
          }
        >
          <GlassSurface interactive style={styles.searchGlass}>
            <Pressable
              accessibilityLabel="Search the Cake City collection"
              accessibilityRole="search"
              onPress={() => router.navigate("/(tabs)/search")}
              style={({ pressed }) => [
                styles.search,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.searchIcon}>
                <Ionicons color={colors.brandStrong} name="search" size={18} />
              </View>
              <Text style={styles.searchText}>
                Search cakes, flavours, themes…
              </Text>
              <Ionicons color={colors.cocoa} name="options-outline" size={19} />
            </Pressable>
          </GlassSurface>
        </CommerceBrowseHeader>
      }
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 112 },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!isDark ? (
          <>
            <View pointerEvents="none" style={styles.ambientPink} />
            <View pointerEvents="none" style={styles.ambientBlue} />
          </>
        ) : null}
        {catalogue.isPending ? (
          <HomeSkeleton cardWidth={collectionCardWidth} />
        ) : catalogue.isError ? (
          <>
            <View style={styles.carouselSection}>
              <EmptyDealSlide onPress={openShop} width={contentWidth} />
            </View>
            <OccasionRail />
            <CollectionGrid cardWidth={collectionCardWidth} />
            <Feedback
              error={catalogue.error}
              onRetry={() => void catalogue.refetch()}
            />
          </>
        ) : (
          <>
            <View style={styles.carouselSection}>
              {carouselItems.length === 0 ? (
                <EmptyDealSlide onPress={openShop} width={contentWidth} />
              ) : (
                <FlatList
                  key={carouselLayoutKey}
                  data={carouselItems}
                  decelerationRate="fast"
                  disableIntervalMomentum
                  getItemLayout={(_, index) => ({
                    index,
                    length: contentWidth,
                    offset: contentWidth * index,
                  })}
                  horizontal
                  keyExtractor={(item) => item.id}
                  onMomentumScrollEnd={updateSlide}
                  pagingEnabled
                  renderItem={({ item }) => (
                    <View style={{ width: contentWidth }}>
                      {item.kind === "deal" ? (
                        <DealSlide
                          onPress={() => openProduct(item.product)}
                          product={item.product}
                        />
                      ) : (
                        <EmptyDealSlide
                          onPress={openShop}
                          width={contentWidth}
                        />
                      )}
                    </View>
                  )}
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={contentWidth}
                />
              )}
              <View accessibilityRole="tablist" style={styles.carouselDots}>
                {carouselItems.map((item, index) => (
                  <View
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: index === activeSlide }}
                    style={[
                      styles.carouselDot,
                      index === activeSlide && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>

            <CollectionGrid cardWidth={collectionCardWidth} />
            <OccasionRail />
            <CampaignStories />

            {continueShopping.length ? (
              <View style={styles.continueShopping}>
                <View style={styles.sectionPadding}>
                  <Section compact title="Recently viewed" />
                </View>
                <FlatList
                  contentContainerStyle={styles.productRail}
                  data={continueShopping}
                  horizontal
                  initialNumToRender={3}
                  keyExtractor={(product) => String(product.id)}
                  maxToRenderPerBatch={3}
                  renderItem={({ item }) => (
                    <ProductTile
                      compact
                      product={item}
                      width={productCardWidth}
                    />
                  )}
                  showsHorizontalScrollIndicator={false}
                  windowSize={3}
                />
              </View>
            ) : null}

            <View style={styles.featured}>
              <View style={styles.sectionPadding}>
                <Section
                  compact
                  action="See all"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/shop",
                      params: {
                        categoryName: "signature cakes",
                        department: "Signature Cakes",
                      },
                    })
                  }
                  title="Signature Cakes"
                />
              </View>
              {signatures.isPending ? (
                <View style={styles.signatureLoading}>
                  <Skeleton height={205} radius={22} width={productCardWidth} />
                  <Skeleton height={205} radius={22} width={productCardWidth} />
                </View>
              ) : signatureProducts.length ? (
                <FlatList
                  contentContainerStyle={styles.productRail}
                  data={signatureProducts}
                  horizontal
                  initialNumToRender={3}
                  keyExtractor={(product) => String(product.id)}
                  maxToRenderPerBatch={3}
                  renderItem={({ item }) => (
                    <ProductTile
                      compact
                      product={item}
                      width={productCardWidth}
                    />
                  )}
                  showsHorizontalScrollIndicator={false}
                  windowSize={3}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={openShop}
                  style={styles.featuredEmpty}
                >
                  <Text style={styles.featuredEmptyText}>
                    Explore Signature Cakes
                  </Text>
                  <Ionicons
                    color={colors.brandStrong}
                    name="arrow-forward"
                    size={17}
                  />
                </Pressable>
              )}
            </View>
            <CelebrationDashboard />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function DealSlide({
  onPress,
  product,
}: {
  onPress: () => void;
  product: StoreProduct;
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const price = productPrice(product);
  const image = product.images[0]?.src;
  return (
    <Pressable
      accessibilityHint="Opens this cake and its available options"
      accessibilityLabel={`${plainText(product.name)}. ${
        price !== null ? money(price) : "View offer"
      }`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dealHero, pressed && styles.pressed]}
    >
      {image ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          source={{ uri: image }}
          style={styles.heroImage}
          transition={120}
        />
      ) : null}
      <LinearGradient
        colors={["rgba(39,18,30,0.08)", "rgba(81,56,45,0.95)"]}
        end={{ x: 0.5, y: 1 }}
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.dealCopy}>
        <View style={styles.dealPill}>
          <Ionicons color="#FFFFFF" name="sparkles" size={12} />
          <Text style={styles.dealPillText}>
            {isDealsAndSteals(product)
              ? "DEALS & STEALS"
              : "THE SIGNATURE EDIT"}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.dealTitle}>
          {plainText(product.name)}
        </Text>
        <View style={styles.dealFooter}>
          <View>
            <Text style={styles.dealLabel}>
              {product.type === "variable" ? "FROM" : "CAKE CITY"}
            </Text>
            <Text style={styles.dealPrice}>
              {price !== null ? money(price) : "View offer"}
            </Text>
          </View>
          <View style={styles.dealArrow}>
            <Ionicons color={colors.cocoa} name="arrow-forward" size={17} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function EmptyDealSlide({
  onPress,
  width,
}: {
  onPress: () => void;
  width: number;
}) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable
      accessibilityLabel="Browse the Cake City collection"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.emptyHero,
        { width },
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={["#5A223E", "#B80068", "#EC008C"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name="sparkles" color="rgba(255,255,255,0.96)" size={62} />
      <Text style={styles.emptyKicker}>A SLICE OF SOMETHING SPECIAL</Text>
      <Text style={styles.emptyTitle}>Big moments. Little treats.</Text>
      <Text style={styles.emptyCopy}>
        Find a cake that makes it yours. Explore flavours, designs and
        celebrations.
      </Text>
    </Pressable>
  );
}

function OccasionRail() {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.occasionSection}>
      <View style={styles.occasionHeadingRow}>
        <View>
          <Text accessibilityRole="header" style={styles.occasionHeading}>
            Celebrate every chapter
          </Text>
          <Text style={styles.occasionCopy}>Pick an occasion to begin</Text>
        </View>
        <Ionicons
          color={colors.brandStrong}
          name="sparkles-outline"
          size={19}
        />
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={styles.occasionRail}
        showsHorizontalScrollIndicator={false}
      >
        {occasionIdeas.map((occasion) => (
          <Pressable
            key={occasion.id}
            accessibilityHint="Opens Cake City cakes for this occasion"
            accessibilityLabel={`Browse ${occasion.title} cakes`}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/shop",
                params: {
                  search: occasion.query,
                  department: occasion.department ?? occasion.title,
                },
              })
            }
            style={({ pressed }) => [
              styles.occasionChip,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.occasionArtwork,
                {
                  backgroundColor: isDark ? colors.surfaceTint : occasion.tint,
                },
              ]}
            >
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                contentPosition="center"
                recyclingKey={`occasion-${occasion.id}`}
                source={{ uri: occasion.image }}
                style={styles.occasionImage}
                transition={120}
              />
            </View>
            <Text numberOfLines={2} style={styles.occasionLabelText}>
              {occasion.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CollectionGrid({ cardWidth }: { cardWidth: number }) {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.collectionSection}>
      <Text accessibilityRole="header" style={styles.collectionHeading}>
        Find your flavour
      </Text>
      <Text style={styles.collectionCopy}>
        Explore the collection, one favourite at a time.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.collectionGrid}
      >
        {homeCollections.map((collection) => (
          <Pressable
            key={collection.id}
            accessibilityHint="Opens this category in Shop"
            accessibilityLabel={`Browse ${collection.name}`}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/shop",
                params: {
                  categoryName: collection.lookup[0],
                  department: collection.name,
                },
              })
            }
            style={({ pressed }) => [
              styles.collectionCard,
              {
                width: cardWidth,
                backgroundColor: isDark ? colors.surfaceTint : collection.tint,
              },
              pressed && styles.pressed,
            ]}
          >
            <Image
              cachePolicy="memory-disk"
              contentFit="cover"
              source={{ uri: collection.image }}
              style={styles.collectionImage}
              transition={140}
            />
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.20)"]}
              end={{ x: 0.5, y: 1 }}
              start={{ x: 0.5, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.collectionLabelBand}>
              <Text numberOfLines={2} style={styles.collectionLabel}>
                {collection.name}
              </Text>
              <Ionicons
                color={colors.brandStrong}
                name="arrow-forward-circle"
                size={17}
              />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  editorial: { gap: 6, paddingVertical: 2 },
  editorialEyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  editorialTitle: {
    color: tokens.color.cocoa,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1.3,
    fontWeight: "800",
  },
  editorialCopy: { color: tokens.color.muted, fontSize: 13, lineHeight: 20 },
  shortcuts: { flexDirection: "row", gap: 8 },
  shortcut: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 13,
    gap: 5,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(81,56,45,0.12)",
    backgroundColor: "#FFFFFF",
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0F8",
    marginBottom: 3,
  },
  shortcutTitle: { color: tokens.color.cocoa, fontWeight: "700", fontSize: 11 },
  shortcutDetail: { color: tokens.color.muted, fontSize: 9 },
  heroImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  content: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 128,
    gap: 22,
    overflow: "hidden",
  },
  ambientPink: {
    position: "absolute",
    width: 260,
    height: 260,
    top: -110,
    right: -120,
    borderRadius: 130,
    backgroundColor: "rgba(236,0,140,0.055)",
  },
  ambientBlue: {
    position: "absolute",
    width: 190,
    height: 190,
    top: 360,
    left: -130,
    borderRadius: 95,
    backgroundColor: "rgba(0,174,239,0.045)",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  searchGlass: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  search: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 10,
  },
  searchIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: tokens.color.brandLight,
  },
  searchText: { flex: 1, color: tokens.color.muted, fontSize: 13.5 },
  carouselSection: { gap: 4 },
  dealHero: {
    minHeight: 238,
    justifyContent: "flex-end",
    padding: 18,
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: tokens.color.cocoa,
    ...tokens.shadow.floating,
  },
  dealCopy: {
    justifyContent: "flex-end",
    gap: 7,
  },
  dealPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  dealPillText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.85,
  },
  dealTitle: {
    maxWidth: "84%",
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
    letterSpacing: -0.45,
  },
  dealFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  dealLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.72,
  },
  dealPrice: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  dealArrow: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  emptyHero: {
    minHeight: 238,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 7,
    overflow: "hidden",
    padding: 22,
    borderRadius: 28,
    ...tokens.shadow.floating,
  },
  emptyKicker: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  emptyTitle: {
    maxWidth: "82%",
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  emptyCopy: {
    maxWidth: "88%",
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    lineHeight: 17,
  },
  carouselDots: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.borderStrong,
  },
  carouselDotActive: { width: 22, backgroundColor: tokens.color.brandStrong },
  occasionSection: { gap: 9 },
  occasionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  occasionHeading: {
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: -0.25,
  },
  occasionCopy: { color: tokens.color.muted, fontSize: 11, lineHeight: 15 },
  occasionRail: { gap: 13, paddingRight: 8 },
  occasionChip: {
    width: 72,
    alignItems: "center",
    gap: 6,
  },
  occasionArtwork: {
    width: 62,
    height: 62,
    overflow: "hidden",
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(81,56,45,0.14)",
    ...tokens.shadow.card,
  },
  occasionImage: { width: "100%", height: "100%" },
  occasionLabelText: {
    color: tokens.color.ink,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  collectionSection: { gap: 7 },
  collectionHeading: {
    color: tokens.color.cocoa,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "left",
  },
  collectionCopy: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "left",
  },
  collectionGrid: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 7,
  },
  collectionCard: {
    minHeight: 172,
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(81,56,45,0.12)",
    ...tokens.shadow.card,
  },
  collectionImage: { width: "100%", height: 126, backgroundColor: "#FFFFFF" },
  collectionLabelBand: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.borderStrong,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  collectionLabel: {
    flex: 1,
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.18,
    textTransform: "uppercase",
  },
  featured: { gap: 12, marginHorizontal: -16 },
  continueShopping: { gap: 12, marginHorizontal: -16 },
  sectionPadding: { paddingHorizontal: 16 },
  productRail: { gap: 13, paddingHorizontal: 16, paddingBottom: 4 },
  featuredEmpty: {
    minHeight: 76,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: tokens.color.brandLight,
  },
  featuredEmptyText: {
    color: tokens.color.cocoa,
    fontSize: 13,
    fontWeight: "800",
  },
  signatureLoading: {
    flexDirection: "row",
    gap: 13,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  loading: { gap: 18 },
  skeletonRail: { flexDirection: "row", gap: 12 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
});
