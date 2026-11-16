import { memo } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

import { celebrationPieces, gracefulFall } from "./celebration-motion";
import { useDeviceTier } from "@/design/device-tier";
const fullPieces = celebrationPieces();
const compactPieces = celebrationPieces(true);
const times = Array.from({ length: 25 }, (_, i) => i / 24);
const liteTimes = Array.from({ length: 9 }, (_, i) => i / 8);

/** Two cannons, ballistic arcs, fluttering ribbons; one native-driven clock. */
export const ConfettiBurst = memo(function ConfettiBurst({
  motion,
  testID,
  compact = false,
}: {
  motion: Animated.Value;
  testID: string;
  compact?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const tier = useDeviceTier();
  const samples = tier === "lite" ? liteTimes : times;
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 100 }]}
    >
      {(compact ? compactPieces : fullPieces).map((piece) => {
        const time = motion.interpolate({
          inputRange: [piece.delay, 0.94 + piece.delay],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
        const velocity = width * (0.48 + ((piece.index * 13) % 50) / 100);
        const rise = Math.min(620, height * 0.85) * piece.energy;
        return (
          <Animated.View
            key={piece.index}
            style={{
              position: "absolute",
              left:
                piece.index % 4 === 0
                  ? (piece.index * 43) % Math.max(1, width)
                  : piece.side
                    ? width - 12
                    : 12,
              top:
                piece.index % 4 === 0
                  ? -24
                  : height * (0.62 + piece.side * 0.08),
              width: piece.index % 4 === 0 ? 6 : 5 + (piece.index % 5),
              height:
                piece.index % 4 === 0
                  ? 6
                  : piece.index % 9 === 0
                    ? 29
                    : 10 + (piece.index % 9),
              borderRadius: piece.index % 4 === 0 ? 4 : 2,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.45)",
              backgroundColor: piece.color,
              opacity: time.interpolate({
                inputRange: [0, 0.025, 0.86, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: time.interpolate({
                    inputRange: samples,
                    outputRange: samples.map(
                      (t) =>
                        (piece.index % 4 === 0 ? 0.18 : piece.side ? -1 : 1) *
                          velocity *
                          (1 - Math.exp(-2.7 * t)) +
                        Math.sin(t * (6 + (piece.index % 4)) + piece.index) *
                          (18 + (piece.index % 14)) *
                          Math.sin(Math.PI * t),
                    ),
                  }),
                },
                {
                  translateY: time.interpolate({
                    inputRange: samples,
                    outputRange: samples.map((t) =>
                      piece.index % 4 === 0
                        ? (height + 40) * t ** 1.12 +
                          Math.sin(t * 7 + piece.index) * 8
                        : gracefulFall(t, rise, height),
                    ),
                  }),
                },
                {
                  rotate: time.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      `${piece.index * 31}deg`,
                      `${piece.index * 31 + (piece.side ? -1 : 1) * (240 + (piece.index % 12) * 38)}deg`,
                    ],
                  }),
                },
                {
                  scaleX: time.interpolate({
                    inputRange: samples,
                    outputRange: samples.map(
                      (t) =>
                        0.25 + Math.abs(Math.cos(t * 8 + piece.index)) * 0.75,
                    ),
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
});
