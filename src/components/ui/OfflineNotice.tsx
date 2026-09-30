import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConnectivityState } from "@/platform/connectivity";
import { useTheme } from "@/theme/ThemeProvider";

/** A quiet, persistent recovery cue shown only after a real transport error. */
export function OfflineNotice() {
  const { colors } = useTheme();
  const connectivity = useConnectivityState();
  const insets = useSafeAreaInsets();
  if (connectivity !== "offline") return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.notice, { paddingTop: Math.max(insets.top + 6, 10), backgroundColor: colors.warningLight }]}
    >
      <Ionicons name="cloud-offline-outline" color={colors.warning} size={16} />
      <Text style={[styles.copy, { color: colors.warning }]}>
        You’re offline. Your bag and any orders saved to this account are still
        available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    backgroundColor: "#FFF4D8",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(113,85,23,0.18)",
  },
  copy: {
    color: "#715517",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
