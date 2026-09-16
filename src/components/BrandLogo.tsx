import { Image } from "expo-image";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { tokens } from "@/theme/tokens";

export const cakeCityBrand = {
  pink: tokens.color.brand,
  pinkAccessible: tokens.color.brandStrong,
  pinkPressed: tokens.color.brandPressed,
  pinkSoft: tokens.color.surfaceTint,
  cyan: tokens.color.accent,
  cyanSoft: tokens.color.accentLight,
  cocoa: tokens.color.cocoa,
  ink: tokens.color.ink,
  muted: tokens.color.muted,
  background: tokens.color.background,
  surface: tokens.color.surface,
  border: tokens.color.border,
  error: tokens.color.error,
  errorSoft: tokens.color.errorLight,
} as const;

type BrandLogoProps = {
  width?: number;
  style?: StyleProp<ViewStyle>;
};

export function BrandLogo({ width = 126, style }: BrandLogoProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Cake City, Celebrate with Love"
      style={[styles.frame, { width, height: (width * 46) / 137 }, style]}
    >
      <Image
        source={require("../../assets/cake-city-logo.png")}
        contentFit="contain"
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
  },
});
