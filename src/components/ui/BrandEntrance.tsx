import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { useMotionAccessibilityPreference } from "@/design";

if (Platform.OS !== "web")
  SplashScreen.setOptions({ duration: 180, fade: true });

/** Optional 220 ms entrance; shopping stays mounted and receives touches. */
export function BrandEntrance() {
  const preference = useMotionAccessibilityPreference();
  const [visible, setVisible] = useState(Platform.OS !== "web");
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!preference.isResolved) return;
    if (preference.reduceMotion || Platform.OS === "web") {
      setVisible(false);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => animation.stop();
  }, [preference.isResolved, preference.reduceMotion, progress]);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 300);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}
    >
      <Animated.View
        style={{
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.035],
              }),
            },
          ],
        }}
      >
        <Image
          source={require("../../../assets/cake-city-logo.png")}
          contentFit="contain"
          style={{ width: 220, height: 95 }}
        />
      </Animated.View>
    </Animated.View>
  );
}
