import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

/** Badge — used for status pills, sale tags, stock availability. */
export function Badge({
  label,
  tone = 'brand',
  style,
}: {
  label: string;
  tone?: 'brand' | 'success' | 'warning' | 'error' | 'neutral' | 'wine';
  style?: ViewStyle;
}) {
  const palette = {
    brand: { bg: tokens.color.brandLight, text: tokens.color.brandStrong },
    success: { bg: tokens.color.successLight, text: tokens.color.success },
    warning: { bg: tokens.color.warningLight, text: tokens.color.warning },
    error: { bg: tokens.color.errorLight, text: tokens.color.error },
    neutral: { bg: tokens.color.border, text: tokens.color.muted },
    wine: { bg: tokens.color.brandStrong, text: tokens.color.white },
  } as const;
  const p = palette[tone];
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: p.bg, borderColor: p.text }, style]}>
      <Text numberOfLines={1} style={[styles.badgeText, { color: p.text }]}>{label}</Text>
    </View>
  );
}

/** Chip — selectable filter pill. */
export function Chip({
  label,
  selected = false,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const content = <Text numberOfLines={1} style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>;

  if (!onPress) {
    return <View accessible accessibilityLabel={label} accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipSelected, style]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={selected ? 'Selected filter' : 'Applies this filter'}
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.chipPressed, style]}
    >
      {content}
    </Pressable>
  );
}

/** PriceDisplay — formats KSh prices with optional compare-at. */
export function PriceDisplay({ price, compareAt, size = 'md' }: { price: number; compareAt?: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const money = (value: number) => `KSh ${value.toLocaleString('en-KE')}`;
  const fontSize = size === 'lg' ? 20 : size === 'md' ? 14 : 12;
  const hasCompareAt = typeof compareAt === 'number' && compareAt > price;
  return (
    <View style={styles.priceRow}>
      <Text numberOfLines={1} style={[styles.price, { fontSize }]}>{money(price)}</Text>
      {hasCompareAt ? <Text numberOfLines={1} style={[styles.compareAt, { fontSize: Math.max(10, fontSize - 3) }]}>{money(compareAt)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', maxWidth: '100%', borderWidth: 1, borderRadius: tokens.radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.3 },
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 40,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: tokens.color.brandStrong, borderColor: tokens.color.brandStrong },
  chipPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  chipText: { flexShrink: 1, fontSize: 12, lineHeight: 16, color: tokens.color.muted, fontWeight: '700' },
  chipTextSelected: { color: tokens.color.white },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 5, rowGap: 1, minWidth: 0, maxWidth: '100%' },
  price: { flexShrink: 1, fontWeight: '900', color: tokens.color.brandStrong },
  compareAt: { flexShrink: 1, color: tokens.color.muted, textDecorationLine: 'line-through' },
});
