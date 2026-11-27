import { useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/Typography";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { useDeviceTier } from "@/design/device-tier";
import { ModelScene } from "./ModelScene";
import { cakeScene, cakeSceneConfig } from "./cake-scene";
import { StageControl } from "./StageControl";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { useScreenActive } from "@/design/useScreenActive";
import { BottomSheet } from "@/components/ui/BottomSheet";

export function stageHeight(
  windowHeight: number,
  expanded: boolean,
  windowWidth = 430,
) {
  if (expanded) return Math.round(Math.min(420, windowHeight * 0.5));
  if (windowHeight < 640) return 112;
  if (windowWidth <= 380) return 132;
  return windowHeight < 700 ? 144 : 180;
}

/**
 * The DIY preview is the live 3D illustration only (the owner removed the
 * "Real cake" photo option). The product photo is shown plainly only when
 * the phone cannot run 3D, so the stage is never left empty.
 */
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
    { height, width } = useWindowDimensions();
  const { reduceMotion } = useMotionAccessibilityPreference();
  const active = useScreenActive();
  const [slice, setSlice] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tier = useDeviceTier();
  // Set when WebGL cannot start or the GPU drops it (common on budget phones).
  const [glFailed, setGlFailed] = useState(false);
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
        reduceMotion: reduceMotion || !active,
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
      active,
      colors.surface,
      colors.surfaceRaised,
      tier,
    ],
  );
  // The document is created once per mount; later changes stream into it.
  const initial = useRef(config);
  const html = useMemo(() => cakeScene({ ...initial.current }), []);
  const fallback = glFailed && image;
  const editor = (large: boolean) => {
    const h = stageHeight(height, large, width);
    return (
      <GlassSurface
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
        {large ? (
          <View
            style={{
              justifyContent: "center",
              paddingHorizontal: 12,
              minHeight: 44,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: colors.ink, fontWeight: "800", fontSize: 12 }}
            >
              {name || "Your cake studio"}
            </Text>
          </View>
        ) : null}
        <View style={{ height: h }}>
          {fallback ? (
            <LoadingImage
              source={{ uri: image ?? "" }}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
              accessibilityLabel={`Photo of ${name}`}
            />
          ) : (
            <ModelScene
              html={html}
              config={config}
              onUnavailable={() => setGlFailed(true)}
            />
          )}
          <View
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              gap: 2,
              flexDirection: h < 120 ? "row" : "column",
            }}
          >
            {!fallback ? (
              <StageControl
                icon="cut-outline"
                label="Show inside layers"
                active={slice}
                onPress={() => setSlice((v) => !v)}
              />
            ) : null}
            <StageControl
              icon={large ? "contract-outline" : "expand-outline"}
              label={large ? "Shrink preview" : "Enlarge preview"}
              active={large}
              onPress={() => setExpanded((v) => !v)}
            />
          </View>
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
            {fallback
              ? "3D isn't available on this phone · product photo"
              : slice
                ? "Illustrative layers · drag to turn, pinch to zoom"
                : "Live 3D - drag to turn"}
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
      </GlassSurface>
    );
  };
  return (
    <>
      <View
        testID="diy-fixed-preview"
        accessibilityLabel={
          name ? `Live cake preview: ${name}` : "Live cake preview"
        }
      >
        {expanded ? (
          <View style={{ height: stageHeight(height, false) + 38 }} />
        ) : (
          editor(false)
        )}
      </View>
      <BottomSheet
        visible={expanded}
        title="Your cake preview"
        onClose={() => setExpanded(false)}
      >
        {expanded ? editor(true) : null}
      </BottomSheet>
    </>
  );
}
