import { tokens } from "@/theme/tokens";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { useReducedMotion } from "@/design/useReducedMotion";
import { useScreenActive } from "@/design/useScreenActive";
import { Text } from "@/components/ui/Typography";

/** A shared, labelled studio shortcut: always legible, gently breathing neon. */
export function NeonDiyShortcut() {
  const { customer } = useAuth();
  const path = usePathname();
  const active = useScreenActive();
  const reduced = useReducedMotion();
  const glow = useRef(new Animated.Value(0)).current;
  const visible = customer?.role === "customer";
  useEffect(() => {
    glow.setValue(0);
    if (!visible || !active || reduced) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [visible, active, reduced, glow]);
  if (!visible) return null;
  const inStudio = path === "/custom" || path.endsWith("/custom");
  return (
    <Pressable
      testID="header-diy-shortcut"
      accessibilityRole="button"
      accessibilityLabel={
        inStudio ? "DIY cake studio, current page" : "Open DIY cake studio"
      }
      accessibilityHint="Design your cake in 3D"
      accessibilityState={{ selected: inStudio }}
      onPress={() => {
        if (!inStudio) router.navigate("/custom");
      }}
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0.25, 0.65],
            }),
          },
        ]}
      />
      <LinearGradient
        colors={tokens.gradient.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.face}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
          style={styles.glass}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheen,
            {
              transform: [
                {
                  translateX: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-64, 64],
                  }),
                },
                { rotate: "-20deg" },
              ],
            },
          ]}
        />
        <Ionicons name="sparkles" size={11} color={tokens.color.surfaceTint} />
        <Text style={styles.label}>DIY</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 44,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  halo: {
    position: "absolute",
    inset: 2,
    borderRadius: 16,
    backgroundColor: tokens.color.brand,
    shadowColor: tokens.color.brand,
    shadowOpacity: 0.65,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  face: {
    width: 56,
    height: 44,
    borderRadius: 15,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
    overflow: "hidden",
  },
  glass: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 1,
    height: 20,
    borderRadius: 13,
  },
  sheen: {
    position: "absolute",
    width: 13,
    height: 70,
    top: -15,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  label: {
    color: tokens.color.white,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.6,
    textShadowColor: tokens.color.brand,
    textShadowRadius: 7,
    textShadowOffset: { width: 0, height: 0 },
  },
});
