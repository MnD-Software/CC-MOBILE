import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { useScreenActive } from "@/design/useScreenActive";

export function MomentHero({
  name,
  step,
  title,
}: {
  name?: string;
  step: number;
  title: string;
}) {
  const motion = useRef(new Animated.Value(0)).current;
  const { reduceMotion, isResolved } = useMotionAccessibilityPreference();
  const active = useScreenActive();
  useEffect(() => {
    if (!active || !isResolved || reduceMotion) {
      motion.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, isResolved, reduceMotion, motion]);
  return (
    <LinearGradient
      colors={["#4F1647", "#A61968", "#9E315E"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 30, padding: 24, overflow: "hidden", gap: 18 }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 230,
          height: 230,
          right: -80,
          top: -100,
          borderRadius: 120,
          borderWidth: 24,
          borderColor: "rgba(255,224,191,0.12)",
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ flex: 1, gap: 12 }}>
          <Text
            style={{
              color: "#FFDEC7",
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: "800",
            }}
          >
            {title.toUpperCase()}
          </Text>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 31,
              lineHeight: 38,
              fontWeight: "800",
              letterSpacing: -0.7,
            }}
          >
            {name
              ? `A little magic for ${name}.`
              : "Make a little\nmagic happen."}
          </Text>
        </View>
        <Animated.View
          accessible={false}
          style={{
            transform: [
              {
                translateY: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10],
                }),
              },
              {
                rotate: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-8deg", "8deg"],
                }),
              },
            ],
            width: 64,
            height: 90,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="balloon" size={62} color="#FFE0AE" />
          <Ionicons
            name="sparkles"
            size={24}
            color="#FFFFFF"
            style={{ position: "absolute", right: -2, top: 0 }}
          />
        </Animated.View>
      </View>
      <Text style={{ color: "#FFE9ED", fontSize: 13, lineHeight: 21 }}>
        Your people. Your cake. All the finishing touches.
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["Occasion", "Your cake", "Make it yours"].map((label, index) => (
          <View
            key={label}
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 4,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor:
                index === step ? "#FFF2E2" : "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                color:
                  index === step
                    ? "#6E244F"
                    : index < step
                      ? "#B5FFD0"
                      : "#FFFFFF",
                fontSize: 10,
                fontWeight: "800",
              }}
            >
              {index < step ? "\u2713 " : `${index + 1}. `}
              {label}
            </Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
