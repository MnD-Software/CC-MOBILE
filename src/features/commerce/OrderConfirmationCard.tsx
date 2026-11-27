import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrandLogo } from "@/components/BrandLogo";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { isVerifiedPayment } from "./checkout-success";
import type { AppOrder } from "./app-orders";
import { money } from "./contracts";

export function OrderConfirmationCard({ order }: { order: AppOrder }) {
  const { colors } = useTheme();
  const confirmed = isVerifiedPayment(order);
  const pickup = order.snapshot?.checkout?.fulfilment === "pickup";
  return (
    <GlassSurface style={{ borderRadius: 30, padding: 24, gap: 18 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <BrandLogo width={96} />
        <View
          style={{
            borderRadius: 20,
            padding: 10,
            backgroundColor: confirmed
              ? colors.successLight
              : colors.warningLight,
          }}
        >
          <Ionicons
            name={confirmed ? "checkmark-done" : "time-outline"}
            size={26}
            color={confirmed ? colors.success : colors.warning}
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: confirmed ? colors.success : colors.warning,
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 1.3,
          }}
        >
          {confirmed ? "YOUR ORDER IS CONFIRMED" : "YOUR ORDER IS SAVED"}
        </Text>
        <Text
          style={{
            color: colors.ink,
            fontSize: 28,
            lineHeight: 34,
            fontWeight: "800",
            letterSpacing: -0.7,
          }}
        >
          {confirmed
            ? "Let the celebration begin."
            : "One step closer to something lovely."}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
          {confirmed
            ? pickup
              ? "We will let you know when your cake is ready to collect."
              : "From our kitchen to your doorstep, follow every milestone in Orders."
            : "Check the payment status below before trying again. Your order stays safely here."}
        </Text>
      </View>
      <View
        style={{
          padding: 16,
          borderRadius: 20,
          backgroundColor: colors.glass,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>Order value</Text>
          <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "800" }}>
            {money(order.total_minor / 100)}
          </Text>
        </View>
        {confirmed && order.review_checkout ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Amount collected
            </Text>
            <Text
              style={{ color: colors.success, fontWeight: "800", fontSize: 13 }}
            >
              {money(0)}
            </Text>
          </View>
        ) : null}
        <Text selectable style={{ color: colors.muted, fontSize: 11 }}>
          {order.reference}
        </Text>
      </View>
      {confirmed ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons
            name={pickup ? "storefront-outline" : "bicycle-outline"}
            size={18}
            color={colors.brandStrong}
          />
          <Text
            style={{
              color: colors.brandStrong,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {pickup ? "Branch pickup" : "Delivery to your celebration"}
          </Text>
        </View>
      ) : null}
    </GlassSurface>
  );
}
