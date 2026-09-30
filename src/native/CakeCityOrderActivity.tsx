import { Image, Text, VStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

export type OrderActivityProps = {
  orderNumber: string;
  statusLabel: string;
  compactLabel: string;
  updatedAt: string;
};

function OrderActivity(
  props: OrderActivityProps,
  environment: LiveActivityEnvironment,
) {
  "widget";
  const accent = environment.isLuminanceReduced ? "#FFFFFF" : "#EC008C";
  const status = environment.isStale
    ? "Open Cake City for an update"
    : props.statusLabel;
  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 16 })]}
      >
        <Text
          modifiers={[
            font({ size: 12, weight: "bold" }),
            foregroundStyle(accent),
          ]}
        >
          CAKE CITY · ORDER {props.orderNumber}
        </Text>
        <Text modifiers={[font({ size: 20, weight: "bold" })]}>{status}</Text>
        <Text modifiers={[font({ size: 11 })]}>
          Updated {props.updatedAt} · Open Cake City for the latest
        </Text>
      </VStack>
    ),
    compactLeading: <Image systemName="birthday.cake.fill" color={accent} />,
    compactTrailing: (
      <Text modifiers={[font({ size: 11, weight: "semibold" })]}>
        {environment.isStale ? "Open app" : props.compactLabel}
      </Text>
    ),
    minimal: <Image systemName="birthday.cake.fill" color={accent} />,
    expandedLeading: (
      <Text modifiers={[foregroundStyle(accent), font({ weight: "bold" })]}>
        Cake City
      </Text>
    ),
    expandedTrailing: (
      <Text modifiers={[font({ size: 12 })]}>#{props.orderNumber}</Text>
    ),
    expandedBottom: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ all: 12 })]}
      >
        <Text modifiers={[font({ size: 18, weight: "bold" })]}>{status}</Text>
        <Text modifiers={[font({ size: 11 })]}>
          Updated {props.updatedAt} · Tap to view your order
        </Text>
      </VStack>
    ),
  };
}

export default createLiveActivity<OrderActivityProps>(
  "CakeCityOrder",
  OrderActivity,
);
