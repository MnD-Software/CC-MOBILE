import { Pressable, View } from "react-native";
import { LoadingImage as Image } from "@/components/ui/LoadingImage";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";

/** Staff-only catalogue entry opens the isolated, no-money checkout. */
export function TestProductTile({ width }: { width: number }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  if (
    !customer ||
    !["admin", "staff", "ecommerce_manager"].includes(customer.role)
  )
    return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Test celebration cake, KES 1, simulation only, no charge"
      onPress={() => router.push("/payment-test")}
      style={{
        width,
        borderRadius: 18,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <Image
        source={require("../../../assets/cake-city-celebration-hero.png")}
        style={{ width: "100%", aspectRatio: 1.2 }}
        contentFit="cover"
      />
      <View style={{ padding: 12, gap: 5 }}>
        <Text
          style={{
            fontSize: 9,
            fontWeight: "800",
            color: colors.brandStrong,
            letterSpacing: 1,
          }}
        >
          PREVIEW · NO CHARGE
        </Text>
        <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 13 }}>
          Test celebration cake
        </Text>
        <Text style={{ color: colors.ink, fontSize: 13 }}>KES 1.00</Text>
      </View>
    </Pressable>
  );
}
