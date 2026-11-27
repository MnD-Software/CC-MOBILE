import { useReducedTransparency } from "@/components/storefront/GlassSurface";
import { useTheme } from "@/theme/ThemeProvider";
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
  const { isDark, highContrast } = useTheme();
  const reducedTransparency = useReducedTransparency();
  if (highContrast || reducedTransparency) return null;
  const a = (value: number) =>
    `rgba(255,255,255,${Math.max(0, Math.min(1, value * strength * (isDark ? 0.5 : 1))).toFixed(3)})`;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <LinearGradient
        colors={[a(0.3), a(0.1), a(0), a(0.06)]}
        locations={[0, 0.35, 0.7, 1]}
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
