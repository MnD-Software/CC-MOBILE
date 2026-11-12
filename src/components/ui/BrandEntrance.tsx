import { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useMotionAccessibilityPreference } from "@/design";

if (Platform.OS !== "web")
  SplashScreen.setOptions({ duration: 240, fade: true });

export { BrandSplash } from "./BrandSplashArtwork";
import { BrandSplash } from "./BrandSplashArtwork";

/** A readable 5.5-second cold-launch welcome, independent of network requests. */
export function BrandEntrance() {
  const preference = useMotionAccessibilityPreference();
  const [visible, setVisible] = useState(Platform.OS !== "web");
  const progress = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(Date.now()).current;
  useEffect(() => {
    if (!preference.isResolved) return;
    if (Platform.OS === "web") {
      setVisible(false);
      return;
    }
    if (preference.reduceMotion) {
      const timer = setTimeout(
        () => setVisible(false),
        Math.max(0, 5500 - (Date.now() - startedAt)),
      );
      return () => clearTimeout(timer);
    }
    const animation = Animated.sequence([
      Animated.delay(Math.max(0, 5150 - (Date.now() - startedAt))),
      Animated.timing(progress, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => animation.stop();
  }, [preference.isResolved, preference.reduceMotion, progress, startedAt]);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <Animated.View
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "#21051E",
          zIndex: 100,
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }),
        },
      ]}
    >
      <Animated.View
        style={{
          flex: 1,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.025],
              }),
            },
          ],
        }}
      >
        <BrandSplash />
      </Animated.View>
    </Animated.View>
  );
}
