import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * A liquid-glass specular layer for filled surfaces: a bright upper lens,
 * a soft horizon and a faint lower bounce light. Purely decorative, so it is
 * hidden from accessibility and never intercepts touches.
 */
export function GlossSheen({
  strength = 1,
  highlight = true,
}: {
  strength?: number;
  highlight?: boolean;
}) {
  const a = (value: number) =>
    `rgba(255,255,255,${Math.max(0, Math.min(1, value * strength)).toFixed(3)})`;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={[a(0.42), a(0.12), a(0), a(0.08)]}
        locations={[0, 0.48, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
      {highlight ? (
        <View
          style={{
            position: "absolute",
            top: 1,
            left: "12%",
            right: "12%",
            height: StyleSheet.hairlineWidth * 2,
            borderRadius: 2,
            backgroundColor: a(0.85),
          }}
        />
      ) : null}
    </View>
  );
}
