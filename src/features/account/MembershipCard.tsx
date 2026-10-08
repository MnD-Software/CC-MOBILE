import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
  PixelRatio,
  StyleSheet,
  type LayoutChangeEvent,
} from "react-native";
import { Text } from "@/components/ui/Typography";
import { useReducedMotion } from "@/design/useReducedMotion";
import { money } from "@/features/commerce/contracts";
import {
  memberBarcode,
  barcodeModules,
  membershipPalette,
} from "./member-card";

export function MembershipCard({
  id,
  name,
  tier,
  points,
  pointValue,
  rewards,
}: {
  id: string;
  name: string;
  tier: string;
  points: number;
  pointValue: number;
  rewards: number;
}) {
  const [faceHeight, setFaceHeight] = useState(220);
  const shine = useRef(new Animated.Value(0)).current;
  const [back, setBack] = useState(false);
  const [barcodeWidth, setBarcodeWidth] = useState(0);
  const turn = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const palette = membershipPalette(tier);
  const code = useMemo(() => memberBarcode(id), [id]);
  const modules = useMemo(() => barcodeModules(code), [code]);
  const scale = PixelRatio.get();
  const modulePixels = Math.max(
    1,
    Math.floor((barcodeWidth * scale) / modules.length),
  );
  useEffect(() => {
    shine.setValue(0);
    if (reduced || back) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(2400),
        Animated.timing(shine, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.delay(7000),
        Animated.timing(shine, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [back, reduced, shine]);
  const measureFace = (event: LayoutChangeEvent) => {
    // Native synthetic events are released after the handler returns. Capture
    // the primitive now; React may execute the state updater on a later render.
    const measuredHeight = event.nativeEvent.layout.height;
    setFaceHeight((height) => Math.max(height, Math.ceil(measuredHeight)));
  };
  const flip = () => {
    const next = !back;
    setBack(next);
    turn.stopAnimation();
    Animated.timing(turn, {
      toValue: next ? 1 : 0,
      duration: reduced ? 0 : 480,
      useNativeDriver: true,
    }).start();
  };
  const face = {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    minHeight: faceHeight,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  } as const;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={flip}
        accessibilityRole="button"
        accessibilityLabel={
          back
            ? "Show membership points"
            : "Flip membership card to show branch barcode"
        }
        accessibilityHint="Tap to turn your membership card"
        style={{
          minHeight: faceHeight,
          borderRadius: 22,
          shadowColor: "#21131B",
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 9 },
          elevation: 6,
        }}
      >
        <Animated.View
          accessibilityElementsHidden={back}
          importantForAccessibility={back ? "no-hide-descendants" : "auto"}
          style={{
            backfaceVisibility: "hidden",
            transform: [
              { perspective: 1200 },
              {
                rotateY: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "180deg"],
                }),
              },
            ],
          }}
        >
          <LinearGradient
            colors={palette.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            onLayout={measureFace}
            style={face}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: palette.ink,
                  fontSize: 11,
                  letterSpacing: 1,
                  fontWeight: "800",
                }}
              >
                CAKE CITY CLUB
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 99,
                  borderWidth: 1,
                  borderColor: palette.accent,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Ionicons
                  name="diamond-outline"
                  size={13}
                  color={palette.accent}
                />
                <Text
                  style={{
                    color: palette.ink,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {tier}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, justifyContent: "center", gap: 4 }}>
              <Text
                style={{
                  color: palette.ink,
                  fontSize: 30,
                  lineHeight: 38,
                  fontWeight: "800",
                }}
              >
                {points.toLocaleString()}{" "}
                <Text style={{ fontSize: 13 }}>points</Text>
              </Text>
              <Text style={{ color: palette.muted, fontSize: 11 }}>
                Points value {money(points * pointValue)} ? {rewards} issued
                rewards
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: palette.ink,
                  fontSize: 12,
                  fontWeight: "700",
                  flex: 1,
                }}
              >
                {name}
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Text style={{ color: palette.muted, fontSize: 11 }}>
                  Tap to flip
                </Text>
                <Ionicons
                  name="sync-outline"
                  size={16}
                  color={palette.accent}
                />
              </View>
            </View>
            <View
              pointerEvents="none"
              accessible={false}
              style={StyleSheet.absoluteFill}
            >
              {!reduced && !back ? (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: -100,
                    bottom: -100,
                    width: 120,
                    transform: [
                      {
                        translateX: shine.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-240, 700],
                        }),
                      },
                      { rotate: "22deg" },
                    ],
                  }}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255,255,255,0)",
                      "rgba(255,255,255,0.32)",
                      "rgba(255,255,255,0)",
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1 }}
                  />
                </Animated.View>
              ) : null}
              <View
                style={{
                  position: "absolute",
                  top: 1,
                  left: 20,
                  right: 20,
                  height: 1,
                  backgroundColor: "rgba(255,255,255,0.65)",
                }}
              />
            </View>
          </LinearGradient>
        </Animated.View>
        <Animated.View
          accessibilityElementsHidden={!back}
          importantForAccessibility={!back ? "no-hide-descendants" : "auto"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            backfaceVisibility: "hidden",
            transform: [
              { perspective: 1200 },
              {
                rotateY: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["180deg", "360deg"],
                }),
              },
            ],
          }}
        >
          <LinearGradient
            colors={palette.gradient}
            onLayout={measureFace}
            style={[face, { gap: 6, padding: 16 }]}
          >
            <Text
              style={{ color: palette.ink, fontSize: 17, fontWeight: "700" }}
            >
              Your Club pass
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>
              Your membership, ready at the counter.
            </Text>
            <View
              onLayout={(event) =>
                setBarcodeWidth(event.nativeEvent.layout.width)
              }
              style={{
                backgroundColor: "#FFFFFF",
                paddingVertical: 10,
                alignItems: "center",
                borderRadius: 12,
                marginVertical: 2,
              }}
            >
              <View
                accessible={false}
                style={{ flexDirection: "row", height: 54 }}
              >
                {modulePixels > 0
                  ? Array.from(modules, (bit, index) => (
                      <View
                        key={index}
                        style={{
                          width: modulePixels / scale,
                          height: 54,
                          backgroundColor: bit === "1" ? "#000000" : "#FFFFFF",
                        }}
                      />
                    ))
                  : null}
              </View>
              <Text style={{ color: "#222222", fontSize: 10, marginTop: 5 }}>
                {code}
              </Text>
            </View>
            <Text
              style={{ color: palette.ink, fontWeight: "700", fontSize: 13 }}
            >
              {name} / {tier}
            </Text>
            <Text style={{ color: palette.accent, fontSize: 12 }}>
              Tap to flip back
            </Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}
