import { Pressable, View } from "react-native";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { membershipPalette } from "./member-card";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { Disclosure } from "@/components/ui/Disclosure";
import { useTheme } from "@/theme/ThemeProvider";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { money } from "@/features/commerce/contracts";

/** One next goal; the full tier map stays available on demand. */
export function ClubJourney({
  points,
  minimum,
  journey,
}: {
  points: number;
  minimum: number;
  journey: {
    qualifying_spend_kes: number;
    lifetime_points: number;
    purchase_count?: number;
    purchases_per_milestone?: number;
    milestones: { name: string; spend_kes: number }[];
  };
}) {
  const { colors, isDark } = useTheme();
  const [chapter, setChapter] = useState<string | null>(null);
  const next = journey.milestones.find(
    (step) => step.spend_kes > journey.qualifying_spend_kes,
  );
  const previous = [...journey.milestones]
    .reverse()
    .find((step) => step.spend_kes <= journey.qualifying_spend_kes);
  const palette = membershipPalette(
    chapter || next?.name || previous?.name || "Silver",
  );
  const chapterAccent = isDark
    ? palette.gradient[0]
    : palette === membershipPalette("Platinum")
      ? "#52657D"
      : palette.accent;
  return (
    <View testID="club-journey" style={{ gap: 12 }}>
      <View style={{ gap: 10, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name={next ? "sparkles-outline" : "trophy-outline"}
            size={20}
            color={chapterAccent}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{ color: colors.ink, fontWeight: "700", fontSize: 15 }}
            >
              {next ? `Next chapter: ${next.name}` : "Every tier unlocked"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {next
                ? journey.purchases_per_milestone
                  ? `${journey.purchases_per_milestone - ((journey.purchase_count ?? 0) % journey.purchases_per_milestone)} more purchases to your ${next.name} card`
                  : `${money(next.spend_kes - journey.qualifying_spend_kes)} qualifying spend to your next card`
                : "Enjoy your highest Club tier"}
            </Text>
          </View>
        </View>
        <MilestoneProgressBar
          current={
            next ? journey.qualifying_spend_kes - (previous?.spend_kes ?? 0) : 1
          }
          total={next ? next.spend_kes - (previous?.spend_kes ?? 0) : 1}
          color={chapterAccent}
          trackColor={colors.brandLight}
          label={next ? `Progress to ${next.name}` : "All tiers unlocked"}
          height={5}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          padding: 16,
          borderRadius: 24,
          backgroundColor: colors.surfaceRaised,
        }}
      >
        {journey.milestones.map((step, index) => {
          const unlocked = journey.qualifying_spend_kes >= step.spend_kes;
          return (
            <Pressable
              key={step.name}
              accessibilityRole="button"
              accessibilityLabel={`Explore ${step.name}${unlocked ? ", unlocked" : ""}`}
              accessibilityState={{ selected: chapter === step.name }}
              onPress={() => setChapter(step.name)}
              style={{ flex: 1, alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: membershipPalette(step.name).gradient[0],
                  borderWidth: chapter === step.name ? 2 : 0,
                  borderColor: membershipPalette(step.name).accent,
                }}
              >
                <Ionicons
                  name={
                    unlocked
                      ? "checkmark"
                      : index === journey.milestones.length - 1
                        ? "diamond-outline"
                        : "ribbon-outline"
                  }
                  color={membershipPalette(step.name).ink}
                  size={20}
                />
              </View>
              <Text
                style={{
                  color: unlocked ? colors.success : colors.muted,
                  fontSize: 10,
                  fontWeight: "800",
                }}
              >
                {step.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {chapter ? (
        <LinearGradient
          colors={[...palette.gradient]}
          style={{ padding: 20, borderRadius: 24, gap: 8 }}
        >
          <Text style={{ color: palette.ink, fontSize: 22, fontWeight: "800" }}>
            {chapter} chapter
          </Text>
          <Text style={{ color: palette.muted, lineHeight: 21 }}>
            {journey.qualifying_spend_kes >=
            (journey.milestones.find((s) => s.name === chapter)?.spend_kes ??
              Infinity)
              ? "Unlocked. Your membership is part of every celebration."
              : `Your ${chapter} card is waiting. Follow your progress and explore the published benefits in My rewards.`}
          </Text>
        </LinearGradient>
      ) : null}
      {journey.purchases_per_milestone && next ? (
        <View
          style={{
            padding: 18,
            borderRadius: 22,
            backgroundColor: colors.brandLight,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="gift-outline"
                size={23}
                color={colors.brandStrong}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ color: colors.ink, fontSize: 15, fontWeight: "800" }}
              >
                Your next sweet chapter
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {(journey.purchase_count ?? 0) %
                  journey.purchases_per_milestone}{" "}
                of {journey.purchases_per_milestone} celebrations towards{" "}
                {next.name}
              </Text>
            </View>
          </View>
          <View
            style={{ flexDirection: "row", gap: 6 }}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: journey.purchases_per_milestone,
              now:
                (journey.purchase_count ?? 0) % journey.purchases_per_milestone,
            }}
            accessibilityLabel={`Celebrations towards ${next.name}`}
          >
            {Array.from({ length: journey.purchases_per_milestone }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 7,
                  borderRadius: 5,
                  backgroundColor:
                    i <
                    (journey.purchase_count ?? 0) %
                      journey.purchases_per_milestone!
                      ? colors.success
                      : colors.border,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Disclosure title="Explore card levels">
        {journey.milestones.map((step) => (
          <View
            key={step.name}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 12,
            }}
          >
            <Ionicons
              name={
                journey.qualifying_spend_kes >= step.spend_kes
                  ? "checkmark-circle"
                  : "lock-closed-outline"
              }
              size={20}
              color={
                journey.qualifying_spend_kes >= step.spend_kes
                  ? colors.brandStrong
                  : colors.muted
              }
            />
            <Text style={{ flex: 1, color: colors.ink, fontWeight: "600" }}>
              {step.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {step.spend_kes ? money(step.spend_kes) : "Welcome card"}
            </Text>
          </View>
        ))}
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          {points >= minimum
            ? "Your next reward is ready to explore in My rewards."
            : `Earn ${Math.max(0, minimum - points)} more points to reach your next reward.`}{" "}
          Card levels follow verified qualifying spend.
        </Text>
      </Disclosure>
    </View>
  );
}
