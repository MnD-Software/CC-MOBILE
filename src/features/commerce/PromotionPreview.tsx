import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { mediaSource } from "@/features/editorial/content";
export type PreviewOffer = {
  title?: string;
  description?: string;
  banner_url?: string;
  amount_minor: number;
  minimum_minor: number;
  discount_type?: string;
  percentage_bps?: number;
  scope?: string;
  maximum_minor?: number | null;
  first_order_only?: boolean;
  expires_at?: string | null;
};
export function PromotionPreview({
  offer: item,
  selected = false,
}: {
  offer: PreviewOffer;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const value =
    item.discount_type === "percentage"
      ? `${(item.percentage_bps || 0) / 100}%`
      : `KES ${(item.amount_minor / 100).toLocaleString("en-KE")}`;
  return (
    <View
      style={{
        borderRadius: 22,
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      {item.banner_url ? (
        <LoadingImage
          source={{ uri: mediaSource(item.banner_url) }}
          contentFit="cover"
          style={{ width: "100%", height: 135 }}
        />
      ) : null}
      <LinearGradient
        colors={["#58223F", "#A7176B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 17, gap: 5 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#FFDAEC",
              fontSize: 10,
              fontWeight: "800",
              letterSpacing: 1.3,
            }}
          >
            YOUR LITTLE EXTRA
          </Text>
          <Ionicons
            name={selected ? "checkmark-circle" : "ticket-outline"}
            color="#FFFFFF"
            size={24}
          />
        </View>
        <Text style={{ color: "#FFFFFF", fontSize: 29, fontWeight: "800" }}>
          {value} OFF
        </Text>
        <Text numberOfLines={2} style={{ color: "#FFF1F8", fontSize: 13 }}>
          {item.title || "A little more celebration"}
          {item.scope === "delivery" ? " - delivery" : ""}
        </Text>
      </LinearGradient>
      <View
        style={{
          padding: 13,
          gap: 4,
          borderTopWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}>
          {selected ? "Selected for checkout" : "Select this offer at checkout"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
          Min. KES {item.minimum_minor / 100}
          {item.first_order_only ? " - First order only" : ""}
          {item.maximum_minor ? ` - Up to KES ${item.maximum_minor / 100}` : ""}
          {item.expires_at
            ? ` - Until ${new Date(item.expires_at).toLocaleDateString()}`
            : ""}
          . One coupon per order. {item.description}
        </Text>
      </View>
    </View>
  );
}
