import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { useReducedMotion } from "@/design/useReducedMotion";

export function SearchLoading({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Finding your favourites"
      accessibilityState={{ busy: true }}
      style={{
        width: "100%",
        flex: compact ? undefined : 1,
        minHeight: compact ? 84 : 250,
        paddingVertical: compact ? 14 : 32,
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 8 : 16,
      }}
    >
      <View
        style={{
          height: compact ? 32 : 68,
          width: compact ? 32 : 68,
          borderRadius: compact ? 12 : 25,
          backgroundColor: colors.brandLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {reduced ? (
          <Ionicons
            name="search-outline"
            color={colors.brandStrong}
            size={compact ? 19 : 28}
          />
        ) : (
          <ActivityIndicator
            color={colors.brandStrong}
            size={compact ? "small" : "large"}
          />
        )}
      </View>
      <Text
        style={{
          color: colors.ink,
          fontSize: compact ? 12 : 16,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        Finding your favourites
      </Text>
      {!compact ? (
        <Text
          style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}
        >
          A little something worth celebrating.
        </Text>
      ) : null}
    </View>
  );
}
