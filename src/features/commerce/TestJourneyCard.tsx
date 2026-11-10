import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

/** Staff preview stays separate from the shopping bag and real payments. */
export function TestJourneyCard() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  if (
    !customer ||
    !["admin", "staff", "ecommerce_manager"].includes(customer.role)
  )
    return null;
  return (
    <View
      style={{
        padding: 18,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.brandStrong,
        backgroundColor: colors.brandLight,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Ionicons name="flask-outline" size={30} color={colors.brandStrong} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: colors.brandStrong,
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 1,
            }}
          >
            STAFF PREVIEW • NO CHARGE
          </Text>
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}>
            Test cake · KES 1.00
          </Text>
        </View>
      </View>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Try checkout, Club, kitchen and rider delivery with one clearly labelled
        test order. No money moves.
      </Text>
      <Button
        label="Try the test cake"
        onPress={() => router.push("/payment-test")}
      />
    </View>
  );
}
