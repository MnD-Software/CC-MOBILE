import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Chip,
  CommerceBrowseHeader,
  Feedback,
  IconButton,
  ProductTile,
  Screen,
} from "@/components/ui/Commerce";
import { ProfileAvatarButton } from "@/components/ProfileAvatar";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { plainText, type StoreProduct } from "./contracts";
import { CATALOGUE_GC_TIME_MS, CATALOGUE_STALE_TIME_MS, shopApi } from "./api";
import { homeCollections } from "./collection-artwork";
import { suggestedSearchTerm, browseSearchIdeas } from "./search-intelligence";
import { usePreferences } from "./store";
import { parseBudget } from "./shop-browse";

// Do not include the broad Classics parent (71): its children also contain
// party accessories and a published test record, not just cakes.
const menuCategories = [229, 168, 169, 170, 171, 72, 110, 112];
const departments = [
  { label: "Signature", id: 229 },
  { label: "Menu cakes", id: 0 },
  { label: "Chocolate sponge", id: 168 },
  { label: "Pound cakes", id: 170 },
  { label: "Vanilla sponge", id: 169 },
  { label: "Cheesecakes", id: 171 },
] as const;
const roots = [
  { id: 229, name: "Signature", icon: "ribbon-outline" },
  { id: 168, name: "Chocolate", icon: "cafe-outline" },
  { id: 169, name: "Vanilla", icon: "flower-outline" },
  { id: 170, name: "Pound", icon: "layers-outline" },
  { id: 171, name: "Cheesecakes", icon: "pie-chart-outline" },
  { id: 72, name: "Instant cakes", icon: "flash-outline" },
  { id: 110, name: "Cupcakes", icon: "ice-cream-outline" },
  { id: 112, name: "Tea cakes", icon: "cafe-outline" },
] as const;
const knownIds: Record<string, number> = {
  "signature cakes": 229,
  "chocolate base sponge": 168,
  "vanilla base sponge": 169,
  "pound cakes": 170,
  "cheese cakes": 171,
  "custom cakes": 123,
  "deals and steals": 206,
};

export function ShopScreen({ searchOnly = false }: { searchOnly?: boolean }) {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{
    category?: string;
    categoryName?: string;
    search?: string;
    department?: string;
    focus?: string;
  }>();
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<StoreProduct>>(null);
  const [search, setSearch] = useState(params.search ?? "");
  const [debounced, setDebounced] = useState(search);
  const [department, setDepartment] = useState(0);
  const [category, setCategory] = useState<number | undefined>();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [budget, setBudget] = useState<Partial<ReturnType<typeof parseBudget>>>(
    {},
  );
  const [budgetError, setBudgetError] = useState("");
  const rememberSearch = usePreferences((s) => s.search);
  const recentSearches = usePreferences((s) => s.recentSearches);

  useEffect(() => {
    const selected = params.category
      ? Number(params.category)
      : knownIds[plainText(params.categoryName ?? "").toLowerCase()];
    setCategory(
      Number.isSafeInteger(selected) && selected > 0 ? selected : undefined,
    );
    setDepartment(
      departments.some((item) => item.id === selected) ? selected : 0,
    );
    setSearch(params.search ?? "");
  }, [params.category, params.categoryName, params.search]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const categoriesQuery = useQuery({
    queryKey: ["catalogue", "categories"],
    queryFn: ({ signal }) => shopApi.categories(signal),
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
  });
  const childCategories = (categoriesQuery.data ?? []).filter(
    (item) => item.parent === department,
  );
  const rail =
    department && childCategories.length
      ? childCategories.map((item) => ({
          id: item.id,
          name: plainText(item.name),
          icon: "sparkles-outline" as const,
        }))
      : roots;
  const selectedCategories =
    debounced && !category && !department
      ? undefined
      : category
        ? [category]
        : department
          ? [department]
          : menuCategories;
  const products = useInfiniteQuery({
    queryKey: [
      "catalogue",
      "shop-browse",
      { search: debounced, categories: selectedCategories, ...budget },
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      shopApi.browseProducts(
        {
          page: pageParam,
          perPage: 16,
          search: debounced,
          categories: selectedCategories,
          ...budget,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextPage,
    staleTime: CATALOGUE_STALE_TIME_MS,
    gcTime: CATALOGUE_GC_TIME_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const rows = useMemo(
    () => [
      ...new Map(
        (products.data?.pages.flatMap((page) => page.data) ?? []).map(
          (product) => [product.id, product],
        ),
      ).values(),
    ],
    [products.data],
  );
  const activeName =
    (categoriesQuery.data ?? []).find((item) => item.id === category)?.name ??
    roots.find((item) => item.id === category)?.name ??
    departments.find((item) => item.id === department)?.label ??
    "Menu cakes";
  const title = debounced
    ? `Results for “${debounced}”`
    : plainText(activeName);
  const collection =
    homeCollections.find(
      (item) => knownIds[item.lookup[0]] === (category ?? department),
    ) ?? homeCollections[5];
  const hasBudget =
    budget.minimumKes !== undefined || budget.maximumKes !== undefined;
  const budgetLabel = hasBudget
    ? `${budget.minimumKes ?? 0}${budget.maximumKes === undefined ? "+" : `–${budget.maximumKes}`} KSh`
    : "Your budget";
  const suggestion = suggestedSearchTerm(debounced);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [department, category, debounced, budget]);

  const selectDepartment = (id: number) => {
    setDepartment(id);
    setCategory(undefined);
    setSearch("");
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setCategory(undefined);
    setDepartment(0);
  };
  const applyBudget = () => {
    try {
      setBudget(parseBudget(minimum, maximum));
      setBudgetError("");
      setBudgetOpen(false);
    } catch (error) {
      setBudgetError(
        error instanceof Error ? error.message : "Check your budget.",
      );
    }
  };
  return (
    <Screen
      scroll={false}
      header={
        <CommerceBrowseHeader
          right={<ProfileAvatarButton />}
          brand={
            <View style={styles.titleRow}>
              {searchOnly ? (
                <IconButton
                  name="arrow-back"
                  label="Go back"
                  plain
                  onPress={() =>
                    router.canGoBack()
                      ? router.back()
                      : router.navigate("/(tabs)/shop")
                  }
                />
              ) : null}
              <Text accessibilityRole="header" style={styles.title}>
                {searchOnly ? "Find your cake" : "The cake shop"}
              </Text>
            </View>
          }
        >
          <GlassSurface style={styles.searchGlass}>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={20} color={colors.cocoa} />
              <TextInput
                ref={searchInputRef}
                value={search}
                onChangeText={changeSearch}
                placeholder="Search cakes, flavours, occasions"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Search Cake City"
                autoFocus={searchOnly || params.focus === "1"}
                maxLength={120}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (search.trim()) rememberSearch(search.trim());
                  setDebounced(search.trim());
                }}
                style={styles.searchInput}
              />
              {search ? (
                <IconButton
                  name="close-circle"
                  label="Clear search"
                  plain
                  onPress={() => changeSearch("")}
                />
              ) : null}
            </View>
          </GlassSurface>
        </CommerceBrowseHeader>
      }
    >
      <View style={styles.shell}>
        <View style={styles.departments}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.departmentContent}
          >
            {departments.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                selected={department === item.id}
                filled
                onPress={() => selectDepartment(item.id)}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.body}>
          {!searchOnly && !debounced ? (
            <ScrollView
              style={styles.sidebar}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 112 }}
            >
              {[
                { id: 0, name: "All cakes", icon: "grid-outline" as const },
                ...rail,
              ].map((item) => {
                const selected = item.id === (category ?? 0);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setCategory(item.id || undefined);
                      if (item.id && (!department || !childCategories.length))
                        setDepartment(0);
                    }}
                    style={[styles.railItem, selected && styles.railSelected]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={selected ? colors.brandStrong : colors.cocoa}
                    />
                    <Text
                      numberOfLines={3}
                      style={[
                        styles.railText,
                        selected && {
                          color: colors.brandStrong,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          <FlatList
            ref={listRef}
            style={styles.productPane}
            data={rows}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <ProductTile product={item} layout="row" />
            )}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 128 },
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            refreshing={products.isRefetching && !products.isFetchingNextPage}
            onRefresh={() => {
              void products.refetch();
              void categoriesQuery.refetch();
            }}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (
                products.hasNextPage &&
                !products.isFetching &&
                !products.isError
              )
                void products.fetchNextPage();
            }}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {!debounced && !searchOnly ? (
                  <View
                    style={[
                      styles.banner,
                      {
                        backgroundColor: isDark
                          ? colors.surfaceTint
                          : collection.tint,
                      },
                    ]}
                  >
                    <View style={styles.bannerCopy}>
                      <Text style={styles.eyebrow}>BAKED FOR YOUR MOMENT</Text>
                      <Text style={styles.bannerTitle}>
                        A little slice{`\n`}of happiness.
                      </Text>
                      <Text style={styles.bannerSubtitle}>
                        Find your celebration cake.
                      </Text>
                    </View>
                    <Image
                      source={{ uri: collection.image }}
                      contentFit="contain"
                      style={styles.bannerImage}
                      accessibilityLabel={collection.name}
                    />
                  </View>
                ) : null}
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {title}
                </Text>
                <View style={styles.filterRow}>
                  <Text style={styles.sortLabel}>Price: low to high</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Filter by budget"
                    onPress={() => {
                      setMinimum(
                        budget.minimumKes === undefined
                          ? ""
                          : String(budget.minimumKes),
                      );
                      setMaximum(
                        budget.maximumKes === undefined
                          ? ""
                          : String(budget.maximumKes),
                      );
                      setBudgetError("");
                      setBudgetOpen(true);
                    }}
                    style={[
                      styles.budgetButton,
                      hasBudget && styles.budgetActive,
                    ]}
                  >
                    <Ionicons
                      name="options-outline"
                      size={16}
                      color={tokens.color.brandStrong}
                    />
                    <Text style={styles.budgetText}>{budgetLabel}</Text>
                  </Pressable>
                </View>
                {hasBudget ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setBudget({})}
                    style={styles.clearBudget}
                  >
                    <Text style={styles.budgetText}>Clear budget ×</Text>
                  </Pressable>
                ) : null}
                {searchOnly && !debounced ? (
                  <View style={styles.suggestions}>
                    {(recentSearches.length
                      ? recentSearches.slice(0, 4)
                      : browseSearchIdeas.slice(0, 4)
                    ).map((term) => (
                      <Chip
                        key={term}
                        label={term}
                        onPress={() => changeSearch(term)}
                      />
                    ))}
                  </View>
                ) : null}
                {suggestion && suggestion !== debounced ? (
                  <Pressable
                    onPress={() => changeSearch(suggestion)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.budgetText}>Try “{suggestion}”</Text>
                  </Pressable>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              products.isPending ? (
                <View style={{ gap: 12 }}>
                  {[0, 1, 2].map((key) => (
                    <Skeleton key={key} height={142} radius={18} />
                  ))}
                </View>
              ) : products.isError ? (
                <Feedback
                  error={products.error}
                  onRetry={() => void products.refetch()}
                />
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.sectionTitle}>
                    No cakes in this selection
                  </Text>
                  <Text style={styles.sortLabel}>
                    Try a wider budget or another collection.
                  </Text>
                  <Button
                    label="Reset filters"
                    variant="outline"
                    onPress={() => {
                      setBudget({});
                      selectDepartment(0);
                    }}
                  />
                </View>
              )
            }
            ListFooterComponent={
              products.isFetchingNextPage ? (
                <ActivityIndicator
                  style={{ padding: 20 }}
                  color={tokens.color.brandStrong}
                />
              ) : products.isError && rows.length ? (
                <Feedback
                  error={products.error}
                  onRetry={() =>
                    void (products.isFetchNextPageError
                      ? products.fetchNextPage()
                      : products.refetch())
                  }
                />
              ) : rows.length && !products.hasNextPage ? (
                <Text style={styles.endNote}>
                  You've seen this selection. Explore another collection.
                </Text>
              ) : null
            }
          />
        </View>
      </View>
      <Modal
        visible={budgetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBudgetOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.dismissArea}
            accessibilityLabel="Close budget filter"
            accessibilityRole="button"
            onPress={() => setBudgetOpen(false)}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: Math.max(24, insets.bottom + 16) },
            ]}
          >
            <View style={styles.filterRow}>
              <Text accessibilityRole="header" style={styles.title}>
                Find your sweet spot
              </Text>
              <IconButton
                name="close"
                label="Close budget filter"
                onPress={() => setBudgetOpen(false)}
              />
            </View>
            <Text style={styles.sortLabel}>
              Set your cake budget in KSh. Final options and delivery are priced
              at checkout.
            </Text>
            <View style={styles.budgetInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Minimum</Text>
                <TextInput
                  accessibilityLabel="Minimum budget in KSh"
                  value={minimum}
                  onChangeText={setMinimum}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  maxLength={10}
                  style={styles.budgetInput}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Maximum</Text>
                <TextInput
                  accessibilityLabel="Maximum budget in KSh"
                  value={maximum}
                  onChangeText={setMaximum}
                  placeholder="No limit"
                  keyboardType="decimal-pad"
                  maxLength={10}
                  style={styles.budgetInput}
                />
              </View>
            </View>
            <View style={styles.suggestions}>
              {[2500, 4000, 6000].map((amount) => (
                <Chip
                  key={amount}
                  label={`Under ${amount.toLocaleString()}`}
                  selected={maximum === String(amount) && !minimum}
                  onPress={() => {
                    setMinimum("");
                    setMaximum(String(amount));
                  }}
                />
              ))}
            </View>
            {budgetError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {budgetError}
              </Text>
            ) : null}
            <Button label="Show cakes in my budget" onPress={applyBudget} />
            <Button
              label="Clear budget"
              variant="ghost"
              onPress={() => {
                setBudget({});
                setBudgetOpen(false);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.7,
    color: tokens.color.ink,
  },
  searchGlass: { borderRadius: 15 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 13,
    minHeight: 44,
    gap: 9,
    backgroundColor: "#F8F7F8",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 13,
    color: tokens.color.ink,
  },
  departments: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  departmentContent: { paddingHorizontal: 12, gap: 8 },
  body: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 74,
    flexGrow: 0,
    backgroundColor: "#F7F6F7",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#ECE8EB",
  },
  railItem: {
    minHeight: 86,
    paddingVertical: 15,
    paddingHorizontal: 5,
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  railSelected: {
    backgroundColor: "#FFFFFF",
    borderLeftColor: tokens.color.brand,
  },
  railText: {
    fontSize: 10,
    lineHeight: 13,
    color: tokens.color.muted,
    textAlign: "center",
  },
  productPane: { flex: 1, backgroundColor: "#F6F4F6" },
  content: { padding: 10, flexGrow: 1 },
  listHeader: { gap: 12, paddingBottom: 14 },
  banner: {
    height: 142,
    borderRadius: 26,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
  },
  bannerCopy: { flex: 1, paddingLeft: 13, zIndex: 1 },
  eyebrow: {
    fontSize: 7,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: tokens.color.brandStrong,
  },
  bannerTitle: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 9,
    color: tokens.color.cocoa,
  },
  bannerSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
    color: tokens.color.muted,
  },
  bannerImage: { width: "43%", height: 128 },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    color: tokens.color.ink,
    letterSpacing: -0.4,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sortLabel: { fontSize: 11, lineHeight: 17, color: tokens.color.muted },
  budgetButton: {
    minHeight: 36,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EADFE5",
  },
  budgetActive: {
    backgroundColor: tokens.color.brandLight,
    borderColor: tokens.color.brandStrong,
  },
  budgetText: {
    fontSize: 11,
    fontWeight: "700",
    color: tokens.color.brandStrong,
  },
  clearBudget: {
    minHeight: 30,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  suggestions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  empty: { padding: 14, gap: 15, borderRadius: 16, backgroundColor: "#FFFFFF" },
  endNote: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    paddingVertical: 24,
    color: tokens.color.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(25,15,22,0.4)",
    justifyContent: "flex-end",
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    gap: 18,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  budgetInputs: { flexDirection: "row", gap: 14 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: tokens.color.cocoa,
    marginBottom: 8,
  },
  budgetInput: {
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
    borderRadius: 13,
    height: 48,
    paddingHorizontal: 13,
    fontSize: 16,
    color: tokens.color.ink,
    backgroundColor: "#FCFAFC",
  },
  error: { color: tokens.color.error, fontSize: 13 },
});
