import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { ProductTile } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { shopApi, CATALOGUE_STALE_TIME_MS } from "./api";
import { cartSuggestions } from "./cart-upselling";
import { type BagLine, type StoreProduct } from "./contracts";

export function CartSuggestions({ lines }: { lines: BagLine[] }) {
  const { colors } = useTheme();
  const offers = useQuery({
    queryKey: ["catalogue", "cart", "offers"],
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled([
        shopApi
          .browseProducts(
            { perPage: 24, sort: "popular", onSale: true },
            signal,
          )
          .then((result) => result.data),
        shopApi.productsByCategory(206, signal),
      ]);
      if (signal.aborted) throw new Error("Request cancelled");
      const successful = results.filter(
        (result) => result.status === "fulfilled",
      );
      if (!successful.length) throw new Error("Offers could not load");
      return { data: successful.flatMap((result) => result.value) };
    },
    staleTime: CATALOGUE_STALE_TIME_MS,
  });
  const popular = useQuery({
    queryKey: ["catalogue", "cart", "popular"],
    queryFn: ({ signal }) =>
      shopApi.browseProducts({ perPage: 24, sort: "popular" }, signal),
    staleTime: CATALOGUE_STALE_TIME_MS,
  });
  const extras = useQuery({
    queryKey: ["catalogue", "cart", "extras"],
    queryFn: async ({ signal }) => {
      const results = await Promise.allSettled(
        ["candle", "cupcake"].map((search) =>
          shopApi.browseProducts(
            { search, perPage: 12, sort: "popular" },
            signal,
          ),
        ),
      );
      if (signal.aborted) throw new Error("Request cancelled");
      const successful = results.filter(
        (result) => result.status === "fulfilled",
      );
      if (!successful.length) throw new Error("Extras could not load");
      return successful.flatMap((result) => result.value.data);
    },
    enabled: lines.length > 0,
    staleTime: CATALOGUE_STALE_TIME_MS,
  });
  const suggestions = cartSuggestions(
    lines,
    offers.data?.data ?? [],
    popular.data?.data ?? [],
    extras.data ?? [],
  );
  const activeQueries = lines.length
    ? [offers, popular, extras]
    : [offers, popular];
  const loading = activeQueries.some(
    (query) => query.isPending && query.isFetching,
  );
  const failed = activeQueries.some((query) => query.isError);
  const hasPairings = lines.length > 0 && suggestions.pairings.length > 0;
  const pairedIds = new Set(
    hasPairings ? suggestions.pairings.map((product) => product.id) : [],
  );

  function rail(title: string, subtitle: string, products: StoreProduct[]) {
    if (!products.length) return null;
    return (
      <View style={{ gap: 10 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          {subtitle}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
        >
          {products.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              compact
              width={168}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ gap: 22 }}>
      {hasPairings
        ? rail(
            "Complete your celebration",
            "A few extras to go with your picks.",
            suggestions.pairings,
          )
        : null}
      {rail(
        "Offers for you",
        "Explore Cake City's offers and Deals & Steals.",
        suggestions.offers.filter((product) => !pairedIds.has(product.id)),
      )}
      {rail(
        "Popular picks",
        "Discover Cake City's popular choices.",
        suggestions.popular.filter((product) => !pairedIds.has(product.id)),
      )}
      {loading ? (
        <ActivityIndicator
          color={colors.brandStrong}
          accessibilityLabel="Loading suggestions"
        />
      ) : null}
      {failed ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>
            Some suggestions could not load.
          </Text>
          <Button
            variant="outline"
            label="Retry suggestions"
            onPress={() => {
              for (const query of activeQueries)
                if (query.isError) void query.refetch();
            }}
          />
        </View>
      ) : !loading &&
        !hasPairings &&
        !suggestions.offers.length &&
        !suggestions.popular.length ? (
        <Text style={{ color: colors.muted }}>
          No suggestions are available right now. Explore the shop for more
          choices.
        </Text>
      ) : null}
    </View>
  );
}
