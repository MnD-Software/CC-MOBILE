import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { isStaffRole } from "@/auth/staff-routing";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";

const tabIcons = {
  index: ["home-outline", "home"],
  shop: ["grid-outline", "grid"],
  loyalty: ["ribbon", "ribbon"],
  orders: ["receipt-outline", "receipt"],
  search: ["search-outline", "search"],
  account: ["person-circle-outline", "person-circle"],
} as const satisfies Record<
  string,
  readonly [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]
>;

/**
 * The stable Expo Router tab navigator deliberately backs the primary mobile
 * navigation, including the Cake Studio route opened through JavaScript.
 */
export default function TabLayout() {
  const { customer, restoring } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(
    insets.bottom,
    Platform.OS === "android" ? 7 : 8,
  );

  if (restoring) return null;
  if (!customer) return <Redirect href="/sign-in" />;
  if (customer.role === "corporate_client")
    return <Redirect href="/corporate" />;
  if (isStaffRole(customer.role)) return <Redirect href="/workspace" />;
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="history"
      screenOptions={({ route }) => {
        const icons =
          tabIcons[route.name as keyof typeof tabIcons] ?? tabIcons.index;

        return {
          headerShown: false,
          tabBarActiveTintColor: tokens.color.brandStrong,
          tabBarInactiveTintColor: tokens.color.mutedSoft,
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: styles.label,
          tabBarStyle: [
            styles.tabBar,
            {
              height: 54 + bottomInset,
              paddingBottom: bottomInset,
              backgroundColor:
                Platform.OS === "ios" ? "transparent" : "#FFFAFC",
            },
          ],
          tabBarBackground:
            Platform.OS === "ios"
              ? () => (
                  <BlurView
                    intensity={92}
                    tint="light"
                    style={StyleSheet.absoluteFill}
                  />
                )
              : undefined,
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              color={
                focused ? tokens.color.brandStrong : tokens.color.mutedSoft
              }
              name={icons[focused ? 1 : 0]}
              size={Math.max(21, Math.min(size, 24))}
            />
          ),
        };
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="shop" options={{ title: "Shop" }} />
      <Tabs.Screen name="loyalty" options={{ title: "Cake City Club" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
      {/* Expo Router 58 redirects hidden tabs to the initial tab. Our separate
          FloatingTabBar already controls which destinations are displayed;
          these routes must stay registered and visible to the navigator. */}
      <Tabs.Screen name="custom" options={{ title: "Cake playground" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  tabBar: {
    borderTopColor: "rgba(81,56,45,0.10)",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    paddingTop: 6,
    shadowColor: "#51382D",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
});
