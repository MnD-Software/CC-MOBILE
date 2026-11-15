import { View } from "react-native";

/**
 * The tear line of a paper coupon: two punched notches and a dashed seam.
 * `cutout` should match the colour behind the card so the notches read as holes.
 */
export function CouponPerforation({
  cutout,
  line,
  size = 14,
}: {
  cutout: string;
  line: string;
  size?: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ height: 0, justifyContent: "center", zIndex: 2 }}
    >
      <View
        style={{
          position: "absolute",
          left: size / 2 + 4,
          right: size / 2 + 4,
          borderTopWidth: 1.5,
          borderStyle: "dashed",
          borderColor: line,
        }}
      />
      {(["left", "right"] as const).map((side) => (
        <View
          key={side}
          style={{
            position: "absolute",
            [side]: -size / 2,
            top: -size / 2,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: cutout,
          }}
        />
      ))}
    </View>
  );
}
