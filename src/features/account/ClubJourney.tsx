import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { money } from "@/features/commerce/contracts";

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
  const rewardReady = points >= minimum;
  return (
    <View testID="club-journey" style={{ gap: 16 }}>
      <LinearGradient
        colors={["#310A29", "#731043", "#B80068"]}
        style={{ padding: 22, borderRadius: 26, gap: 14 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{
                color: "#F6B4DA",
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 1.5,
              }}
            >
              YOUR NEXT SWEET WIN
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 23, fontWeight: "800" }}>
              {rewardReady
                ? "A reward is within reach."
                : `${Math.max(0, minimum - points)} points to go.`}
            </Text>
          </View>
          <Ionicons
            name={rewardReady ? "gift" : "sparkles"}
            size={32}
            color="#F6CE70"
          />
        </View>
        <MilestoneProgressBar
          current={points}
          total={minimum}
          color="#F6CE70"
          trackColor="rgba(255,255,255,0.15)"
          height={9}
          label="Points toward reward redemption"
        />
        <Text style={{ color: "#FFE3F2", fontSize: 12, lineHeight: 19 }}>
          {rewardReady
            ? "Explore My rewards below. Checkout confirms reward eligibility."
            : "Every verified purchase adds to your story. Earn points, unlock your next reward and celebrate along the way."}
        </Text>
      </LinearGradient>
      <View
        style={{
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: 24,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons
            name="trophy-outline"
            size={23}
            color={colors.brandStrong}
          />
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>
            Your Club adventure
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            {
              name: "First points",
              unlocked: journey.lifetime_points > 0,
              requirement: "Your journey begins",
            },
            ...journey.milestones.map((step) => ({
              name: step.name,
              unlocked: journey.qualifying_spend_kes >= step.spend_kes,
              requirement:
                step.spend_kes === 0
                  ? "Your starting card"
                  : `${money(step.spend_kes)} qualifying spend`,
            })),
          ].map((step, index) => (
            <View
              key={step.name}
              style={{
                flexBasis: 125,
                flexGrow: 1,
                padding: 14,
                borderRadius: 18,
                gap: 8,
                borderWidth: 1,
                borderColor: step.unlocked ? colors.brandStrong : colors.border,
                backgroundColor: step.unlocked
                  ? colors.brandLight
                  : colors.background,
              }}
            >
              <Ionicons
                name={
                  step.unlocked ? "checkmark-circle" : "lock-closed-outline"
                }
                size={24}
                color={step.unlocked ? colors.brandStrong : colors.muted}
              />
              <Text
                style={{ color: colors.muted, fontSize: 9, letterSpacing: 1 }}
              >
                MILESTONE {index + 1}
              </Text>
              <Text
                style={{ color: colors.ink, fontWeight: "800", fontSize: 15 }}
              >
                {step.name}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}
              >
                {step.requirement}
              </Text>
            </View>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
          {next
            ? `${money(next.spend_kes - journey.qualifying_spend_kes)} qualifying spend to ${next.name}. Your card levels up when the milestone is verified.`
            : "You've unlocked every card tier. Keep enjoying your points and member rewards."}
        </Text>
      </View>
    </View>
  );
}
