import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  BagButton,
  Chip,
  Feedback,
  IconButton,
  ProductTile,
  Screen,
  ui,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { tokens } from "@/theme/tokens";
import { plainText } from "./contracts";
import { shopApi } from "./api";
import { usePreferences } from "./store";

export function ShopScreen() {
  const params = useLocalSearchParams<{
    category?: string;
    search?: string;
    offers?: string;
  }>();
  const [search, setSearch] = useState(params.search ?? "");
  const [debounced, setDebounced] = useState(search);
  const [category, setCategory] = useState<number | undefined>(
    params.category ? Number(params.category) : undefined,
  );
  const [sort, setSort] = useState("popularity");
  const [sale, setSale] = useState(params.offers === "1");
  const [budget, setBudget] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const recent = usePreferences((state) => state.recentSearches);
  const remember = usePreferences((state) => state.search);
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 3 : 2;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (params.category) setCategory(Number(params.category));
    if (params.search !== undefined) setSearch(params.search);
    if (params.offers !== undefined) setSale(params.offers === "1");
  }, [params.category, params.search, params.offers]);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: 15 * 60000,
  });
  const products = useInfiniteQuery({
    queryKey: ["catalogue", "shop", debounced, category, sort, sale, budget],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      shopApi.products(
        {
          page: pageParam,
          search: debounced,
          category,
          orderby: sort === "price-desc" ? "price" : sort,
          order: sort === "price" ? "asc" : "desc",
          on_sale: sale || undefined,
          max_price: budget ? 500000 : undefined,
        },
        signal,
      ),
    getNextPageParam: (last, all) =>
      all.length < last.pages ? all.length + 1 : undefined,
  });

  const rows =
    products.data?.pages
      .flatMap((page) => page.data)
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.id === product.id) === index,
      ) ?? [];
  const parent = categories.data?.find((item) => item.id === category);
  const options =
    categories.data?.filter(
      (item) =>
        item.count > 0 &&
        (item.parent === 0 ||
          item.parent === category ||
          item.parent === parent?.parent),
    ) ?? [];

  return (
    <Screen
      scroll={false}
      header={
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Cakes
          </Text>
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
      <FlatList
        key={columns}
        numColumns={columns}
        data={rows}
        keyExtractor={(item) => String(item.id)}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => <ProductTile product={item} />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => {
          if (products.hasNextPage && !products.isFetchingNextPage) {
            void products.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={8}
        windowSize={7}
        refreshing={products.isRefetching && !products.isFetchingNextPage}
        onRefresh={() => void products.refetch()}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.search}>
              <Ionicons
                name="search-outline"
                size={20}
                color={tokens.color.muted}
              />
              <TextInput
                accessibilityLabel="Search Cake City"
                placeholder="Search cakes..."
                placeholderTextColor={tokens.color.muted}
                selectionColor={tokens.color.brandStrong}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                maxLength={120}
                onSubmitEditing={() => {
                  if (search.trim()) remember(search.trim());
                }}
                style={styles.searchInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  filtersOpen ? "Close filters" : "Open filters"
                }
                accessibilityState={{ expanded: filtersOpen }}
                onPress={() => setFiltersOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.filterButton,
                  pressed && styles.filterButtonPressed,
                ]}
              >
                <Ionicons name="options-outline" size={19} color="#FFFFFF" />
              </Pressable>
            </View>

            {!search && recent.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {recent.map((term) => (
                  <Chip
                    key={term}
                    label={term}
                    onPress={() => setSearch(term)}
                  />
                ))}
              </ScrollView>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip
                label="All"
                selected={!category}
                onPress={() => setCategory(undefined)}
              />
              {options.slice(0, 16).map((item) => (
                <Chip
                  key={item.id}
                  label={plainText(item.name)}
                  selected={category === item.id}
                  onPress={() => setCategory(item.id)}
                />
              ))}
            </ScrollView>

            {filtersOpen ? (
              <View style={styles.filters}>
                <Text style={styles.filterLabel}>Sort and refine</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  {[
                    ["popularity", "Popular"],
                    ["date", "Just added"],
                    ["price", "Price: low to high"],
                    ["price-desc", "Price: high to low"],
                  ].map(([id, label]) => (
                    <Chip
                      key={id}
                      label={label}
                      selected={sort === id}
                      onPress={() => setSort(id)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.quickFilters}>
                  <Chip
                    label="Special prices"
                    selected={sale}
                    onPress={() => setSale((enabled) => !enabled)}
                  />
                  <Chip
                    label="Under KSh 5,000"
                    selected={budget}
                    onPress={() => setBudget((enabled) => !enabled)}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.results}>
              <Text style={styles.resultsTitle}>
                {category
                  ? plainText(
                      categories.data?.find((item) => item.id === category)
                        ?.name ?? "Cakes",
                    )
                  : "All cakes"}
              </Text>
              <Text style={styles.resultsCount}>
                {products.data?.pages[0]?.total ?? rows.length} results
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Feedback
            loading={products.isPending}
            error={products.error}
            empty={
              !products.isPending && !products.error
                ? "No cakes found for that search."
                : undefined
            }
            onRetry={() => void products.refetch()}
          />
        }
        ListFooterComponent={
          products.isFetchingNextPage ? (
            <Feedback loading />
          ) : products.isError && rows.length ? (
            <Button
              label="Load more cakes"
              variant="outline"
              onPress={() => void products.fetchNextPage()}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    width: "100%",
    maxWidth: 900,
    minHeight: 64,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerSpacer: { width: 92 },
  headerTitle: {
    color: tokens.color.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  headerActions: {
    width: 92,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  content: {
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  columns: { gap: 12 },
  listHeader: { gap: 14, paddingBottom: 4 },
  search: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: "#F7F0F1",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    color: tokens.color.ink,
    fontSize: 16,
  },
  filterButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: tokens.color.brandStrong,
  },
  filterButtonPressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  chips: { gap: 8, paddingRight: 8 },
  filters: {
    gap: 11,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  filterLabel: {
    color: tokens.color.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  quickFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  results: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 2,
  },
  resultsTitle: {
    flex: 1,
    color: tokens.color.ink,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "900",
  },
  resultsCount: { color: tokens.color.muted, fontSize: 11, fontWeight: "700" },
});
