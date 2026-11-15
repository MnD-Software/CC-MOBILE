import { useMemo, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/Typography";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { ModelScene } from "./ModelScene";
import { cakeScene } from "./cake-scene";
export function CakeStage({
  image,
  name,
  colour,
  message,
  candles,
  price,
}: {
  image: string | null;
  name: string;
  colour: string;
  message: string;
  candles: boolean;
  price: string;
}) {
  const { colors } = useTheme(),
    { height } = useWindowDimensions();
  const { reduceMotion } = useMotionAccessibilityPreference();
  const [mode, setMode] = useState<"photo" | "3d">("photo");
  const displayedMode = image ? mode : "3d";
  const html = useMemo(
    () =>
      cakeScene({
        colour,
        message,
        candles,
        caramel: /caramel/i.test(name),
        reduceMotion,
      }),
    [colour, message, candles, name, reduceMotion],
  );
  return (
    <View
      testID="diy-fixed-preview"
      style={{
        marginTop: 8,
        borderRadius: 22,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 8,
          minHeight: 44,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: colors.ink,
            fontWeight: "800",
            flex: 1,
            fontSize: 12,
          }}
        >
          {name || "Your cake studio"}
        </Text>
        {(["photo", "3d"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={
              value === "photo"
                ? "Product reference photo"
                : "Interactive 3D design"
            }
            accessibilityState={{ selected: displayedMode === value }}
            disabled={value === "photo" && !image}
            onPress={() => setMode(value)}
            style={{
              minHeight: 44,
              paddingHorizontal: 8,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color:
                  displayedMode === value ? colors.brandStrong : colors.muted,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {value === "photo" ? "Photo" : "3D"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={{ height: height < 700 ? 110 : 150 }}>
        {mode === "photo" && image ? (
          <LoadingImage
            source={{ uri: image }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
            accessibilityLabel={`Product reference photo of ${name}`}
          />
        ) : (
          <ModelScene html={html} />
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 7,
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: colors.muted, fontSize: 10, flex: 1 }}
        >
          {mode === "photo" && image
            ? "Product photo · custom finish reviewed with the kitchen"
            : "3D design illustration · drag to turn"}
        </Text>
        <Text
          style={{ color: colors.brandStrong, fontWeight: "800", fontSize: 12 }}
        >
          {price}
        </Text>
      </View>
    </View>
  );
}
