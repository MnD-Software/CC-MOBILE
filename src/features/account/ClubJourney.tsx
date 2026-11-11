import { View } from "react-native";
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
    milestones: { name: string; spend_kes: number }[];
  };
}) {
  const { colors } = useTheme();
  const next = journey.milestones.find(
    (step) => step.spend_kes > journey.qualifying_spend_kes,
  );
  const previous = [...journey.milestones]
    .reverse()
    .find((step) => step.spend_kes <= journey.qualifying_spend_kes);
  return (
    <View testID="club-journey" style={{ gap: 12 }}>
      <View style={{ gap: 10, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name={next ? "sparkles-outline" : "trophy-outline"}
            size={20}
            color={colors.brandStrong}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{ color: colors.ink, fontWeight: "700", fontSize: 15 }}
            >
              {next ? `Next chapter: ${next.name}` : "Every tier unlocked"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {next
                ? `${money(next.spend_kes - journey.qualifying_spend_kes)} qualifying spend to your next card`
                : "Enjoy your highest Club tier"}
            </Text>
          </View>
        </View>
        <MilestoneProgressBar
          current={
            next ? journey.qualifying_spend_kes - (previous?.spend_kes ?? 0) : 1
          }
          total={next ? next.spend_kes - (previous?.spend_kes ?? 0) : 1}
          color={colors.brandStrong}
          trackColor={colors.brandLight}
          label={next ? `Progress to ${next.name}` : "All tiers unlocked"}
          height={5}
        />
      </View>
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
