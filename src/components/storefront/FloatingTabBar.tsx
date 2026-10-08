import { Ionicons } from "@expo/vector-icons";
import { Tabs, router, usePathname } from "expo-router";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Keyboard,
  Platform,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/Typography";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "@/design/useReducedMotion";
import { selectionFeedback } from "@/native/haptics";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { GlassSurface } from "./GlassSurface";

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const destinations = [
  { name: "index", label: "Home", icon: "home-outline", active: "home" },
  { name: "shop", label: "Shop", icon: "grid-outline", active: "grid" },
  { name: "loyalty", label: "Club", icon: "ribbon", active: "ribbon" },
  {
    name: "orders",
    label: "Orders",
    icon: "receipt-outline",
    active: "receipt",
  },
  {
    name: "account",
    label: "Profile",
    icon: "person-outline",
    active: "person",
  },
] as const;

export function FloatingTabBar(
  props: BottomTabBarProps | Record<string, never> = {},
) {
  const state = "state" in props ? props.state : undefined;
  const navigation = "navigation" in props ? props.navigation : undefined;
  const pathname = usePathname();
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [railWidth, setRailWidth] = useState(0);
  const highlightX = useRef(new Animated.Value(0)).current;
  const previousRailWidth = useRef(0);
  const dragStart = useRef(0);
  const currentX = useRef(0);
  const lens = useRef(new Animated.Value(0)).current;
  const dragging = useRef(false);
  const activeIndex = destinations.findIndex(
    (destination) =>
      destination.name ===
      (state
        ? state.routes[state.index].name
        : pathname === "/"
          ? "index"
          : pathname.startsWith("/product") ||
              pathname.startsWith("/cart") ||
              pathname.startsWith("/search")
            ? "shop"
            : pathname.startsWith("/order")
              ? "orders"
              : pathname.startsWith("/loyalty")
                ? "loyalty"
                : pathname.split("/")[1]),
  );
  const tabWidth = Math.max(
    0,
    (railWidth - 2 * (destinations.length - 1)) / destinations.length,
  );
  const settle = (position: number, velocity = 0) => {
    highlightX.stopAnimation();
    if (reduceMotion) {
      highlightX.setValue(position);
      return;
    }
    Animated.spring(highlightX, {
      toValue: position,
      velocity,
      stiffness: 330,
      damping: 32,
      mass: 0.85,
      overshootClamping: true,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  const releaseLens = () => {
    dragging.current = false;
    Animated.spring(lens, {
      toValue: 0,
      stiffness: 300,
      damping: 28,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };
  const navigateTo = (index: number) => {
    const destination = destinations[index];
    const route = state?.routes.find((item) => item.name === destination.name);
    if (navigation && route) {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (event.defaultPrevented) {
        settle(Math.max(0, activeIndex) * (tabWidth + 2));
        return;
      }
      if (activeIndex !== index) navigation.navigate(route.name, route.params);
    } else if (activeIndex !== index) {
      router.navigate(
        destination.name === "index"
          ? "/(tabs)"
          : `/(tabs)/${destination.name}`,
      );
    }
    if (activeIndex !== index) void selectionFeedback();
    settle(index * (tabWidth + 2));
  };
  const swipe = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      railWidth > 0 &&
      Math.abs(gesture.dx) > 6 &&
      Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: () => {
      dragging.current = true;
      highlightX.stopAnimation();
      dragStart.current = currentX.current;
      Animated.timing(lens, {
        toValue: reduceMotion ? 0 : 1,
        duration: 130,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    },
    onPanResponderMove: (_, gesture) => {
      const position = Math.max(
        0,
        Math.min(
          (destinations.length - 1) * (tabWidth + 2),
          dragStart.current + gesture.dx,
        ),
      );
      currentX.current = position;
      highlightX.setValue(position);
    },
    onPanResponderRelease: (_, gesture) => {
      releaseLens();
      const step = Math.max(1, tabWidth + 2);
      // A short, bounded projection makes flicks responsive without skipping
      // several destinations when the finger lifts at high speed.
      const momentum = reduceMotion
        ? 0
        : Math.max(-step * 0.3, Math.min(step * 0.3, gesture.vx * 70));
      const index = Math.max(
        0,
        Math.min(
          destinations.length - 1,
          Math.round((dragStart.current + gesture.dx + momentum) / step),
        ),
      );
      navigateTo(index);
    },
    onPanResponderTerminate: () => {
      releaseLens();
      settle(Math.max(0, activeIndex) * (tabWidth + 2));
    },
  });

  useEffect(() => {
    const listener = highlightX.addListener(({ value }) => {
      currentX.current = value;
    });
    return () => highlightX.removeListener(listener);
  }, [highlightX]);

  useEffect(() => {
    if (railWidth <= 0 || activeIndex < 0 || dragging.current) return;
    const nextPosition = activeIndex * (tabWidth + 2);
    const geometryChanged = previousRailWidth.current !== railWidth;
    previousRailWidth.current = railWidth;
    highlightX.stopAnimation();
    if (reduceMotion || geometryChanged) {
      highlightX.setValue(nextPosition);
      return;
    }
    // Move the glass itself; fading a glass ancestor to zero breaks native
    // Liquid Glass rendering on iOS 26.
    const animation = Animated.spring(highlightX, {
      toValue: nextPosition,
      stiffness: 330,
      damping: 32,
      mass: 0.85,
      overshootClamping: true,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [activeIndex, highlightX, railWidth, reduceMotion, tabWidth]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardVisible) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.position, { bottom: insets.bottom + 10 }]}
    >
      <View
        style={[
          styles.shadow,
          { width: Math.min(width - insets.left - insets.right - 32, 480) },
        ]}
      >
        <GlassSurface style={styles.dock}>
          <View
            {...swipe.panHandlers}
            onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
            style={styles.rail}
          >
            {railWidth > 0 && activeIndex >= 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.highlight,
                  {
                    width: tabWidth,
                    transform: [
                      { translateX: highlightX },
                      {
                        scaleX: lens.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.045],
                        }),
                      },
                      {
                        scaleY: lens.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.025],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <GlassSurface
                  interactive={!reduceMotion}
                  glassStyle="clear"
                  tintColor="rgba(236,0,140,0.06)"
                  style={styles.highlightGlass}
                >
                  <View style={styles.highlightTint} />
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      "rgba(255,255,255,0.60)",
                      "rgba(255,255,255,0.02)",
                      "rgba(236,0,140,0.09)",
                    ]}
                    locations={[0, 0.45, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.lensRim} />
                </GlassSurface>
              </Animated.View>
            ) : null}
            {destinations.map((destination) => {
              const route = state?.routes.find(
                (item) => item.name === destination.name,
              );
              const focused = activeIndex === destinations.indexOf(destination);
              const isClub = destination.name === "loyalty";
              return (
                <Pressable
                  key={destination.name}
                  accessibilityRole="tab"
                  accessibilityLabel={
                    isClub ? "Cake City Club" : destination.label
                  }
                  accessibilityState={{ selected: focused }}
                  onPress={() => navigateTo(destinations.indexOf(destination))}
                  onLongPress={() =>
                    navigation &&
                    route &&
                    navigation.emit({ type: "tabLongPress", target: route.key })
                  }
                  style={({ pressed }) => [
                    styles.tab,
                    pressed && !reduceMotion && styles.pressed,
                  ]}
                >
                  <View style={[styles.tabContent, isClub && styles.clubFace]}>
                    <Ionicons
                      name={focused ? destination.active : destination.icon}
                      size={isClub ? 23 : 22}
                      color={
                        isClub
                          ? "#FFFFFF"
                          : focused
                            ? colors.brand
                            : colors.cocoa
                      }
                    />
                    <Text
                      style={[
                        styles.label,
                        focused && styles.activeLabel,
                        isClub && styles.clubLabel,
                      ]}
                    >
                      {destination.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  position: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  shadow: {
    borderRadius: 34,
    shadowColor: "#51382D",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  dock: { padding: 6, borderRadius: 34 },
  rail: { flexDirection: "row", gap: 2 },
  highlight: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    shadowColor: tokens.color.cocoa,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
  },
  highlightGlass: { flex: 1, borderRadius: 28 },
  highlightTint: {
    flex: 1,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(236,0,140,0.10)",
    backgroundColor: "rgba(236,0,140,0.07)",
  },
  lensRim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.95)",
    borderLeftColor: "rgba(255,255,255,0.7)",
    borderRightColor: "rgba(236,0,140,0.16)",
    borderBottomColor: "rgba(236,0,140,0.20)",
  },
  tab: {
    flex: 1,
    minWidth: 44,
    minHeight: 58,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tabContent: {
    alignSelf: "stretch",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  clubFace: {
    marginHorizontal: 4,
    borderRadius: 25,
    backgroundColor: tokens.color.brand,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  label: { fontSize: 11, fontWeight: "600", color: tokens.color.cocoa },
  activeLabel: { fontWeight: "800", color: tokens.color.brandStrong },
  clubLabel: { color: "#FFFFFF", fontWeight: "800" },
});
