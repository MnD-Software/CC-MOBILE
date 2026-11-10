import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Text } from "./Typography";
import { BrandLogo } from "../BrandLogo";

/** Bundled campaign artwork: offline, decorative, never a catalogue product. */
export function BrandSplash() {
  const { width, height } = useWindowDimensions();
  const compact = height < 680;
  const contentWidth = Math.min(width, 500);
  return (
    <LinearGradient
      colors={["#21051E", "#560A39", "#A30762"]}
      style={styles.page}
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.glow,
          {
            width: contentWidth * 1.1,
            height: contentWidth * 1.1,
            borderRadius: contentWidth,
            top: height * 0.22,
          },
        ]}
      />
      <View
        style={[
          styles.content,
          { width: contentWidth, paddingTop: compact ? 28 : 56 },
        ]}
      >
        <View style={styles.topLine}>
          <View style={styles.brand}>
            <BrandLogo width={112} />
          </View>
          <Text style={styles.edition}>CELEBRATE{"\n"}WITH LOVE.</Text>
        </View>
        <View style={{ marginTop: compact ? 22 : 34, gap: 4 }}>
          <Text style={styles.eyebrow}>EVERY MOMENT DESERVES</Text>
          <Text
            accessibilityRole="header"
            style={[
              styles.title,
              { fontSize: compact ? 57 : 72, lineHeight: compact ? 61 : 78 },
            ]}
          >
            a little{"\n"}
            <Text style={{ color: "#67E3F1", fontStyle: "italic" }}>
              extra.
            </Text>
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            minHeight: 0,
            marginTop: compact ? -15 : -24,
            marginHorizontal: -18,
          }}
        >
          <Image
            source={require("../../../assets/cake-city-celebration-hero.png")}
            contentFit="contain"
            accessibilityLabel="A pink celebration cake with cream swirls and colourful ribbons"
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={[styles.footer, { paddingBottom: compact ? 24 : 40 }]}>
          <View style={styles.line} />
          <View style={styles.footerCopy}>
            <Text style={styles.footerTitle}>
              Made for the moments that matter.
            </Text>
            <Text style={styles.footerLabel}>BAKED WITH LOVE · CAKE CITY</Text>
          </View>
          <View style={styles.spark}>
            <Text style={{ color: "#21051E", fontSize: 24 }}>✦</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", overflow: "hidden" },
  content: { flex: 1, paddingHorizontal: 30 },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
  },
  brand: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    transform: [{ rotate: "-3deg" }],
  },
  edition: {
    color: "#FFDEEF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 15,
    letterSpacing: 1.5,
  },
  glow: {
    position: "absolute",
    backgroundColor: "rgba(239,33,139,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  eyebrow: {
    color: "#F7A9D1",
    fontWeight: "700",
    fontSize: 9,
    letterSpacing: 2.4,
    lineHeight: 17,
  },
  title: {
    color: "#FFF4F9",
    fontFamily: Platform.select({
      ios: "Georgia",
      android: "serif",
      default: "Georgia, serif",
    }),
    letterSpacing: -3,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  line: { width: 3, height: 38, backgroundColor: "#67E3F1", borderRadius: 2 },
  footerCopy: { flex: 1, gap: 6 },
  footerTitle: {
    color: "#FFF4F9",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  footerLabel: { color: "#E9A1CA", fontSize: 8, letterSpacing: 1.5 },
  spark: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#67E3F1",
    borderRadius: 20,
  },
});
