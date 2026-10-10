import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

/** Brand illustration, deliberately separate from actual product photography. */
export function CelebrationArtwork({
  kind = "celebration",
  size = 116,
}: {
  kind?: "celebration" | "bag" | "heart";
  size?: number;
}) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LinearGradient
        colors={["#FFF1F8", "#FBE0EF"]}
        style={{
          width: size * 0.85,
          height: size * 0.85,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ rotate: "-8deg" }],
        }}
      >
        <Ionicons
          name={
            kind === "bag" ? "bag-handle" : kind === "heart" ? "heart" : "gift"
          }
          size={size * 0.48}
          color="#BC006F"
        />
      </LinearGradient>
      {[
        [-0.3, -0.32],
        [0.34, -0.2],
        [0.31, 0.31],
      ].map(([x, y], i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: size * (0.5 + x),
            top: size * (0.5 + y),
            width: 9,
            height: 9,
            borderRadius: i === 1 ? 5 : 2,
            backgroundColor: ["#EC008C", "#1882A8", "#BD8726"][i],
            transform: [{ rotate: "28deg" }],
          }}
        />
      ))}
    </View>
  );
}
