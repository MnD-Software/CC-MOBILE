import { Ionicons } from "@expo/vector-icons";
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
  const hero = referenceCakes[0];

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
        <ReferenceArtwork name="chocolateBanner" width={contentWidth} />
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
          {referenceBestsellers.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              width={cardWidth}
              compact
            />
          ))}
        </ScrollView>
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
});
