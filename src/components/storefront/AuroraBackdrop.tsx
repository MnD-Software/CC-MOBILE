import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { tokens } from "@/theme/tokens";

type AuroraBackdropProps = PropsWithChildren<{
  variant?: "app" | "auth";
  style?: StyleProp<ViewStyle>;
}>;

/** Quiet blush canvas that keeps products and the Cake City logo in focus. */
export function AuroraBackdrop({
  variant = "app",
  children,
  style,
}: AuroraBackdropProps) {
  return (
    <View
      style={[styles.canvas, variant === "auth" && styles.authCanvas, style]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={tokens.gradient.aurora}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.warmWash} />
      <View pointerEvents="none" style={styles.blushBand} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: tokens.color.background,
  },
  authCanvas: {
    backgroundColor: "#FFF6FA",
  },
  warmWash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "46%",
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  blushBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "28%",
    height: "26%",
    backgroundColor: "#F7B9D3",
    opacity: 0.18,
  },
});
