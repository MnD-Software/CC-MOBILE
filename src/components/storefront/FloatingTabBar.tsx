import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
  { name: "account", label: "You", icon: "person-outline", active: "person" },
] as const;

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [railWidth, setRailWidth] = useState(0);
  const highlightX = useRef(new Animated.Value(0)).current;
  const previousRailWidth = useRef(0);
  const activeIndex = destinations.findIndex(
    (destination) => destination.name === state.routes[state.index].name,
  );
  const tabWidth = Math.max(
    0,
    (railWidth - 2 * (destinations.length - 1)) / destinations.length,
  );

  useEffect(() => {
    if (railWidth <= 0 || activeIndex < 0) return;
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
    const animation = Animated.timing(highlightX, {
      toValue: nextPosition,
      duration: 280,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
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
      style={[styles.position, { bottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        style={[
          styles.shadow,
          { width: Math.min(width - insets.left - insets.right - 32, 480) },
        ]}
      >
        <GlassSurface style={styles.dock}>
          <View
            onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
            style={styles.rail}
          >
            {railWidth > 0 && activeIndex >= 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.highlight,
                  { width: tabWidth, transform: [{ translateX: highlightX }] },
                ]}
              >
                <GlassSurface
                  glassStyle="clear"
                  tintColor="rgba(236,0,140,0.06)"
                  style={styles.highlightGlass}
                >
                  <View style={styles.highlightTint} />
                </GlassSurface>
              </Animated.View>
            ) : null}
            {destinations.map((destination) => {
              const route = state.routes.find(
                (item) => item.name === destination.name,
              );
              if (!route) return null;
              const focused = state.routes[state.index].key === route.key;
              const isClub = destination.name === "loyalty";
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityLabel={
                    isClub ? "Cake City Club" : destination.label
                  }
                  accessibilityState={{ selected: focused }}
                  onPress={() => {
                    const event = navigation.emit({
                      type: "tabPress",
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      void selectionFeedback();
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  onLongPress={() =>
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
                            ? colors.brandStrong
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
    backgroundColor: tokens.color.brandStrong,
  },
  pressed: { transform: [{ scale: 0.96 }] },
  label: { fontSize: 10, fontWeight: "600", color: tokens.color.cocoa },
  activeLabel: { fontWeight: "800", color: tokens.color.brandStrong },
  clubLabel: { color: "#FFFFFF", fontWeight: "800" },
});
