import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { tokens } from '@/theme/tokens';

export type StorefrontCarouselProduct = {
  id: string | number;
  name: string;
  price: number | null;
  image?: string | null;
  available?: boolean;
};

export type PremiumProductCarouselProps<
  TProduct extends StorefrontCarouselProduct = StorefrontCarouselProduct,
> = {
  /** Products already returned by the catalogue. The component never supplies fallback products. */
  products: readonly TProduct[];
  onAddToBag: (product: TProduct) => void;
  onProductPress?: (product: TProduct) => void;
  /** Auto-advance is off by default and is always disabled when reduced motion is enabled. */
  autoAdvanceIntervalMs?: number;
  accessibilityLabel?: string;
  addLabel?: string;
  emptyMessage?: string;
  formatPrice?: (price: number) => string;
  priceUnavailableLabel?: string;
  unavailableLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const minimumAutoAdvanceInterval = 4_500;

const defaultFormatPrice = (price: number) => `KSh ${price.toLocaleString('en-KE')}`;

function productName(product: StorefrontCarouselProduct) {
  return product.name.trim() || 'Product name unavailable';
}

function validPrice(price: number | null): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0;
}

function MissingImage({ name }: { name: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${name} image unavailable`}
      style={styles.missingImage}
    >
      <View pointerEvents="none" style={styles.cakeMark}>
        <View style={styles.candle} />
        <View style={styles.cakeTop} />
        <View style={styles.cakeBase} />
        <View style={styles.cakePlate} />
      </View>
      <Text style={styles.missingImageText}>Image unavailable</Text>
    </View>
  );
}

export function PremiumProductCarousel<
  TProduct extends StorefrontCarouselProduct,
>({
  products,
  onAddToBag,
  onProductPress,
  autoAdvanceIntervalMs,
  accessibilityLabel = 'Featured products',
  addLabel = 'Add to bag',
  emptyMessage = 'Products are unavailable right now.',
  formatPrice = defaultFormatPrice,
  priceUnavailableLabel = 'Price unavailable',
  unavailableLabel = 'Unavailable',
  style,
}: PremiumProductCarouselProps<TProduct>) {
  const listRef = useRef<FlatList<TProduct>>(null);
  const laidOutPageWidth = useRef(0);
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);

  const pageWidth = measuredWidth || Math.max(280, windowWidth - (tokens.space.lg * 2));
  const hasAutoAdvance = typeof autoAdvanceIntervalMs === 'number' && autoAdvanceIntervalMs > 0;
  const shouldAutoAdvance = hasAutoAdvance && !reduceMotionEnabled && !autoAdvancePaused && products.length > 1;

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        // Keep motion reduced when the platform preference cannot be read.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!products.length) {
      setActiveIndex(0);
      return;
    }

    if (activeIndex >= products.length) {
      const nextIndex = products.length - 1;
      setActiveIndex(nextIndex);
      listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
    }
  }, [activeIndex, pageWidth, products.length]);

  useEffect(() => {
    if (!measuredWidth || !products.length) return;
    if (laidOutPageWidth.current === pageWidth) return;
    laidOutPageWidth.current = pageWidth;
    listRef.current?.scrollToOffset({ offset: activeIndex * pageWidth, animated: false });
  }, [activeIndex, measuredWidth, pageWidth, products.length]);

  const goToIndex = useCallback((index: number, animated = !reduceMotionEnabled) => {
    if (!products.length) return;
    const nextIndex = Math.max(0, Math.min(index, products.length - 1));
    setActiveIndex(nextIndex);
    listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated });
  }, [pageWidth, products.length, reduceMotionEnabled]);

  useEffect(() => {
    if (!shouldAutoAdvance) return;

    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % products.length;
      goToIndex(nextIndex, true);
    }, Math.max(autoAdvanceIntervalMs ?? 0, minimumAutoAdvanceInterval));

    return () => clearInterval(interval);
  }, [activeIndex, autoAdvanceIntervalMs, goToIndex, products.length, shouldAutoAdvance]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth > 0 && nextWidth !== measuredWidth) setMeasuredWidth(nextWidth);
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    const nextIndex = Math.max(
      0,
      Math.min(Math.round(event.nativeEvent.contentOffset.x / pageWidth), products.length - 1),
    );
    setActiveIndex(nextIndex);
  };

  const markImageFailed = (key: string) => {
    setFailedImages(current => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  if (!products.length) {
    return (
      <View
        accessible
        accessibilityLabel={emptyMessage}
        style={[styles.emptyState, style]}
      >
        <Text style={styles.emptyTitle}>Nothing to show yet</Text>
        <Text style={styles.emptyCopy}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View
      onLayout={handleLayout}
      style={[styles.container, style]}
    >
      <FlatList
        ref={listRef}
        accessibilityLabel={accessibilityLabel}
        horizontal
        pagingEnabled
        bounces={false}
        data={products}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
        initialNumToRender={2}
        keyExtractor={product => String(product.id)}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={() => {
          if (hasAutoAdvance) setAutoAdvancePaused(true);
        }}
        renderItem={({ item }) => {
          const name = productName(item);
          const imageUri = item.image?.trim() || null;
          const imageKey = `${String(item.id)}:${imageUri ?? ''}`;
          const price = item.price;
          const hasPrice = validPrice(price);
          const canAdd = hasPrice && item.available !== false;
          const priceLabel = hasPrice ? formatPrice(price) : priceUnavailableLabel;
          const buttonLabel = canAdd ? addLabel : unavailableLabel;

          const media = imageUri && !failedImages.has(imageKey) ? (
            <Image
              accessibilityLabel={`${name} product image`}
              cachePolicy="memory-disk"
              contentFit="contain"
              contentPosition="center"
              onError={() => markImageFailed(imageKey)}
              recyclingKey={imageKey}
              source={{ uri: imageUri }}
              style={styles.image}
              transition={reduceMotionEnabled ? 0 : 180}
            />
          ) : (
            <MissingImage name={name} />
          );

          return (
            <View style={[styles.page, { width: pageWidth }]}>
              <View style={styles.cardShadow}>
                <View style={styles.card}>
                  <View style={styles.mediaFrame}>
                    <View pointerEvents="none" style={styles.mediaGlowLarge} />
                    <View pointerEvents="none" style={styles.mediaGlowSmall} />
                    {onProductPress ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View ${name}`}
                        accessibilityHint="Opens product details"
                        onPress={() => onProductPress(item)}
                        style={({ pressed }) => [styles.mediaPressable, pressed && styles.mediaPressed]}
                      >
                        {media}
                      </Pressable>
                    ) : media}
                  </View>

                  <View style={styles.productBody}>
                    <Text numberOfLines={2} style={styles.productName}>{name}</Text>
                    <View style={styles.purchaseRow}>
                      <View style={styles.priceBlock}>
                        <Text style={styles.priceCaption}>Price</Text>
                        <Text
                          numberOfLines={1}
                          style={[styles.price, !hasPrice && styles.priceUnavailable]}
                        >
                          {priceLabel}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={canAdd
                          ? `${addLabel}: ${name}, ${priceLabel}`
                          : `${name} ${unavailableLabel.toLocaleLowerCase()}`}
                        accessibilityHint={canAdd ? 'Adds this product to the shopping bag' : undefined}
                        accessibilityState={{ disabled: !canAdd }}
                        disabled={!canAdd}
                        onPress={() => onAddToBag(item)}
                        style={({ pressed }) => [
                          styles.addButton,
                          !canAdd && styles.addButtonDisabled,
                          pressed && canAdd && styles.addButtonPressed,
                        ]}
                      >
                        <Text numberOfLines={1} style={[styles.addButtonText, !canAdd && styles.addButtonTextDisabled]}>
                          {buttonLabel}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        scrollEnabled={products.length > 1}
        showsHorizontalScrollIndicator={false}
        style={{ width: pageWidth }}
      />

      {products.length > 1 ? (
        <View style={styles.controls}>
          <View style={styles.dots}>
            {products.map((product, index) => {
              const selected = activeIndex === index;
              return (
                <Pressable
                  key={String(product.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${productName(product)}, ${index + 1} of ${products.length}`}
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  onPress={() => goToIndex(index)}
                  style={styles.dotTarget}
                >
                  <View style={[styles.dot, selected && styles.dotActive]} />
                </Pressable>
              );
            })}
          </View>
          {hasAutoAdvance && !reduceMotionEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={autoAdvancePaused ? 'Resume carousel rotation' : 'Pause carousel rotation'}
              hitSlop={5}
              onPress={() => setAutoAdvancePaused(current => !current)}
              style={({ pressed }) => [styles.motionControl, pressed && styles.motionControlPressed]}
            >
              <Text style={styles.motionControlText}>{autoAdvancePaused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', minWidth: 0 },
  page: { paddingHorizontal: 1, paddingVertical: 3 },
  cardShadow: { borderRadius: tokens.radius.xl, ...tokens.shadow.floating },
  card: {
    overflow: 'hidden',
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  mediaFrame: {
    position: 'relative',
    height: 230,
    overflow: 'hidden',
    backgroundColor: tokens.color.surfaceTint,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  mediaGlowLarge: {
    position: 'absolute',
    width: 238,
    height: 238,
    right: -54,
    top: -92,
    borderRadius: 119,
    backgroundColor: tokens.color.accentLight,
  },
  mediaGlowSmall: {
    position: 'absolute',
    width: 126,
    height: 126,
    left: -43,
    bottom: -55,
    borderRadius: 63,
    backgroundColor: tokens.color.brandLight,
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
  },
  mediaPressable: { flex: 1 },
  mediaPressed: { opacity: 0.88 },
  image: { width: '100%', height: '100%' },
  missingImage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingImageText: { marginTop: 11, fontSize: 11.5, lineHeight: 16, fontWeight: '700', color: tokens.color.muted },
  cakeMark: { width: 72, height: 68, alignItems: 'center', justifyContent: 'flex-end' },
  candle: { width: 4, height: 14, borderRadius: 2, backgroundColor: tokens.color.accentStrong, marginBottom: 2 },
  cakeTop: { width: 47, height: 17, borderRadius: 9, backgroundColor: tokens.color.brand, borderWidth: 2, borderColor: tokens.color.white },
  cakeBase: { width: 62, height: 24, borderRadius: 9, marginTop: -3, backgroundColor: tokens.color.brandStrong, borderWidth: 2, borderColor: tokens.color.white },
  cakePlate: { width: 70, height: 3, borderRadius: 2, marginTop: 3, backgroundColor: tokens.color.cocoa },
  productBody: { padding: tokens.space.lg },
  productName: { minHeight: 48, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.35, color: tokens.color.ink },
  purchaseRow: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.space.md, marginTop: tokens.space.md, minWidth: 0 },
  priceBlock: { flex: 1, minWidth: 0 },
  priceCaption: { marginBottom: 2, fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: tokens.color.muted },
  price: { fontSize: 18, lineHeight: 23, fontWeight: '900', color: tokens.color.brandStrong },
  priceUnavailable: { fontSize: 12, lineHeight: 18, color: tokens.color.muted },
  addButton: {
    minWidth: 108,
    minHeight: 48,
    maxWidth: 142,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.brandDark,
    backgroundColor: tokens.color.brandStrong,
  },
  addButtonDisabled: { borderColor: tokens.color.borderStrong, backgroundColor: tokens.color.brandLight },
  addButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  addButtonText: { fontSize: 12.5, lineHeight: 17, fontWeight: '900', color: tokens.color.white },
  addButtonTextDisabled: { color: tokens.color.muted },
  controls: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.sm, marginTop: tokens.space.sm },
  dots: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' },
  dotTarget: { width: 24, height: 40, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.color.borderStrong },
  dotActive: { width: 20, backgroundColor: tokens.color.brandStrong },
  motionControl: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  motionControlPressed: { opacity: 0.65 },
  motionControlText: { fontSize: 11, lineHeight: 15, fontWeight: '800', color: tokens.color.brandStrong },
  emptyState: {
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', color: tokens.color.ink, textAlign: 'center' },
  emptyCopy: { maxWidth: 270, marginTop: tokens.space.xs, fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, textAlign: 'center' },
});
