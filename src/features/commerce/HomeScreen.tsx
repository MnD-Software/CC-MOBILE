import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BrandLogo } from "@/components/BrandLogo";
import {
  BagButton,
  IconButton,
  ProductTile,
  Screen,
  Section,
} from "@/components/ui/Commerce";
import {
  ReferenceArtwork,
  type ReferenceArtworkName,
} from "@/components/ui/ReferenceArtwork";
import { tokens } from "@/theme/tokens";
import { shopApi } from "./api";
import { activeCampaigns, plainText } from "./contracts";
import { referenceBestsellers, referenceCakes } from "./reference-catalogue";

const departments: {
  label: string;
  artwork: ReferenceArtworkName;
  match: RegExp;
}[] = [
  { label: "Cakes", artwork: "cakes", match: /^cake city classics$|^cakes$/i },
  { label: "Cupcakes", artwork: "cupcakes", match: /^cupcakes$/i },
  { label: "Pastries", artwork: "pastries", match: /pastr|cake slice/i },
  {
    label: "Party Items",
    artwork: "party",
    match: /party accessories|party items/i,
  },
  {
    label: "Accessories",
    artwork: "accessories",
    match: /^accessories$|gifts and giggles/i,
  },
];

export function HomeScreen() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 600) - 24;
  const cardWidth = (contentWidth - 26) / 3;
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: 15 * 60000,
  });
  const products = useQuery({
    queryKey: ["catalogue", "home", "popular"],
    queryFn: ({ signal }) =>
      shopApi.products(
        { page: 1, orderby: "popularity", order: "desc" },
        signal,
      ),
    staleTime: 10 * 60000,
  });
  const config = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
    staleTime: 10 * 60000,
  });
  const liveProducts = products.data?.data ?? [];
  const catalogue = liveProducts.length ? liveProducts : referenceCakes;
  const hero = catalogue[0];
  const bestsellers = liveProducts.length
    ? liveProducts.slice(0, 8)
    : referenceBestsellers;
  const promotions = config.data
    ? activeCampaigns(config.data.campaigns).slice(0, 3)
    : [];
  const pairings = catalogue.slice(1, 5);
  const heroImage = hero.images[0]?.src;

  return (
    <Screen
      contentStyle={styles.content}
      header={
        <View style={styles.header}>
          <BrandLogo width={145} />
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
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Search cakes, flavors, and more"
        onPress={() =>
          router.push({ pathname: "/(tabs)/shop", params: { focus: "1" } })
        }
        style={styles.search}
      >
        <Ionicons name="search-outline" size={20} color={tokens.color.cocoa} />
        <Text style={styles.searchText}>
          Search cakes, flavors, and more...
        </Text>
        <Ionicons
          name="options-outline"
          size={20}
          color={tokens.color.brandStrong}
        />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          "New: " + hero.name + ". Rich. Moist. Irresistible. Shop Now"
        }
        onPress={() =>
          router.push({
            pathname: "/product/[id]",
            params: { id: String(hero.id) },
          })
        }
        style={({ pressed }) => [
          styles.hero,
          { height: (contentWidth * 208) / 350 },
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={[tokens.color.brandDark, tokens.color.brandStrong, "#F14286"]}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>Shop this cake</Text>
          <Ionicons
            name="arrow-forward"
            size={15}
            color={tokens.color.brandDark}
          />
        </View>
        {heroImage?.startsWith("https://") ? (
          <Image
            source={heroImage}
            contentFit="contain"
            transition={180}
            style={styles.heroImage}
          />
        ) : (
          <View style={styles.fallbackHeroArt}>
            <ReferenceArtwork
              name="chocolateBanner"
              width={contentWidth * 0.58}
            />
          </View>
        )}
      </Pressable>

      <View style={styles.categoryRow}>
        {departments.map((department, index) => {
          const category = categories.data?.find((item) =>
            department.match.test(item.name),
          );
          return (
            <Pressable
              key={department.label}
              accessibilityRole="button"
              accessibilityLabel={"Browse " + department.label}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/shop",
                  params:
                    index === 0
                      ? { department: "Cakes", category: "" }
                      : category
                        ? {
                            category: String(category.id),
                            department: department.label,
                          }
                        : {
                            search: department.label,
                            department: department.label,
                          },
                })
              }
              style={({ pressed }) => [
                styles.category,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.categoryIcon}>
                <ReferenceArtwork
                  name={department.artwork}
                  width={Math.min(60, (contentWidth - 44) / 5)}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.categoryLabel,
                  index === 0 && styles.categoryActive,
                ]}
              >
                {department.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bestsellers}>
        <Section
          compact
          title="Bestsellers"
          action="See all"
          onPress={() =>
            router.push({
              pathname: "/(tabs)/shop",
              params: { department: "Cakes", category: "", search: "" },
            })
          }
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productRail}
        >
          {bestsellers.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              width={cardWidth}
              compact
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.pairingSection}>
        <Section
          compact
          title="Perfect pairings"
          action="Browse all"
          onPress={() => router.push("/(tabs)/shop")}
        />
        <Text style={styles.sectionIntro}>
          Curated combinations for birthdays, sharing, and every sweet moment.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productRail}
        >
          {pairings.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              width={cardWidth}
              compact
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.promotionSection}>
        <Section
          compact
          title="Promotions"
          action="See offers"
          onPress={() => router.push("/offers")}
        />
        {promotions.length ? (
          promotions.map((promotion) => (
            <Pressable
              key={promotion.id}
              onPress={() => router.push("/offers")}
              style={styles.promotionCard}
            >
              {promotion.image_url ? (
                <Image
                  source={promotion.image_url}
                  contentFit="cover"
                  style={styles.promotionImage}
                />
              ) : null}
              <View style={styles.promotionCopy}>
                <Text style={styles.promotionKicker}>LIMITED TIME</Text>
                <Text style={styles.promotionTitle}>
                  {plainText(promotion.title)}
                </Text>
                <Text numberOfLines={2} style={styles.promotionDescription}>
                  {plainText(promotion.description)}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={tokens.color.brandStrong}
              />
            </Pressable>
          ))
        ) : (
          <Pressable
            onPress={() => router.push("/offers")}
            style={styles.promotionCard}
          >
            <LinearGradient
              colors={["#FFF0F6", "#FFF8E9"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.promotionBadge}>
              <Ionicons name="sparkles" size={17} color="#FFFFFF" />
            </View>
            <View style={styles.promotionCopy}>
              <Text style={styles.promotionKicker}>CAKE CITY EDIT</Text>
              <Text style={styles.promotionTitle}>
                Make the table unforgettable
              </Text>
              <Text style={styles.promotionDescription}>
                Fresh pairings, celebration cakes, and sweet extras in one
                place.
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={tokens.color.brandStrong}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.exploreSection}>
        <Section compact title="Explore Cake City" />
        <View style={styles.moduleGrid}>
          {[
            ["Shop all", "grid-outline", "/(tabs)/shop"],
            ["Offers", "pricetag-outline", "/offers"],
            ["Custom cakes", "color-palette-outline", "/(tabs)/custom"],
            ["Rewards", "star-outline", "/rewards"],
            ["Orders", "receipt-outline", "/(tabs)/orders"],
            ["Profile", "person-outline", "/(tabs)/account"],
          ].map(([label, icon, route]) => (
            <Pressable
              key={label}
              onPress={() => router.push(route as never)}
              style={({ pressed }) => [
                styles.moduleButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={19}
                color={tokens.color.brandStrong}
              />
              <Text style={styles.moduleLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    height: 74,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  content: { maxWidth: 600, paddingHorizontal: 12, paddingTop: 12, gap: 0 },
  search: {
    height: 50,
    marginHorizontal: 5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F2E6E9",
    backgroundColor: "#F6ECEE",
  },
  searchText: { flex: 1, color: tokens.color.muted, fontSize: 12 },
  hero: {
    marginTop: 18,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#A90048",
  },
  heroCta: {
    position: "absolute",
    zIndex: 3,
    left: 18,
    bottom: 18,
    marginTop: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  heroCtaText: {
    color: tokens.color.brandDark,
    fontSize: 11,
    fontWeight: "800",
  },
  heroImage: {
    position: "absolute",
    right: -10,
    bottom: -5,
    width: "58%",
    height: "100%",
  },
  fallbackHeroArt: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "58%",
    height: "100%",
    opacity: 0.9,
  },
  pressed: { opacity: 0.8 },
  categoryRow: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 4,
  },
  category: { flex: 1, minWidth: 0, alignItems: "center" },
  categoryIcon: { overflow: "hidden", borderRadius: 16 },
  categoryLabel: {
    marginTop: 7,
    color: tokens.color.cocoa,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: "center",
  },
  categoryActive: { color: tokens.color.brandStrong, fontWeight: "500" },
  bestsellers: { marginTop: 20, gap: 7, paddingHorizontal: 3 },
  productRail: { gap: 10, paddingBottom: 6 },
  pairingSection: { marginTop: 23, gap: 7, paddingHorizontal: 3 },
  sectionIntro: {
    color: tokens.color.muted,
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 430,
  },
  promotionSection: { marginTop: 24, gap: 8, paddingHorizontal: 3 },
  promotionCard: {
    minHeight: 104,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
  },
  promotionImage: { width: 76, height: 76, borderRadius: 14 },
  promotionBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: tokens.color.brandStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  promotionCopy: { flex: 1, gap: 3 },
  promotionKicker: {
    color: tokens.color.brandStrong,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  promotionTitle: {
    color: tokens.color.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  promotionDescription: {
    color: tokens.color.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  exploreSection: { marginTop: 25, gap: 10, paddingHorizontal: 3 },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  moduleButton: {
    width: "31.7%",
    minHeight: 70,
    padding: 11,
    gap: 8,
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.glassStrong,
  },
  moduleLabel: { color: tokens.color.ink, fontSize: 11, fontWeight: "700" },
});
