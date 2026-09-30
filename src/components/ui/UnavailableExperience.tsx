import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Text, View } from "react-native";
import { tokens } from "@/theme/tokens";
import { Button } from "./Button";
import { Screen } from "./Commerce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";

type UnavailableExperienceProps = {
  title: string;
  heading: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  actionHref?: Href;
};

/**
 * A deliberate, useful state for capabilities that the deployed mobile API
 * does not provide yet. It prevents a deep link from ending in a misleading
 * loading spinner or a raw 404 while keeping the live catalogue one tap away.
 */
export function UnavailableExperience({
  title,
  heading,
  message,
  icon = "sparkles-outline",
  actionLabel = "Browse live cakes",
  actionHref = "/(tabs)/shop",
}: UnavailableExperienceProps) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <Screen title={title} back right={null}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={30} color={colors.brandStrong} />
        </View>
        <Text accessibilityRole="header" style={styles.heading}>
          {heading}
        </Text>
        <Text style={styles.message}>{message}</Text>
        <Button
          label={actionLabel}
          onPress={() => router.replace(actionHref)}
        />
      </View>
    </Screen>
  );
}

const baseStyles = {
  card: {
    alignItems: "center" as const,
    gap: 13,
    padding: 26,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 24,
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  icon: {
    width: 64,
    height: 64,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 22,
    backgroundColor: tokens.color.surfaceTint,
  },
  heading: {
    color: tokens.color.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800" as const,
    textAlign: "center" as const,
  },
  message: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center" as const,
  },
};
