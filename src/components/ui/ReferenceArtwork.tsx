import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

// Display the supplied artwork without resampling or redrawing the brand marks.
// The promotional banner is supplied artwork; its tap target is native UI.
const regions = {
  logo: { x: 135, y: 103, width: 137, height: 46 },
  cakes: { x: 135, y: 472, width: 56, height: 56 },
  cupcakes: { x: 203, y: 472, width: 56, height: 56 },
  pastries: { x: 273, y: 472, width: 56, height: 56 },
  party: { x: 342, y: 472, width: 56, height: 56 },
  accessories: { x: 412, y: 472, width: 56, height: 56 },
  "chocolate-fudge-delight": { x: 552, y: 283, width: 164, height: 148 },
  "red-velvet-dream": { x: 728, y: 283, width: 163, height: 148 },
  "lotus-biscoff-cheesecake": { x: 552, y: 514, width: 164, height: 148 },
  "vanilla-berry-bliss": { x: 728, y: 514, width: 163, height: 148 },
  "black-forest-delight": { x: 370, y: 615, width: 108, height: 98 },
  chocolateDetail: { x: 959, y: 145, width: 339, height: 291 },
  chocolateBanner: { x: 129, y: 241, width: 350, height: 208 },
  redVelvetHome: { x: 133, y: 614, width: 108, height: 141 },
  lotusHome: { x: 251, y: 614, width: 108, height: 141 },
  blackForestHome: { x: 370, y: 615, width: 108, height: 141 },
} as const;

export type ReferenceArtworkName = keyof typeof regions;

export function ReferenceArtwork({
  name,
  width,
  height,
}: {
  name: ReferenceArtworkName;
  width: number;
  height?: number;
}) {
  const region = regions[name];
  const scale = Math.max(
    width / region.width,
    height ? height / region.height : 0,
  );
  const frameHeight = height ?? region.height * scale;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={{ width, height: frameHeight, overflow: "hidden" }}
    >
      <Image
        source={require("../../../assets/cake-city-ui-reference.png")}
        contentFit="fill"
        cachePolicy="memory-disk"
        style={[
          styles.image,
          {
            width: 1448 * scale,
            height: 1086 * scale,
            left: -region.x * scale + (width - region.width * scale) / 2,
            top: -region.y * scale + (frameHeight - region.height * scale) / 2,
          },
        ]}
      />
    </View>
  );
}

export function CakeArtwork({
  source,
  detail = false,
  compact = false,
}: {
  source: string;
  detail?: boolean;
  compact?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const artwork = source.replace("cakecity-artwork:", "");
  const name =
    compact && artwork === "black-forest-delight"
      ? "blackForestHome"
      : compact && artwork === "red-velvet-dream"
        ? "redVelvetHome"
        : compact && artwork === "lotus-biscoff-cheesecake"
          ? "lotusHome"
          : detail && artwork === "chocolate-fudge-delight"
            ? "chocolateDetail"
            : artwork;
  if (!source.startsWith("cakecity-artwork:") || !(name in regions)) {
    return (
      <Image
        source={source}
        contentFit="contain"
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}
    >
      {size.width > 0 && (
        <ReferenceArtwork
          name={name as ReferenceArtworkName}
          width={size.width}
          height={size.height}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ image: { position: "absolute" } });
