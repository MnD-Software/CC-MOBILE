import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

export function HomeWelcome() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const hour = (new Date().getUTCHours() + 3) % 24;
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <View style={{ gap: 13, paddingVertical: 14 }}>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: colors.ink,
            fontSize: 24,
            fontWeight: "800",
            letterSpacing: -0.7,
          }}
        >
          {greeting}
          {customer?.first_name ? `, ${customer.first_name}` : ""}.
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          A little happiness, baked around you.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the cake playground"
        onPress={() => router.push("/(tabs)/custom")}
      >
        <LinearGradient
          colors={["#3C243C", "#75405C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            padding: 19,
            borderRadius: 24,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              right: 20,
              top: -26,
              width: 110,
              height: 110,
              borderRadius: 60,
              borderWidth: 20,
              borderColor: "rgba(255,255,255,0.035)",
            }}
          />
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 17,
              backgroundColor: "rgba(255,255,255,0.1)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="color-palette-outline" color="#FFE1A5" size={27} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: "#F5CDE2",
                fontSize: 9,
                fontWeight: "800",
                letterSpacing: 1.5,
              }}
            >
              THE CAKE PLAYGROUND
            </Text>
            <Text style={{ color: "white", fontWeight: "800", fontSize: 17 }}>
              Make their moment yours.
            </Text>
            <Text style={{ color: "#EED9E5", fontSize: 11 }}>
              Choose, colour and create a little magic.
            </Text>
          </View>
          <Ionicons name="arrow-forward" color="#FFE1A5" size={21} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}
