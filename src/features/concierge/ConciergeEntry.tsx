import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Text } from "@/components/ui/Typography";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

export function ConciergeEntry() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Cake City personal assistant"
      onPress={() => router.push("/concierge")}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <LinearGradient colors={["#442036", "#A52A68"]} style={styles.icon}>
        <Ionicons name="sparkles" size={22} color="#FFE1A8" />
      </LinearGradient>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>
          A little help finding the one?
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
          Meet your Cake City concierge
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.brandStrong} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    ...tokens.shadow.card,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
