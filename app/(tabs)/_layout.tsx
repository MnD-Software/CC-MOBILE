import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
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
        tabBarInactiveTintColor: tokens.color.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "400", marginTop: 3 },
        tabBarItemStyle: { paddingTop: 5, borderRadius: 16 },
        tabBarActiveBackgroundColor: "#FFF2F6",
        tabBarStyle: {
          backgroundColor: tokens.color.background,
          borderTopColor: tokens.color.border,
          paddingTop: 2,
          paddingHorizontal: 6,
          paddingBottom: Math.max(insets.bottom, 10),
          height: 60 + Math.max(insets.bottom, 10),
        },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={
              icons[route.name as keyof typeof icons]?.[focused ? 1 : 0] ??
              "ellipse-outline"
            }
            size={Math.min(size, 22)}
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
