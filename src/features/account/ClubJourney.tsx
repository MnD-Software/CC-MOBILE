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
    purchase_count?: number;
    purchases_per_milestone?: number;
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
          color={colors.brandStrong}
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
            <View
              key={step.name}
              style={{ flex: 1, alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: unlocked
                    ? colors.successLight
                    : colors.surface,
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
                  color={unlocked ? colors.success : colors.muted}
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
            </View>
          );
        })}
      </View>
      {journey.purchases_per_milestone && next ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {Array.from(
            { length: journey.purchases_per_milestone },
            (_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                  backgroundColor:
                    index <
                    (journey.purchase_count ?? 0) %
                      journey.purchases_per_milestone!
                      ? colors.successLight
                      : colors.brandLight,
                }}
              >
                <Ionicons
                  name={
                    index <
                    (journey.purchase_count ?? 0) %
                      journey.purchases_per_milestone!
                      ? "checkmark-circle"
                      : "gift-outline"
                  }
                  color={
                    index <
                    (journey.purchase_count ?? 0) %
                      journey.purchases_per_milestone!
                      ? colors.success
                      : colors.brandStrong
                  }
                  size={22}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: colors.ink,
                    marginTop: 6,
                  }}
                >
                  Purchase {index + 1}
                </Text>
              </View>
            ),
          )}
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
