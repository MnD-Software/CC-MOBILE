import { useMemo, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { performHaptic } from "@/design/haptics";
import { ModelScene } from "./ModelScene";
import { cakeScene, cakeSceneConfig } from "./cake-scene";

export function stageHeight(windowHeight: number, expanded: boolean) {
  if (expanded) return Math.round(Math.min(420, windowHeight * 0.5));
  if (windowHeight < 640) return 128;
  return windowHeight < 700 ? 150 : 200;
}

export function CakeStage({
  image,
  name,
  colour,
  message,
  candles,
  sprinkles = false,
  sizeKg = null,
  price,
}: {
  image: string | null;
  name: string;
  colour: string;
  message: string;
  candles: boolean;
  sprinkles?: boolean;
  sizeKg?: number | null;
  price: string;
}) {
  const { colors } = useTheme(),
    { height } = useWindowDimensions();
  const { reduceMotion } = useMotionAccessibilityPreference();
  const [mode, setMode] = useState<"photo" | "3d">("3d");
  const [slice, setSlice] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const displayedMode = image ? mode : "3d";
  const config = useMemo(
    () =>
      cakeSceneConfig({
        colour,
        message,
        candles,
        sprinkles,
        flavour: name,
        sizeKg,
        slice,
        reduceMotion,
        backdrop: [colors.surface, colors.surfaceRaised],
      }),
    [
      colour,
      message,
      candles,
      sprinkles,
      name,
      sizeKg,
      slice,
      reduceMotion,
      colors.surface,
      colors.surfaceRaised,
    ],
  );
  // The document is created once per mount; later changes stream into it.
  const initial = useRef(config);
  const html = useMemo(() => cakeScene({ ...initial.current }), []);
  const control = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    active: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      onPress={() => {
        void performHaptic(active ? "toggleOff" : "toggleOn");
        onPress();
      }}
      hitSlop={4}
      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <GlassSurface
        interactive
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: active ? 1.5 : 1,
          borderColor: active ? colors.brandStrong : "rgba(255,255,255,0.75)",
          overflow: "hidden",
        }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={active ? colors.brandStrong : colors.ink}
        />
      </GlassSurface>
    </Pressable>
  );
  return (
    <View
      testID="diy-fixed-preview"
      style={{
        marginTop: 8,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
        shadowColor: "#51382D",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
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
            onPress={() => {
              if (mode !== value) void performHaptic("selection");
              setMode(value);
            }}
            style={{
              minHeight: 44,
              paddingHorizontal: 8,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor:
                  displayedMode === value ? colors.brandLight : "transparent",
                opacity: value === "photo" && !image ? 0.45 : 1,
              }}
            >
              <Text
                style={{
                  color:
                    displayedMode === value ? colors.brandStrong : colors.muted,
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {value === "photo" ? "Photo" : "3D"}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={{ height: stageHeight(height, expanded) }}>
        {displayedMode === "photo" && image ? (
          <LoadingImage
            source={{ uri: image }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
            accessibilityLabel={`Product reference photo of ${name}`}
          />
        ) : (
          <>
            <ModelScene html={html} config={config} />
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                gap: 2,
              }}
            >
              {control("cut-outline", "Show inside layers", slice, () =>
                setSlice((v) => !v),
              )}
              {control(
                expanded ? "contract-outline" : "expand-outline",
                expanded ? "Shrink 3D preview" : "Enlarge 3D preview",
                expanded,
                () => setExpanded((v) => !v),
              )}
            </View>
          </>
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
          {displayedMode === "photo" && image
            ? "Product photo · custom finish reviewed with the kitchen"
            : slice
              ? "Illustrative layers · drag to turn, pinch to zoom"
              : "3D design illustration · drag, pinch, tap"}
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
