import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, AppState, View, type ViewProps } from "react-native";
import { useReducedMotion } from "@/design/useReducedMotion";
import { useTheme } from "@/theme/ThemeProvider";

/** The same little icing-and-candle animation in buttons, searches and screens. */
export function CakeCityLoader({
  color,
  size = "small",
  style,
  accessibilityLabel = "Loading Cake City",
  ...props
}: ViewProps & { color?: string; size?: "small" | "large" | number }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const dimension =
    typeof size === "number" ? size : size === "large" ? 52 : 26;
  const paint = color ?? colors.brandStrong;
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    function update(state: string | null | undefined) {
      animation?.stop();
      progress.setValue(0);
      if (reduced || state !== "active") return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(progress, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );
      animation.start();
    }
    update(AppState.currentState);
    const subscription = AppState.addEventListener("change", update);
    return () => {
      subscription.remove();
      animation?.stop();
    };
  }, [progress, reduced]);
  return (
    <View
      testID="cake-city-loader"
      {...props}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: dimension,
          height: dimension,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
        },
        style,
      ]}
    >
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: dimension * 0.07,
            height: dimension * 0.13,
            borderRadius: 2,
            backgroundColor: paint,
            left: `${12 + i * 34}%`,
            top: `${14 + (i % 2) * 7}%`,
            opacity: progress.interpolate({
              inputRange: [0, 0.3, 0.7, 1],
              outputRange: [0.15, 0.8, 1, 0.15],
            }),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [
                    dimension * 0.1,
                    -dimension * (0.1 + i * 0.025),
                    -dimension * 0.2,
                  ],
                }),
              },
              {
                rotate: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [`${i * 40}deg`, `${120 + i * 50}deg`],
                }),
              },
              {
                scale: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.5, 1, 0.4],
                }),
              },
            ],
          }}
        />
      ))}
      <Animated.View
        style={{
          width: "100%",
          height: "100%",
          transform: [
            {
              rotate: progress.interpolate({
                inputRange: [0, 0.3, 0.7, 1],
                outputRange: ["0deg", "-5deg", "4deg", "0deg"],
              }),
            },
            {
              scaleX: progress.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1.03, 0.97, 1],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -dimension * 0.13],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            position: "absolute",
            left: "10%",
            bottom: "4%",
            width: "80%",
            height: "9%",
            borderRadius: dimension,
            backgroundColor: paint,
            opacity: 0.12,
            transform: [{ scaleX: 1.1 }],
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "10%",
            bottom: "10%",
            width: "80%",
            height: "8%",
            borderRadius: dimension,
            backgroundColor: paint,
          }}
        />
        <LinearGradient
          colors={["rgba(255,255,255,.5)", "rgba(255,255,255,0)"]}
          style={{
            position: "absolute",
            left: "10%",
            bottom: "13%",
            width: "80%",
            height: "5%",
            borderRadius: dimension,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "18%",
            top: "44%",
            width: "64%",
            height: "36%",
            backgroundColor: paint,
            borderBottomLeftRadius: dimension * 0.18,
            borderBottomRightRadius: dimension * 0.18,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={[
              "rgba(255,255,255,.3)",
              "rgba(255,255,255,0)",
              "rgba(0,0,0,.18)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: "absolute", inset: 0 }}
          />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "47%",
              height: "9%",
              backgroundColor: "rgba(255,255,255,.5)",
            }}
          />
        </View>
        <View
          style={{
            position: "absolute",
            left: "18%",
            top: "36%",
            width: "64%",
            height: "19%",
            borderRadius: dimension,
            backgroundColor: paint,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,.68)", "rgba(255,255,255,.12)"]}
            style={{ position: "absolute", inset: 0 }}
          />
        </View>
        {[0, 1, 2].map((i) => (
          <View
            key={`candle-${i}`}
            testID="loader-candle"
            style={{
              position: "absolute",
              left: `${30 + i * 17}%`,
              top: i === 1 ? "3%" : "10%",
              width: "6%",
              height: "36%",
            }}
          >
            <Animated.View
              style={{
                width: "100%",
                height: "32%",
                borderTopLeftRadius: dimension,
                borderTopRightRadius: dimension,
                borderBottomLeftRadius: dimension,
                backgroundColor: paint,
                opacity: progress.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0.6, 1, 0.7],
                }),
                transform: [
                  {
                    scaleY: progress.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.8, 1.18, 0.9],
                    }),
                  },
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [`${-8 + i * 3}deg`, `${8 - i * 3}deg`],
                    }),
                  },
                ],
              }}
            />
            <View
              style={{
                position: "absolute",
                top: "40%",
                bottom: 0,
                width: "100%",
                borderRadius: 2,
                backgroundColor: paint,
                overflow: "hidden",
              }}
            >
              <LinearGradient
                colors={["rgba(255,255,255,.55)", "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: "absolute", inset: 0 }}
              />
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
