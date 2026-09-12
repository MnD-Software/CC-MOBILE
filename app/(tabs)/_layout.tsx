import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { tokens } from "@/theme/tokens";
const icons = {
  index: ["home-outline", "home"],
  shop: ["grid-outline", "grid"],
  orders: ["receipt-outline", "receipt"],
  loyalty: ["star-outline", "star"],
  account: ["person-outline", "person"],
} as const;
export default function TabLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: tokens.color.brandStrong,
        tabBarInactiveTintColor: tokens.color.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "white",
          borderTopColor: tokens.color.border,
          paddingTop: 6,
          paddingBottom: Platform.OS === "android" ? 6 : 2,
          height: Platform.OS === "android" ? 68 : 78,
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
