import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { tokens } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/ThemeProvider";

/** Describes navigation, never confirmation of payment. */
export function CheckoutProgress({ current }: { current: 0 | 1 | 2 }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View
      accessibilityLabel={`Step ${current + 1} of 3: ${["Bag", "Details", "Payment"][current]}`}
      style={styles.row}
    >
      {["Bag", "Details", "Payment"].map((label, index) => (
        <View key={label} style={styles.step}>
          <View style={[styles.circle, index <= current && styles.active]}>
            {index < current ? (
              <Ionicons name="checkmark" color="#FFFFFF" size={14} />
            ) : (
              <Text
                style={[
                  styles.number,
                  index === current && styles.currentNumber,
                ]}
              >
                {index + 1}
              </Text>
            )}
          </View>
          <Text
            style={[styles.label, index === current && styles.currentLabel]}
          >
            {label}
          </Text>
          {index < 2 ? <View style={styles.line} /> : null}
        </View>
      ))}
    </View>
  );
}
const baseStyles = StyleSheet.create({
  row: { flexDirection: "row", paddingVertical: 6, gap: 8 },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  circle: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#F3EDF0",
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: tokens.color.brandStrong },
  number: { color: tokens.color.muted, fontSize: 11, fontWeight: "700" },
  currentNumber: { color: "#FFFFFF" },
  label: { color: tokens.color.muted, fontSize: 11, fontWeight: "600" },
  currentLabel: { color: tokens.color.cocoa, fontWeight: "800" },
  line: { height: 1, flex: 1, backgroundColor: tokens.color.borderStrong },
});
