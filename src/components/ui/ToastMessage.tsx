import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { useReducedMotion } from "@/design/useReducedMotion";
import { useTheme } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";
import { Text } from "./Typography";

/** A touch-through status capsule, with no modal or dimming backdrop. */
export function ToastMessage({ message }: { message: string }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(reduced ? 1 : 0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 240,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [message, progress, reduced]);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        bottom: 112,
        width: "90%",
        maxWidth: 480,
        alignSelf: "center",
        borderRadius: 24,
        ...tokens.shadow.floating,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      <GlassSurface
        style={{
          borderRadius: 24,
          padding: 14,
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 13,
            backgroundColor: colors.brandLight,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={colors.brandStrong}
          />
        </View>
        <Text
          style={{
            flex: 1,
            color: colors.ink,
            fontSize: 13,
            lineHeight: 20,
            fontWeight: "600",
          }}
        >
          {message}
        </Text>
      </GlassSurface>
    </Animated.View>
  );
}
