import { CakeCityLoader as ActivityIndicator } from "@/components/ui/CakeCityLoader";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type RefObject,
} from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import type { StyleProp, ViewInstance, ViewStyle } from "react-native";

import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { themeColor } from "@/theme/appearance";

type GlassSurfaceProps = PropsWithChildren<{
  blurTarget?: RefObject<ViewInstance | null>;
  intensity?: number;
  interactive?: boolean;
  glassStyle?: "clear" | "regular";
  /** Override the frosted tint (iOS liquid glass + Android fallback). */
  tintColor?: string;
  /** Flat white product rows avoid per-cell blur and keep photographs crisp. */
  opaque?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

const liquidGlassAvailable =
  Platform.OS === "ios" &&
  isGlassEffectAPIAvailable() &&
  isLiquidGlassAvailable();

const GlassPreferences = createContext(false);

export const useReducedTransparency = () => useContext(GlassPreferences);

export function GlassPreferencesProvider({ children }: PropsWithChildren) {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setReduceTransparency(value);
      })
      .catch(() => {
        if (mounted) setReduceTransparency(true);
      });
    const listener = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  return (
    <GlassPreferences.Provider value={reduceTransparency}>
      {children}
    </GlassPreferences.Provider>
  );
}

/**
 * Uses Apple's native Liquid Glass on supported iOS devices and Expo BlurView
 * everywhere else. Android blur is restricted to SDK 31+ to avoid the costly
 * legacy rendering path.
 */
export function GlassSurface({
  blurTarget,
  children,
  intensity = 42,
  interactive = false,
  glassStyle = "regular",
  tintColor,
  opaque = false,
  style,
}: GlassSurfaceProps) {
  const { colors, isDark, highContrast } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const resolvedTint = tintColor
    ? themeColor("backgroundColor", tintColor, isDark)
    : undefined;
  const reduceTransparency = useContext(GlassPreferences);
  const surfaceFinish =
    !reduceTransparency && !highContrast ? (
      <View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={
            isDark
              ? [
                  "rgba(255,255,255,0.13)",
                  "rgba(255,255,255,0.025)",
                  "rgba(0,0,0,0.16)",
                ]
              : [
                  "rgba(255,255,255,0.8)",
                  "rgba(255,255,255,0.06)",
                  "rgba(177,140,163,0.10)",
                ]
          }
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    ) : null;
  if (opaque || highContrast)
    return (
      <View
        style={[
          styles.surface,
          { backgroundColor: resolvedTint ?? colors.surface },
          style,
        ]}
      >
        {children}
      </View>
    );
  if (liquidGlassAvailable && !reduceTransparency) {
    return (
      <GlassView
        colorScheme={isDark ? "dark" : "light"}
        glassEffectStyle={glassStyle}
        isInteractive={interactive}
        style={[styles.surface, style]}
        tintColor={resolvedTint}
      >
        {children}
      </GlassView>
    );
  }

  // A BlurView without a target does not show the content beneath it on
  // Android, but it can still cost a full compositing pass for every product
  // card. Keep the Android fallback glossy and light; reserve real blur for
  // the single floating dock that supplies a target.
  if (reduceTransparency || (Platform.OS === "android" && !blurTarget)) {
    return (
      <View
        style={[
          styles.surface,
          Platform.OS === "android" && !reduceTransparency
            ? {
                elevation: interactive ? 5 : 2,
                shadowColor: isDark ? "#000000" : "#694357",
              }
            : undefined,
          style,
          { backgroundColor: resolvedTint ?? colors.surface },
        ]}
      >
        {surfaceFinish}
        {children}
      </View>
    );
  }

  return (
    <BlurView
      blurMethod={
        Platform.OS === "android" && blurTarget
          ? "dimezisBlurViewSdk31Plus"
          : "none"
      }
      blurTarget={blurTarget}
      intensity={intensity}
      style={[
        styles.surface,
        {
          backgroundColor:
            resolvedTint ??
            (isDark ? "rgba(33,27,36,0.62)" : "rgba(255,255,255,0.38)"),
        },
        style,
      ]}
      tint={
        isDark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"
      }
    >
      {surfaceFinish}
      {children}
    </BlurView>
  );
}

export function GlassLoading({ label = "Loading" }: { label?: string }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <GlassSurface style={styles.loading}>
      <ActivityIndicator color={colors.brandStrong} size="small" />
      <Text style={styles.loadingText}>{label}</Text>
    </GlassSurface>
  );
}

const baseStyles = StyleSheet.create({
  surface: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFFE8",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: tokens.radius.lg,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
  },
});
