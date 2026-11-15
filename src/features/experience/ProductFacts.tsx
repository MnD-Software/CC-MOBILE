import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Disclosure } from "@/components/ui/Disclosure";
export type Facts = {
  revision: number;
  published: boolean;
  ingredients: string;
  contains: string[];
  may_contain: string[];
  dietary: string[];
  handling: string;
  source: string;
  verified_at?: string;
};
export function ProductFacts({ productId }: { productId: number }) {
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["product-facts", productId],
    queryFn: () =>
      api.get<Facts | null>(`/v1/journey/products/${productId}/facts`),
    staleTime: 60000,
    retry: false,
  });
  const facts = query.data;
  if (!facts) return null;
  return (
    <Disclosure title="Ingredients, allergens & care">
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.ink, lineHeight: 21 }}>
          {facts.ingredients}
        </Text>
        {facts.contains.length ? (
          <Text style={{ color: colors.ink, fontWeight: "700" }}>
            Contains: {facts.contains.join(", ")}
          </Text>
        ) : null}
        {facts.may_contain.length ? (
          <Text style={{ color: colors.muted }}>
            May contain: {facts.may_contain.join(", ")}
          </Text>
        ) : null}
        {facts.dietary.length ? (
          <Text style={{ color: colors.ink }}>{facts.dietary.join(" · ")}</Text>
        ) : null}
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          {facts.handling}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          For allergies or specific dietary needs, confirm suitability with our
          team before ordering.
        </Text>
      </View>
    </Disclosure>
  );
}
