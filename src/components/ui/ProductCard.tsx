import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export type ProductSummary = {
  id: string | number;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  badge?: string | null;
  rating?: number | null;
};

type Props = {
  product: ProductSummary;
  onPress: (product: ProductSummary) => void;
  onAddToCart: (product: ProductSummary) => void;
  variant?: 'grid' | 'rail';
};

const money = (value: number) => `KSh ${value.toLocaleString('en-KE')}`;

export function ProductCard({ product, onPress, onAddToCart, variant = 'grid' }: Props) {
  const isRail = variant === 'rail';
  const compareAtPrice = typeof product.compareAtPrice === 'number' && product.compareAtPrice > product.price
    ? product.compareAtPrice
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${money(product.price)}`}
      accessibilityHint="Opens product details"
      style={({ pressed }) => [styles.card, isRail && styles.railCard, pressed && styles.pressed]}
      onPress={() => onPress(product)}
    >
      <View style={[styles.imageWrap, isRail && styles.railImageWrap]}>
        {product.image ? (
          <Image
            accessible={false}
            source={{ uri: product.image }}
            style={styles.image}
            contentFit="contain"
            contentPosition="center"
            transition={150}
          />
        ) : (
          <View accessible={false} style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={tokens.color.muted} />
          </View>
        )}
        {product.badge ? <View style={styles.badge}><Text numberOfLines={1} style={styles.badgeText}>{product.badge}</Text></View> : null}
        {compareAtPrice !== null ? (
          <View style={styles.discountBadge}><Text numberOfLines={1} style={styles.discountText}>SAVE {money(compareAtPrice - product.price)}</Text></View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
        {typeof product.rating === 'number' && product.rating > 0 ? (
          <View style={styles.ratingRow}>
            <Ionicons accessible={false} name="star" size={11} color={tokens.color.warning} />
            <Text style={styles.rating}>{product.rating.toFixed(1)}</Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <View style={styles.priceBlock}>
            <Text numberOfLines={1} style={styles.price}>{money(product.price)}</Text>
            {compareAtPrice !== null ? <Text numberOfLines={1} style={styles.compareAt}>{money(compareAtPrice)}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} to bag`}
            accessibilityHint="Adds this product to the shopping bag"
            hitSlop={4}
            style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
            onPress={(event) => {
              event.stopPropagation();
              onAddToCart(product);
            }}
          >
            <Ionicons accessible={false} name="add" size={20} color={tokens.color.white} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    minWidth: 0,
    flexShrink: 1,
    ...tokens.shadow.card,
  },
  railCard: { width: 164 },
  pressed: { opacity: 0.9, borderColor: tokens.color.brandStrong, transform: [{ scale: 0.99 }] },
  imageWrap: {
    position: 'relative',
    height: 148,
    overflow: 'hidden',
    backgroundColor: tokens.color.brandLight,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  railImageWrap: { height: 132 },
  image: { width: '100%', height: '100%', backgroundColor: tokens.color.brandLight },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandLight },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    maxWidth: '72%',
    backgroundColor: tokens.color.white,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  badgeText: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: tokens.color.brandStrong, letterSpacing: 0.4 },
  discountBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    maxWidth: '82%',
    backgroundColor: tokens.color.brandStrong,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
  },
  discountText: { fontSize: 9, lineHeight: 12, fontWeight: '900', color: tokens.color.white },
  body: { padding: 11, minWidth: 0 },
  name: { fontSize: 13, lineHeight: 18, minHeight: 36, fontWeight: '700', color: tokens.color.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  rating: { fontSize: 11, lineHeight: 14, color: tokens.color.muted, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, minWidth: 0 },
  priceBlock: { flex: 1, minWidth: 0, gap: 1 },
  price: { fontSize: 14, lineHeight: 18, fontWeight: '900', color: tokens.color.brandStrong },
  compareAt: { fontSize: 11, lineHeight: 14, color: tokens.color.muted, textDecorationLine: 'line-through' },
  add: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.brandStrong,
    borderWidth: 1,
    borderColor: tokens.color.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addPressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});
