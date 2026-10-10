import { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useScreenActive as useIsFocused } from "@/design/useScreenActive";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import {
  activeCampaigns,
  campaignRemaining,
  contentApi,
  mediaSource,
} from "./content";

export function CampaignStories({ members = false }: { members?: boolean }) {
  const focused = useIsFocused();
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: ["editorial-campaigns"],
    queryFn: ({ signal }) => contentApi.campaigns(signal),
    staleTime: 30_000,
    retry: 1,
    enabled: focused,
    refetchInterval: focused ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!focused) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (timer) clearInterval(timer);
      setNow(Date.now());
      if (AppState.currentState === "active" || AppState.currentState === null)
        timer = setInterval(() => setNow(Date.now()), 1000);
    };
    update();
    const listener = AppState.addEventListener("change", update);
    return () => {
      if (timer) clearInterval(timer);
      listener.remove();
    };
  }, [focused]);
  const stories = activeCampaigns(query.data ?? [], now).filter((item) =>
    members ? item.member_only : !item.member_only || !!customer,
  );
  if (!stories.length) return null;
  return (
    <View style={{ gap: 12, paddingVertical: 8 }}>
      <View
        style={{
          paddingHorizontal: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>
          {members ? "For our members" : "Fresh from Cake City"}
        </Text>
        <Ionicons name="sparkles" size={18} color={colors.brandStrong} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {stories.map((story) => (
          <Pressable
            key={story.id}
            accessibilityRole="button"
            accessibilityLabel={`${story.title}. ${campaignRemaining(story.ends_at, now)}. Open story.`}
            onPress={() =>
              router.push({
                pathname: "/offers/[id]",
                params: { id: story.id },
              })
            }
            style={({ pressed }) => ({
              width: 210,
              borderRadius: 24,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Image
              source={{ uri: mediaSource(story.image_url) }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={{ width: "100%", height: 150 }}
            />
            <View style={{ padding: 12, gap: 5 }}>
              <Text
                style={{
                  color: colors.brandStrong,
                  fontSize: 10,
                  fontWeight: "800",
                  textTransform: "uppercase",
                }}
              >
                {story.member_only
                  ? "Club edit"
                  : story.template === "offer"
                    ? "Special offer"
                    : story.template === "spotlight"
                      ? "Cake spotlight"
                      : "The celebration edit"}
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: colors.ink, fontSize: 15, fontWeight: "800" }}
              >
                {story.title}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {campaignRemaining(story.ends_at, now)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
