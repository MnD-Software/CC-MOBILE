import { useMemo, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { performHaptic } from "@/design/haptics";
import { useDeviceTier } from "@/design/device-tier";
import { ModelScene } from "./ModelScene";
import { cakeScene, cakeSceneConfig } from "./cake-scene";
import { RealCakeView } from "./RealCakeView";
import { StageControl } from "./StageControl";
import type { Placement } from "./real-cake";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Ionicons } from "@expo/vector-icons";

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
  placement,
  onPlacementChange,
}: {
  image: string | null;
  name: string;
  colour: string;
  message: string;
  candles: boolean;
  sprinkles?: boolean;
  sizeKg?: number | null;
  price: string;
  placement?: Placement;
  onPlacementChange?: (placement: Placement) => void;
}) {
  const { colors } = useTheme(),
    { height } = useWindowDimensions();
  const { reduceMotion } = useMotionAccessibilityPreference();
  const [mode, setMode] = useState<"photo" | "3d">(image ? "photo" : "3d");
  const [slice, setSlice] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tier = useDeviceTier();
  // Set when WebGL cannot start or the GPU drops it (common on budget phones).
  const [glFailed, setGlFailed] = useState(false);
  const displayedMode =
    image && (mode === "photo" || glFailed) ? "photo" : "3d";
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
        quality: tier,
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
      tier,
    ],
  );
  // The document is created once per mount; later changes stream into it.
  const initial = useRef(config);
  const html = useMemo(() => cakeScene({ ...initial.current }), []);
  const expandControl = (
    <StageControl
      icon={expanded ? "contract-outline" : "expand-outline"}
      label={expanded ? "Shrink preview" : "Enlarge preview"}
      active={expanded}
      onPress={() => setExpanded((v) => !v)}
    />
  );
  return (
    <>
      <Pressable
        testID="diy-fixed-preview"
        accessibilityRole="button"
        accessibilityLabel="Open cake preview and placement editor"
        onPress={() => setExpanded(true)}
        style={({ pressed }) => ({
          marginTop: 8,
          minHeight: 76,
          padding: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.brandLight : colors.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        })}
      >
        {image ? (
          <LoadingImage
            source={{ uri: image }}
            contentFit="cover"
            style={{ width: 60, height: 60, borderRadius: 12 }}
          />
        ) : (
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              backgroundColor: colour,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="gift-outline" size={25} color={colors.ink} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontSize: 13, fontWeight: "700" }}
          >
            {name || "Your cake preview"}
          </Text>
          <Text
            style={{
              color: colors.brandStrong,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {price}
          </Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
            {message || "Preview, rotate & place your decorations"}
          </Text>
        </View>
        <Ionicons name="expand-outline" size={20} color={colors.brandStrong} />
      </Pressable>
      <BottomSheet
        visible={expanded}
        title="Your cake preview"
        onClose={() => setExpanded(false)}
      >
        <View
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
                    ? "Real cake: the bakery photo with your additions"
                    : "Interactive 3D design illustration"
                }
                accessibilityState={{ selected: displayedMode === value }}
                disabled={
                  (value === "photo" && !image) || (value === "3d" && glFailed)
                }
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
                      displayedMode === value
                        ? colors.brandLight
                        : "transparent",
                    opacity:
                      (value === "photo" && !image) ||
                      (value === "3d" && glFailed)
                        ? 0.45
                        : 1,
                  }}
                >
                  <Text
                    style={{
                      color:
                        displayedMode === value
                          ? colors.brandStrong
                          : colors.muted,
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {value === "photo" ? "Real cake" : "3D"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ height: stageHeight(height, expanded) }}>
            {displayedMode === "photo" && image ? (
              <RealCakeView
                image={image}
                name={name}
                colour={colour}
                message={message}
                candles={candles}
                sprinkles={sprinkles}
                reduceMotion={reduceMotion}
                height={stageHeight(height, expanded)}
                extraControls={expandControl}
                placement={placement}
                onPlacementChange={onPlacementChange}
                tier={tier}
              />
            ) : (
              <>
                <ModelScene
                  html={html}
                  config={config}
                  onUnavailable={() => setGlFailed(true)}
                />
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    gap: 2,
                  }}
                >
                  <StageControl
                    icon="cut-outline"
                    label="Show inside layers"
                    active={slice}
                    onPress={() => setSlice((v) => !v)}
                  />
                  {expandControl}
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
                ? "Bakery photo · your additions shown as a placement guide"
                : slice
                  ? "Illustrative layers · drag to turn, pinch to zoom"
                  : "3D design illustration · drag, pinch, tap"}
            </Text>
            <Text
              style={{
                color: colors.brandStrong,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              {price}
            </Text>
          </View>
        </View>
      </BottomSheet>
    </>
  );
}
