import { useState, useEffect } from "react";
import { AppState, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Screen,
  Feedback,
  Notice,
  ProductTile,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import {
  contentApi,
  activeCampaigns,
  campaignRemaining,
  mediaSource,
} from "@/features/editorial/content";
import { VideoClip } from "@/features/editorial/VideoClip";
import { shopApi } from "@/features/commerce/api";
import { productPrice } from "@/features/commerce/contracts";

export default function OfferStory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [video, setVideo] = useState(false);
  const [now, setNow] = useState(Date.now());
  const content = useQuery({
    queryKey: ["editorial-campaigns"],
    queryFn: ({ signal }) => contentApi.campaigns(signal),
    staleTime: 30_000,
  });
  const story = activeCampaigns(content.data ?? [], now).find(
    (item) => item.id === id,
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState !== "background") setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const products = useQuery({
    queryKey: ["campaign-products", id, story?.revision],
    enabled: !!story,
    queryFn: async ({ signal }) => {
      if (!story) return [];
      if (!story.product_slugs.length)
        return (
          await shopApi.products(
            { category: story.category_id!, perPage: 24 },
            signal,
          )
        ).data;
      const result = await Promise.allSettled(
        story.product_slugs.map((slug) => shopApi.product(slug, signal)),
      );
      if (signal.aborted) throw new Error("Cancelled");
      const fulfilled = result.filter((item) => item.status === "fulfilled");
      if (!fulfilled.length)
        throw new Error("Story cakes could not be loaded.");
      return fulfilled.flatMap((item) => (item.value ? [item.value] : []));
    },
  });
  return (
    <Screen back>
      {content.isPending ? (
        <Notice message="Opening your Cake City story…" />
      ) : content.isError ? (
        <Feedback
          error={content.error}
          onRetry={() => void content.refetch()}
        />
      ) : !story ? (
        <>
          <Notice message="This story has ended. Discover what's fresh in the shop." />
          <Button
            label="Explore cakes"
            onPress={() => router.navigate("/(tabs)/shop")}
          />
        </>
      ) : (
        <>
          <Image
            source={{ uri: mediaSource(story.image_url) }}
            contentFit="contain"
            cachePolicy="memory-disk"
            style={{ width: "100%", aspectRatio: 1, borderRadius: 26 }}
          />
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 26 }}>
            {story.title}
          </Text>
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            {story.description}
          </Text>
          <Text style={{ color: colors.brandStrong, fontWeight: "700" }}>
            {campaignRemaining(story.ends_at, now)}
          </Text>
          {story.branch_names.length ? (
            <Notice
              message={`Available at ${story.branch_names.join(", ")}. Confirm your branch at checkout.`}
            />
          ) : null}
          {story.member_only && !customer ? (
            <>
              <Notice message="Sign in to Club to enjoy member eligibility. Final offers are verified at checkout." />
              <Button
                label="Open my account"
                onPress={() => router.navigate("/(tabs)/account")}
              />
            </>
          ) : null}
          {story.video_url ? (
            video ? (
              <VideoClip url={story.video_url} />
            ) : (
              <Button
                label="Watch the story"
                variant="outline"
                onPress={() => setVideo(true)}
              />
            )
          ) : null}
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>
            Shop this story
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(products.data ?? [])
              .filter(
                (p) =>
                  p.is_purchasable && p.is_in_stock && productPrice(p) !== null,
              )
              .map((product) => (
                <View key={product.id} style={{ width: "48%" }}>
                  <ProductTile product={product} />
                </View>
              ))}
          </View>
          <Feedback
            error={products.error}
            empty={
              !products.isPending && !products.isError && !products.data?.length
                ? "These cakes are unavailable right now. Explore the shop for more ideas."
                : undefined
            }
            onRetry={() => void products.refetch()}
          />
        </>
      )}
    </Screen>
  );
}
