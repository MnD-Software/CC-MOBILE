import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { tokens } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/ThemeProvider";

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: Props) {
  const styles = useThemedStyles(baseStyles);
  const opacity = useRef(new Animated.Value(0.62)).current;
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.62,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );
    const glint = Animated.loop(
      Animated.timing(shine, {
        toValue: 1,
        duration: 1450,
        useNativeDriver: true,
      }),
    );
    const start = () => {
      shine.setValue(0);
      pulse.start();
      glint.start();
    };
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (active && !reduced) start();
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        if (reduced) {
          pulse.stop();
          glint.stop();
          opacity.setValue(0.78);
          shine.setValue(0.5);
        } else start();
      },
    );
    return () => {
      active = false;
      listener.remove();
      pulse.stop();
      glint.stop();
    };
  }, [opacity, shine]);

  return (
    <Animated.View
      accessible={false}
      style={[
        styles.skeleton,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shine,
          {
            transform: [
              {
                translateX: shine.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-150, 210],
                }),
              },
              { rotate: "18deg" },
            ],
          },
        ]}
      />
    </Animated.View>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading products"
      accessibilityState={{ busy: true }}
      style={styles.grid}
    >
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} accessible={false} style={styles.card}>
          <Skeleton height={148} radius={0} />
          <View style={styles.body}>
            <Skeleton width="90%" height={13} />
            <Skeleton width="60%" height={13} style={{ marginTop: 8 }} />
            <Skeleton width="40%" height={14} style={{ marginTop: 10 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
      accessibilityState={{ busy: true }}
      style={styles.list}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} accessible={false} style={styles.row}>
          <Skeleton width={48} height={48} radius={14} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="75%" height={13} />
            <Skeleton width="45%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  skeleton: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.96)",
    backgroundColor: "#E9EEF3",
  },
  shine: {
    position: "absolute",
    top: -24,
    bottom: -24,
    width: 68,
    backgroundColor: "rgba(255,255,255,0.86)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, width: "100%" },
  card: {
    flexGrow: 1,
    flexBasis: 150,
    maxWidth: "100%",
    minWidth: 0,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
  },
  body: { padding: 11, gap: 5 },
  list: { gap: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
