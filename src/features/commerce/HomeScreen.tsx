import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import {
  BagButton,
  Feedback,
  IconButton,
  ProductTile,
  Reveal,
  Screen,
  Section,
  ui,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { ProductGridSkeleton } from "@/components/ui/Skeleton";
import { tokens } from "@/theme/tokens";
import { customerApi, shopApi } from "./api";
import { activeCampaigns, money, plainText } from "./contracts";
import { usePreferences } from "./store";

type IconName = keyof typeof Ionicons.glyphMap;

function categoryIcon(name: string): IconName {
  if (/cupcake/i.test(name)) return "ice-cream-outline";
  if (/pastr|cookie|donut|dessert/i.test(name)) return "cafe-outline";
  if (/party|balloon/i.test(name)) return "sparkles-outline";
  if (/accessor|gift|topper|candle/i.test(name)) return "gift-outline";
  return "storefront-outline";
}

export function HomeScreen() {
  const { customer } = useAuth();
  const branch = usePreferences((state) => state.branch);
  const { width } = useWindowDimensions();
  const catalogue = useQuery({
    queryKey: ["catalogue", "featured"],
    queryFn: ({ signal }) =>
      shopApi.products({ orderby: "popularity" }, signal),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: 15 * 60000,
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
    staleTime: 5 * 60000,
  });
  const orders = useQuery({
    queryKey: ["orders", customer?.id],
    queryFn: customerApi.orders,
    enabled: !!customer,
  });
  const favourites = useQuery({
    queryKey: ["favourites", customer?.id],
    queryFn: customerApi.favourites,
    enabled: !!customer,
  });
  const recentSlugs = usePreferences((state) => state.recentSlugs);
  const recent = useQuery({
    queryKey: ["recent-products", recentSlugs],
    queryFn: ({ signal }) =>
      shopApi.products({ slug: recentSlugs.slice(0, 8).join(",") }, signal),
    enabled: recentSlugs.length > 0,
  });

  const products = catalogue.data?.data ?? [];
  const hero =
    products.find(
      (product) =>
        product.images.length > 0 && /chocolate|fudge/i.test(product.name),
    ) ?? products.find((product) => product.images.length > 0);
  const visibleCategories =
    categories.data
      ?.filter((category) => category.count > 0 && category.parent === 0)
      .slice(0, 5) ?? [];
  const campaigns = activeCampaigns(config.data?.campaigns ?? [], branch?.id);
  const activeOrder = orders.data?.find(
    (order) =>
      ![
        "delivered",
        "completed",
        "cancelled",
        "refunded",
        "payment_failed",
        "awaiting_payment",
      ].includes(order.state),
  );
  const cardWidth =
    width < 500 ? Math.max(106, (width - 58) / 3) : Math.min(170, width / 3.4);

  return (
    <Screen
      header={
        <View style={styles.header}>
          <BrandLogo width={106} style={styles.logo} />
          <View style={styles.headerActions}>
            <IconButton
              name="heart-outline"
              label="Favourites"
              onPress={() => router.push("/favourites")}
            />
            <BagButton />
          </View>
        </View>
      }
    >
      <Reveal>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search cakes, flavours and celebrations"
          onPress={() => router.push("/(tabs)/shop")}
          style={styles.search}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={tokens.color.muted}
          />
          <Text style={styles.searchText}>
            Search cakes, flavours, and more...
          </Text>
          <View style={styles.searchFilter}>
            <Ionicons
              name="options-outline"
              size={18}
              color={tokens.color.brandStrong}
            />
          </View>
        </Pressable>

        {hero ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Shop ${plainText(hero.name)}`}
            onPress={() =>
              router.push({
                pathname: "/product/[id]",
                params: { id: String(hero.id) },
              })
            }
            style={({ pressed }) => [
              styles.hero,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.heroCopy}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  {hero.on_sale ? "SPECIAL" : "FRESHLY BAKED"}
                </Text>
              </View>
              <Text numberOfLines={3} style={styles.heroTitle}>
                {plainText(hero.name)}
              </Text>
              <Text style={styles.heroSubtitle}>
                Rich. Fresh. Irresistible.
              </Text>
              <View style={styles.heroButton}>
                <Text style={styles.heroButtonText}>Shop Now</Text>
              </View>
            </View>
            <Image
              accessibilityLabel={`${plainText(hero.name)} product image`}
              source={hero.images[0].src}
              contentFit="contain"
              contentPosition="right bottom"
              cachePolicy="memory-disk"
              transition={180}
              style={styles.heroImage}
            />
          </Pressable>
        ) : catalogue.isPending ? (
          <View style={styles.heroLoading} />
        ) : catalogue.isError ? (
          <Feedback
            error={catalogue.error}
            onRetry={() => void catalogue.refetch()}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose your Cake City branch"
          onPress={() => router.push("/branches")}
          style={styles.branchBar}
        >
          <View style={styles.branchIcon}>
            <Ionicons
              name="location-outline"
              size={18}
              color={tokens.color.brandStrong}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.branchLabel}>YOUR CAKE CITY</Text>
            <Text numberOfLines={1} style={styles.branchName}>
              {branch?.name ?? "Choose a branch for accurate availability"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={17}
            color={tokens.color.muted}
          />
        </Pressable>

        {activeOrder ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/order/[reference]",
                params: { reference: activeOrder.reference },
              })
            }
            style={styles.orderStrip}
          >
            <View style={styles.orderIcon}>
              <Ionicons name="bicycle-outline" size={21} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderTitle}>
                Your celebration is in motion
              </Text>
              <Text style={styles.orderCopy}>
                {activeOrder.reference} · {activeOrder.state.replace(/_/g, " ")}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={17}
              color={tokens.color.brandStrong}
            />
          </Pressable>
        ) : null}

        {visibleCategories.length ? (
          <View style={styles.categoryRow}>
            {visibleCategories.map((category) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Browse ${plainText(category.name)}`}
                key={category.id}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/shop",
                    params: { category: String(category.id) },
                  })
                }
                style={({ pressed }) => [
                  styles.category,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons
                    name={categoryIcon(category.name)}
                    size={24}
                    color={tokens.color.brandStrong}
                  />
                </View>
                <Text numberOfLines={2} style={styles.categoryLabel}>
                  {plainText(category.name)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Section
          title="Bestsellers"
          action="See all"
          onPress={() => router.push("/(tabs)/shop")}
        />
        {catalogue.isPending ? (
          <ProductGridSkeleton />
        ) : catalogue.isError ? null : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productRail}
          >
            {products.slice(0, 8).map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                width={cardWidth}
              />
            ))}
          </ScrollView>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/custom")}
          style={({ pressed }) => [
            styles.studioCard,
            pressed && styles.cardPressed,
          ]}
        >
          <View style={styles.studioIcon}>
            <Ionicons name="color-palette-outline" size={25} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studioEyebrow}>CAKE CITY STUDIO</Text>
            <Text style={styles.studioTitle}>Make it unmistakably yours.</Text>
            <Text style={styles.studioCopy}>
              Choose the details and add your message.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </Pressable>

        {campaigns[0] ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/offers")}
            style={styles.offerCard}
          >
            <View style={styles.offerIcon}>
              <Ionicons
                name="gift-outline"
                size={24}
                color={tokens.color.brandStrong}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.offerEyebrow}>
                {campaigns[0].app_exclusive
                  ? "APP EXCLUSIVE"
                  : "CAKE CITY OFFER"}
              </Text>
              <Text style={styles.offerTitle}>{campaigns[0].title}</Text>
              <Text numberOfLines={2} style={styles.offerCopy}>
                {campaigns[0].description}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={tokens.color.brandStrong}
            />
          </Pressable>
        ) : null}

        {recent.data?.data.length ? (
          <>
            <Section title="Still on your mind?" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productRail}
            >
              {recentSlugs
                .map((slug) =>
                  recent.data?.data.find((product) => product.slug === slug),
                )
                .filter((product): product is NonNullable<typeof product> =>
                  Boolean(product),
                )
                .map((product) => (
                  <ProductTile
                    key={product.id}
                    product={product}
                    width={cardWidth}
                  />
                ))}
            </ScrollView>
          </>
        ) : null}

        {customer && orders.data?.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/orders")}
            style={styles.simpleCard}
          >
            <View style={styles.simpleIcon}>
              <Ionicons
                name="receipt-outline"
                size={22}
                color={tokens.color.brandStrong}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.label}>Order it again</Text>
              <Text style={ui.body}>
                {orders.data[0].reference} · {money(orders.data[0].total)}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={17}
              color={tokens.color.muted}
            />
          </Pressable>
        ) : null}

        <View style={styles.rewardCard}>
          <View style={styles.simpleIcon}>
            <Ionicons
              name="star-outline"
              size={23}
              color={tokens.color.brandStrong}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui.heading}>Loyalty tastes better.</Text>
            <Text style={ui.body}>
              {customer && favourites.data
                ? `${favourites.data.length} favourites saved to your Cake City account.`
                : "Keep favourites, rewards and celebrations together."}
            </Text>
          </View>
          <Button
            variant="ghost"
            label="Open"
            onPress={() => router.push(customer ? "/rewards" : "/register")}
          />
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    minHeight: 72,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { height: 56 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  search: {
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: "#F7F0F1",
  },
  searchText: { flex: 1, color: tokens.color.muted, fontSize: 13 },
  searchFilter: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
  },
  hero: {
    minHeight: 208,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#A90048",
    shadowColor: "#6F0038",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  heroCopy: {
    width: "59%",
    minHeight: 208,
    zIndex: 2,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 17,
  },
  heroBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,.22)",
  },
  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  heroTitle: {
    marginTop: 10,
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 7,
    color: "rgba(255,255,255,.84)",
    fontSize: 11,
    lineHeight: 16,
  },
  heroButton: {
    minHeight: 39,
    marginTop: 14,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  heroButtonText: {
    color: tokens.color.brandStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  heroImage: {
    position: "absolute",
    width: "56%",
    height: "100%",
    right: -4,
    bottom: 0,
  },
  heroLoading: {
    minHeight: 208,
    borderRadius: 20,
    backgroundColor: tokens.color.brandLight,
  },
  cardPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  branchBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  branchIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: tokens.color.brandLight,
  },
  branchLabel: {
    color: tokens.color.brandStrong,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  branchName: {
    marginTop: 1,
    color: tokens.color.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  orderStrip: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: tokens.color.brandLight,
  },
  orderIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: tokens.color.brandStrong,
  },
  orderTitle: { color: tokens.color.ink, fontSize: 13, fontWeight: "800" },
  orderCopy: { marginTop: 2, color: tokens.color.muted, fontSize: 11 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 7,
  },
  category: { flex: 1, minWidth: 0, alignItems: "center" },
  categoryIcon: {
    width: "100%",
    maxWidth: 58,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#F8E7EC",
  },
  categoryLabel: {
    width: "100%",
    minHeight: 27,
    marginTop: 6,
    color: tokens.color.ink,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  productRail: { gap: 10, paddingRight: 6, paddingBottom: 4 },
  studioCard: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 16,
    borderRadius: 18,
    backgroundColor: tokens.color.cocoa,
  },
  studioIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.14)",
  },
  studioEyebrow: {
    color: "#FFB9D5",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  studioTitle: {
    marginTop: 5,
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
  },
  studioCopy: {
    marginTop: 4,
    color: "rgba(255,255,255,.76)",
    fontSize: 11,
    lineHeight: 15,
  },
  offerCard: {
    minHeight: 94,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 17,
    backgroundColor: "#FFF0F5",
    borderWidth: 1,
    borderColor: "#FFD9E7",
  },
  offerIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  offerEyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  offerTitle: {
    marginTop: 3,
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  offerCopy: {
    marginTop: 3,
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  simpleCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  simpleIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: tokens.color.brandLight,
  },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 17,
    backgroundColor: "#F7F1E8",
  },
});
