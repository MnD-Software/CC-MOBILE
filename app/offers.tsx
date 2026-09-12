import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { Screen, Feedback, ui } from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { shopApi } from "@/features/commerce/api";
import { usePreferences } from "@/features/commerce/store";
import { activeCampaigns, money } from "@/features/commerce/contracts";
export default function Offers() {
  const branch = usePreferences((s) => s.branch);
  const q = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
  });
  const campaigns = activeCampaigns(q.data?.campaigns ?? [], branch?.id);
  return (
    <Screen title="Extra reasons to smile." back>
      <Text style={ui.body}>
        Cake City specials, seasonal celebrations and app exclusives, when
        available for you.
      </Text>
      <Feedback
        loading={q.isPending}
        error={q.error}
        empty={
          q.isSuccess && !campaigns.length
            ? "No offers available for your selection right now."
            : undefined
        }
        onRetry={() => void q.refetch()}
      />
      {campaigns.map((p) => (
        <View key={p.id} style={ui.panel}>
          {p.image_url ? (
            <Image
              source={p.image_url}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={{ height: 180, borderRadius: 14 }}
            />
          ) : null}
          <Text style={ui.eyebrow}>
            {p.app_exclusive ? "APP EXCLUSIVE" : "CAKE CITY SPECIAL"}
          </Text>
          <Text style={ui.title}>{p.title}</Text>
          <Text style={ui.body}>{p.description}</Text>
          {p.coupon_code ? (
            <Text selectable style={ui.heading}>
              {p.coupon_code}
            </Text>
          ) : null}
          <Text style={ui.body}>
            Minimum order {money(p.minimum_order)} · Ends{" "}
            {new Date(p.ends_at).toLocaleDateString("en-KE")}
          </Text>
          {p.eligibility_message ? (
            <Text style={ui.body}>{p.eligibility_message}</Text>
          ) : null}
          <Button
            label="Explore the offer"
            onPress={() =>
              router.push(
                p.product_slugs[0]
                  ? {
                      pathname: "/product/[id]",
                      params: { id: "offer", slug: p.product_slugs[0] },
                    }
                  : {
                      pathname: "/(tabs)/shop",
                      params: {
                        category: p.category_ids[0]
                          ? String(p.category_ids[0])
                          : "",
                        offers: "1",
                      },
                    },
              )
            }
          />
        </View>
      ))}
      <Button
        variant="outline"
        label="Browse current special prices"
        onPress={() =>
          router.push({ pathname: "/(tabs)/shop", params: { offers: "1" } })
        }
      />
    </Screen>
  );
}
