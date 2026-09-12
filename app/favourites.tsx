import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  AccountRequired,
  Feedback,
  ui,
} from "@/components/ui/Commerce";
import { customerApi } from "@/features/commerce/api";
import { money } from "@/features/commerce/contracts";
export default function Favourites() {
  const { customer } = useAuth();
  const q = useQuery({
    queryKey: ["favourites", customer?.id],
    queryFn: customerApi.favourites,
    enabled: !!customer,
  });
  return (
    <Screen title="The ones you love." back>
      <AccountRequired>
        <Feedback
          loading={q.isPending}
          error={q.error}
          empty={
            q.data?.length === 0 ? "Your favourites deserve a home." : undefined
          }
          onRetry={() => void q.refetch()}
        />
        {q.data?.map((p) => (
          <Pressable
            accessibilityRole="button"
            key={p.slug}
            onPress={() =>
              router.push({
                pathname: "/product/[id]",
                params: { id: "saved", slug: p.slug },
              })
            }
            style={[ui.panel, ui.row]}
          >
            {p.image_url ? (
              <Image
                source={p.image_url}
                cachePolicy="memory-disk"
                style={{ width: 85, height: 85, borderRadius: 14 }}
              />
            ) : null}
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={ui.label}>{p.name}</Text>
              <Text style={ui.body}>{money(p.price_kes)}</Text>
              <Text style={ui.eyebrow}>
                {p.in_stock ? "MAKE IT YOURS →" : "CURRENTLY UNAVAILABLE"}
              </Text>
            </View>
          </Pressable>
        ))}
      </AccountRequired>
    </Screen>
  );
}
