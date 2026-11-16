import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";

export function TrackOrderAction({
  label,
  reference,
  active,
  onPress,
}: {
  label: string;
  reference: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { reduceMotion, isResolved } = useMotionAccessibilityPreference();
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    motion.setValue(0);
    if (!active || !isResolved || reduceMotion) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.delay(2200),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, isResolved, reduceMotion, motion]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${reference}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceRaised : colors.brandLight,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.success,
            opacity: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.08, 0.2],
            }),
            transform: [
              {
                scale: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1.1],
                }),
              },
            ],
          }}
        />
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.success,
          }}
        />
      </View>
      <Text
        style={{
          flex: 1,
          color: colors.brandStrong,
          fontSize: 14,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      <Animated.View
        style={{
          transform: [
            {
              translateX: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 4],
              }),
            },
          ],
        }}
      >
        <Ionicons name="arrow-forward" size={20} color={colors.brandStrong} />
      </Animated.View>
    </Pressable>
  );
}
