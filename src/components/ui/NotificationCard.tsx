import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { useTheme } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";
import { Text } from "./Typography";

export type InboxUpdate = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
};

export function notificationPresentation(data: Record<string, unknown>) {
  const kind = String(data.kind ?? "").toLowerCase();
  if (/delivered|received|completed/.test(kind))
    return {
      icon: "checkmark-circle-outline",
      label: "Delivery update",
      success: true,
    } as const;
  if (/rider|dispatch|route/.test(kind))
    return {
      icon: "bicycle-outline",
      label: "On the move",
      success: false,
    } as const;
  if (/kitchen|prepar|ready|baking/.test(kind))
    return {
      icon: "restaurant-outline",
      label: "From the kitchen",
      success: false,
    } as const;
  if (/coupon|reward|loyal|offer/.test(kind))
    return {
      icon: "gift-outline",
      label: "A little extra",
      success: false,
    } as const;
  return {
    icon: "notifications-outline",
    label: "Your update",
    success: false,
  } as const;
}

export function NotificationCard({
  item,
  disabled,
  onPress,
}: {
  item: InboxUpdate;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const presentation = notificationPresentation(item.data);
  const accent = presentation.success ? colors.success : colors.brandStrong;
  const tint = presentation.success ? colors.successLight : colors.brandLight;
  const date = new Date(item.created_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  return (
    <Pressable
      testID={`notification-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.read_at ? "" : "Unread. "}${item.title}. ${item.body}`}
      accessibilityHint={
        item.data.workspace === "rider"
          ? "Open rider workspace"
          : "View this update"
      }
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { borderRadius: 24, ...tokens.shadow.subtle },
        pressed && { opacity: 0.82 },
      ]}
    >
      <GlassSurface
        style={{ padding: 18, borderRadius: 24, gap: 12 }}
        tintColor={item.read_at ? colors.surface : tint}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              backgroundColor: tint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={presentation.icon} size={24} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: accent,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 0.8,
              }}
            >
              {presentation.label.toUpperCase()}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {dateLabel}
            </Text>
          </View>
          {!item.read_at ? (
            <View
              accessibilityLabel="Unread"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: accent,
              }}
            />
          ) : null}
        </View>
        <Text
          style={{
            color: colors.ink,
            fontWeight: "800",
            fontSize: 17,
            lineHeight: 23,
          }}
        >
          {item.title}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
          {item.body}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingTop: 2,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.muted, fontSize: 11 }}
          >
            {typeof item.data.reference === "string"
              ? `Order ${item.data.reference}`
              : "Cake City"}
          </Text>
          <Text style={{ color: accent, fontSize: 12, fontWeight: "800" }}>
            {item.data.workspace === "rider" ? "Open workspace" : "View update"}
          </Text>
          <Ionicons name="arrow-forward" color={accent} size={16} />
        </View>
      </GlassSurface>
    </Pressable>
  );
}
