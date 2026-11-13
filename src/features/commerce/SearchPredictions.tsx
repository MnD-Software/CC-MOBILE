import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingImage as Image } from "@/components/ui/LoadingImage";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { SearchLoading } from "./SearchLoading";
import { shopApi } from "./api";
import { money, plainText, productPrice } from "./contracts";
import { suggestedSearchTerm } from "./search-intelligence";

/** Small, cancellable catalogue lookups. Suggestions are real product records. */
export function SearchPredictions({
  query,
  active,
  onSearch,
}: {
  query: string;
  active: boolean;
  onSearch: (value: string) => void;
}) {
  const { colors } = useTheme();
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);
  const corrected = suggestedSearchTerm(term);
  const searchTerm = suggestedSearchTerm(query.trim()) ?? query.trim();
  const results = useQuery({
    queryKey: ["catalogue", "predictions", corrected ?? term],
    queryFn: ({ signal }) =>
      shopApi.products({ search: corrected ?? term, perPage: 4 }, signal),
    enabled: active && term.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!active || query.trim().length < 2) return null;
  return (
    <View
      testID="search-predictions"
      style={{
        padding: 10,
        gap: 2,
        backgroundColor: colors.surface,
        borderRadius: 16,
      }}
    >
      {results.isFetching || term !== query.trim() ? (
        <SearchLoading compact />
      ) : (
        <Text style={{ color: colors.muted, fontSize: 11, padding: 6 }}>
          Suggestions
        </Text>
      )}
      {term === query.trim()
        ? results.data?.data.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${plainText(product.name)}`}
              onPress={() =>
                router.push({
                  pathname: "/product/[id]",
                  params: { id: String(product.id), slug: product.slug },
                })
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 7,
                minHeight: 52,
              }}
            >
              <Image
                source={product.images[0]?.src}
                style={{ width: 38, height: 38, borderRadius: 8 }}
                contentFit="cover"
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}
                >
                  {plainText(product.name)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {productPrice(product) === null
                    ? "View options"
                    : money(productPrice(product)!)}
                </Text>
              </View>
              <Ionicons
                name="arrow-up-outline"
                size={16}
                color={colors.muted}
                style={{ transform: [{ rotate: "45deg" }] }}
              />
            </Pressable>
          ))
        : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => onSearch(searchTerm)}
        style={{
          padding: 10,
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="search" size={16} color={colors.brandStrong} />
        <Text
          style={{ color: colors.brandStrong, fontSize: 13, fontWeight: "700" }}
        >
          Search “{searchTerm}”
        </Text>
      </Pressable>
      {results.isError ? (
        <Text style={{ color: colors.muted, fontSize: 11, padding: 6 }}>
          Suggestions unavailable. Tap search to retry.
        </Text>
      ) : null}
    </View>
  );
}
