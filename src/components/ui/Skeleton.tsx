import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export function Skeleton({ width = '100%', height = 14, radius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessible={false}
      style={[
        { width, height, borderRadius: radius, backgroundColor: tokens.color.border, opacity },
        style,
      ]}
    />
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading products" accessibilityState={{ busy: true }} style={styles.grid}>
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
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={styles.list}>
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

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  card: {
    flexGrow: 1,
    flexBasis: 150,
    maxWidth: '100%',
    minWidth: 0,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  body: { padding: 11, gap: 5 },
  list: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
