import { memo } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";

const pieces = Array.from({ length: 152 }, (_, index) => ({
  index,
  side: index % 2,
  delay: Math.floor(index / 34) * 0.065 + (index % 8) * 0.006,
  energy: 0.58 + ((index * 17) % 35) / 100,
  color: ["#EC008C", "#EAC46B", "#FFF1C2", "#51C4DC", "#F58FC5", "#BE87C5"][
    index % 6
  ],
}));
const times = Array.from({ length: 13 }, (_, i) => i / 12);

/** Two cannons, ballistic arcs, fluttering ribbons; one native-driven clock. */
export const ConfettiBurst = memo(function ConfettiBurst({
  motion,
  testID,
}: {
  motion: Animated.Value;
  testID: string;
}) {
  const { width, height } = useWindowDimensions();
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={[StyleSheet.absoluteFill, { overflow: "hidden", zIndex: 100 }]}
    >
      {pieces.map((piece) => {
        const time = motion.interpolate({
          inputRange: [piece.delay, 0.76 + piece.delay],
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
              height: piece.index % 4 === 0 ? 6 : 11 + (piece.index % 9),
              borderRadius: piece.index % 4 === 0 ? 4 : 1,
              backgroundColor: piece.color,
              opacity: time.interpolate({
                inputRange: [0, 0.025, 0.7, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: time.interpolate({
                    inputRange: times,
                    outputRange: times.map(
                      (t) =>
                        (piece.index % 4 === 0 ? 0.18 : piece.side ? -1 : 1) *
                          velocity *
                          (1 - Math.exp(-2.7 * t)) +
                        Math.sin(t * 11 + piece.index) * 14 * t,
                    ),
                  }),
                },
                {
                  translateY: time.interpolate({
                    inputRange: times,
                    outputRange: times.map((t) =>
                      piece.index % 4 === 0
                        ? (height + 40) * t + Math.sin(t * 9 + piece.index) * 12
                        : -4 * rise * t + (height + 4 * rise) * t * t,
                    ),
                  }),
                },
                {
                  rotate: time.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      `${piece.index * 31}deg`,
                      `${piece.index * 31 + (piece.side ? -1 : 1) * (1080 + piece.index * 13)}deg`,
                    ],
                  }),
                },
                {
                  scaleX: time.interpolate({
                    inputRange: times,
                    outputRange: times.map(
                      (t) =>
                        0.25 + Math.abs(Math.cos(t * 18 + piece.index)) * 0.75,
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
