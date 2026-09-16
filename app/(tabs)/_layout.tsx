import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import { tokens } from "@/theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const icons = {
  index: ["home-outline", "home"],
  shop: ["grid-outline", "grid"],
  orders: ["clipboard-outline", "clipboard"],
  loyalty: ["star-outline", "star"],
  account: ["person-outline", "person"],
} as const;
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: tokens.color.brandStrong,
        tabBarInactiveTintColor: "#6A5962",
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "700", marginTop: 3 },
        tabBarItemStyle: {
          paddingTop: 5,
          borderRadius: 18,
          marginHorizontal: 2,
        },
        tabBarActiveBackgroundColor: "rgba(255, 224, 238, 0.96)",
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: Math.max(insets.bottom, 8),
          height: 68,
          paddingTop: 7,
          paddingBottom: 7,
          paddingHorizontal: 6,
          borderTopWidth: 0,
          borderRadius: 25,
          backgroundColor: "rgba(255, 255, 255, 0.94)",
          shadowColor: "#6D2147",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.14,
          shadowRadius: 20,
          elevation: 8,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={Platform.OS === "ios" ? 68 : 42}
            tint="light"
            style={{
              ...StyleSheet.absoluteFill,
              overflow: "hidden",
              borderRadius: 25,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.82)",
              backgroundColor: "rgba(255, 255, 255, 0.94)",
            }}
          />
        ),
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              icons[route.name as keyof typeof icons]?.[focused ? 1 : 0] ??
              "ellipse-outline"
            }
            size={Math.min(size + 1, 24)}
            color={color}
          />
        ),
        animation: Platform.OS === "ios" ? "shift" : "none",
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="shop" options={{ title: "Categories" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="loyalty" options={{ title: "Loyalty" }} />
      <Tabs.Screen name="account" options={{ title: "Profile" }} />
      <Tabs.Screen name="custom" options={{ href: null }} />
    </Tabs>
  );
}
