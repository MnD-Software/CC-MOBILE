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
        colors={["#3C1036", "#681047", "#3C1036"]}
        style={styles.face}
      >
        <View style={styles.shine} />
        <Ionicons name="sparkles" size={11} color="#FFB9E9" />
        <Text style={styles.label}>DIY</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 44,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  halo: {
    position: "absolute",
    inset: 2,
    borderRadius: 16,
    backgroundColor: "#FF29B5",
    shadowColor: "#FF00A8",
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  face: {
    width: 50,
    height: 38,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#FF70D2",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 3,
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    top: 0,
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: "#FFD3F3",
  },
  label: {
    color: "#FFE4F8",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
    textShadowColor: "#FF39BD",
    textShadowRadius: 7,
    textShadowOffset: { width: 0, height: 0 },
  },
});
