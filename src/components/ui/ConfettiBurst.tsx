import { memo, useMemo } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

import { celebrationPieces, gracefulFall } from "./celebration-motion";
const fullPieces = celebrationPieces();
const compactPieces = celebrationPieces(true);
const times = Array.from({ length: 25 }, (_, i) => i / 24);

/**
 * One giant burst of large, glossy foil confetti: two cannons plus a top
 * shower, ballistic arcs, 3D flips with a travelling glint, and a slow
 * fluttering fall. Everything is driven by one native-driven clock.
 */
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
  const pieces = useMemo(
    () =>
      (compact ? compactPieces : fullPieces).map((piece) => {
        const time = motion.interpolate({
          inputRange: [piece.delay, 0.94 + piece.delay],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
        const top = piece.origin === "top";
        const velocity = width * (0.46 + ((piece.index * 13) % 52) / 100);
        const rise = Math.min(660, height * 0.88) * piece.energy;
        const sway = 22 + (piece.index % 16) * (piece.kind === "streamer" ? 2.2 : 1.4);
        const flutter = 5 + (piece.index % 5);
        const flip = time.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${piece.flips * 360}deg`],
        });
        return {
          piece,
          style: {
            position: "absolute" as const,
            left: top
              ? ((piece.index * 43) % Math.max(1, width)) - piece.width / 2
              : piece.side
                ? width - 8
                : -piece.width + 8,
            top: top ? -piece.height - 20 : height * (0.64 + piece.side * 0.07),
            width: piece.width,
            height: piece.height,
            borderRadius:
              piece.kind === "coin"
                ? piece.width / 2
                : piece.kind === "streamer"
                  ? piece.width / 2
                  : 3,
            backgroundColor: piece.color,
            overflow: "hidden" as const,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: "rgba(255,255,255,0.7)",
            opacity: time.interpolate({
              inputRange: [0, 0.02, 0.88, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              { perspective: 640 },
              {
                translateX: time.interpolate({
                  inputRange: times,
                  outputRange: times.map(
                    (t) =>
                      (top ? 0.16 : piece.side ? -1 : 1) *
                        velocity *
                        (1 - Math.exp(-2.6 * t)) +
                      Math.sin(t * flutter + piece.index) *
                        sway *
                        Math.sin(Math.PI * t),
                  ),
                }),
              },
              {
                translateY: time.interpolate({
                  inputRange: times,
                  outputRange: times.map((t) =>
                    top
                      ? (height + piece.height + 60) * t ** 1.15 +
                        Math.sin(t * 7 + piece.index) * 10
                      : gracefulFall(t, rise, height + piece.height),
                  ),
                }),
              },
              {
                rotate: time.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    `${piece.index * 31}deg`,
                    `${piece.index * 31 + (piece.side ? -1 : 1) * (220 + (piece.index % 12) * 36)}deg`,
                  ],
                }),
              },
              piece.kind === "coin" || piece.kind === "square"
                ? { rotateY: flip }
                : { rotateX: flip },
              {
                scaleX: time.interpolate({
                  inputRange: times,
                  outputRange: times.map(
                    (t) =>
                      0.3 + Math.abs(Math.cos(t * 8 + piece.index)) * 0.7,
                  ),
                }),
              },
            ],
          },
          // The glint brightens as the foil faces the light.
          glint: time.interpolate({
            inputRange: times,
            outputRange: times.map(
              (t) =>
                0.18 +
                0.62 *
                  Math.abs(Math.cos(t * Math.PI * piece.flips + piece.index)),
            ),
          }),
        };
      }),
    [compact, motion, width, height],
  );
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 100 }]}
    >
      {pieces.map(({ piece, style, glint }) => (
        <Animated.View key={piece.index} style={style}>
          <Animated.View
            style={{
              position: "absolute",
              left: piece.kind === "coin" ? "18%" : 0,
              right: piece.kind === "coin" ? "38%" : 0,
              top: piece.kind === "coin" ? "14%" : 0,
              height: piece.kind === "coin" ? "36%" : "44%",
              borderRadius: piece.kind === "coin" ? piece.width : 2,
              backgroundColor: "#FFFFFF",
              opacity: glint,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "30%",
              backgroundColor: "rgba(81,56,45,0.14)",
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
});
