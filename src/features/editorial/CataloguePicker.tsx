import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { shopApi } from "@/features/commerce/api";
import {
  money,
  plainText,
  productPrice,
  type StoreProduct,
} from "@/features/commerce/contracts";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

export function CataloguePicker({
  visible,
  selected,
  single = false,
  onChoose,
  onClose,
}: {
  visible: boolean;
  selected: string[];
  single?: boolean;
  onChoose: (cake: StoreProduct) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["staff-catalogue", term],
    enabled: visible,
    initialPageParam: 1,
    queryFn: ({ signal, pageParam }) =>
      shopApi.products({ search: term, perPage: 16, page: pageParam }, signal),
    getNextPageParam: (last, _pages, page) =>
      last.pages > page ? page + 1 : undefined,
    staleTime: 60000,
  });
  const cakes = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <BottomSheet
      visible={visible}
      title={single ? "Choose a cake" : "Choose your cakes"}
      onClose={onClose}
      footer={
        <Button
          label={single ? "Done" : `Done · ${selected.length} selected`}
          onPress={onClose}
        />
      }
    >
      <Input
        placeholder="Search by cake name"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {single
          ? "Choose the cake you want to update."
          : "Tap up to 8 cakes to feature in this story."}
      </Text>
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {cakes.map((cake) => {
        const active = selected.includes(cake.slug);
        const disabled = !single && !active && selected.length >= 8;
        const price = productPrice(cake);
        return (
          <Pressable
            key={cake.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active, disabled }}
            accessibilityLabel={`Select ${plainText(cake.name)}`}
            disabled={disabled}
            onPress={() => {
              onChoose(cake);
              if (single) onClose();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 10,
              borderWidth: 1,
              borderColor: active ? colors.brandStrong : colors.border,
              borderRadius: 18,
              backgroundColor: active ? colors.brandLight : colors.surface,
              opacity: disabled ? 0.45 : 1,
            }}
          >
            <Image
              source={cake.images[0]?.src}
              contentFit="contain"
              style={{
                width: 62,
                height: 62,
                borderRadius: 12,
                backgroundColor: "#FFFFFF",
              }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                numberOfLines={2}
                style={{ fontWeight: "700", color: colors.ink }}
              >
                {plainText(cake.name)}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {!cake.is_in_stock
                  ? "Currently out of stock"
                  : price === null
                    ? "Options available"
                    : `From ${money(price)}`}
              </Text>
            </View>
            <Ionicons
              name={active ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={active ? colors.brandStrong : colors.muted}
            />
          </Pressable>
        );
      })}
      {!query.isPending && !query.isError && !cakes.length ? (
        <Text style={{ color: colors.muted }}>
          No cakes found. Try a different name.
        </Text>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="ghost"
          label="See more cakes"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </BottomSheet>
  );
}
