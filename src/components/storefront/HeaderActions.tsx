import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { ProfileAvatarButton } from "@/components/ProfileAvatar";
import { useTheme } from "@/theme/ThemeProvider";
import { useReducedMotion } from "@/design/useReducedMotion";
import { useScreenActive } from "@/design/useScreenActive";
import { useOrderUpdates } from "@/features/account/OrderUpdates";

export function HeaderActions() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const active = useScreenActive();
  const [newcomer, setNewcomer] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const updates = useOrderUpdates();
  const unread = updates.data?.some((item) => !item.read_at);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem("cakecity.celebration.discovered.v1")
      .then((value) => {
        if (mounted) setNewcomer(!value);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    glow.setValue(0);
    if (!newcomer || reduced || !active) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
      { iterations: 3 },
    );
    animation.start();
    return () => animation.stop();
  }, [newcomer, reduced, active, glow]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Make my celebration"
        onPress={() => {
          setNewcomer(false);
          void AsyncStorage.setItem(
            "cakecity.celebration.discovered.v1",
            "1",
          ).catch(() => undefined);
          router.push("/celebration-builder");
        }}
        style={{
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {newcomer ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.brandLight,
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 1],
              }),
              transform: [
                {
                  scale: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1.1],
                  }),
                },
              ],
            }}
          />
        ) : null}
        <Ionicons
          name="sparkles-outline"
          size={23}
          color={colors.brandStrong}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          unread ? "Notifications, unread order updates" : "Notifications"
        }
        onPress={() => router.push("/notifications")}
        style={{
          width: 40,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.ink} />
        {unread ? (
          <View
            style={{
              position: "absolute",
              right: 7,
              top: 7,
              height: 7,
              width: 7,
              borderRadius: 4,
              backgroundColor: colors.brandStrong,
            }}
          />
        ) : null}
      </Pressable>
      <ProfileAvatarButton />
    </View>
  );
}
