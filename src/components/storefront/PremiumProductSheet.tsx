import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { tokens } from '@/theme/tokens';
import type { StorefrontCarouselProduct } from './PremiumProductCarousel';

export type PremiumSheetProduct = StorefrontCarouselProduct & {
  /** Plain text or lightweight catalogue HTML. Markup is stripped before display. */
  description?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  onSale?: boolean;
  options?: Array<{ name: string; values: string[] }>;
};

export type PremiumProductSelection = {
  quantity: number;
  options: Record<string, string>;
  message: string;
};

export type PremiumProductSheetProps<
  TProduct extends PremiumSheetProduct = PremiumSheetProduct,
> = {
  visible: boolean;
  product: TProduct | null;
  relatedProducts: readonly TProduct[];
  loading?: boolean;
  onClose: () => void;
  onAddToBag: (product: TProduct, selection: PremiumProductSelection) => void;
  onRelatedProductPress: (product: TProduct) => void;
  addLabel?: string;
  bottomInset?: number;
  closeLabel?: string;
  descriptionTitle?: string;
  descriptionUnavailableLabel?: string;
  formatPrice?: (price: number) => string;
  loadingLabel?: string;
  priceUnavailableLabel?: string;
  relatedTitle?: string;
  unavailableLabel?: string;
  /**
   * Optional native glass layer. Return an absolutely positioned BlurView or
   * GlassView; the sheet clips it behind all interactive content.
   */
  renderGlassBackground?: () => ReactNode;
};

const defaultFormatPrice = (price: number) => `KSh ${price.toLocaleString('en-KE')}`;
const defaultOptionGroups = [
  { name: 'Size', values: ['1 Kg', '1.5 Kg', '2 Kg'] },
  { name: 'Flavor', values: ['Chocolate', 'Vanilla', 'Red Velvet'] },
];

function productName(product: PremiumSheetProduct) {
  return product.name.trim() || 'Product name unavailable';
}

function validPrice(price: number | null): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0;
}

function toPlainText(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function SheetImageFallback({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <View accessible accessibilityLabel={label} style={styles.imageFallback}>
      <View pointerEvents="none" style={[styles.fallbackMark, compact && styles.fallbackMarkCompact]}>
        <View style={styles.fallbackLineShort} />
        <View style={styles.fallbackLineLong} />
      </View>
      {!compact ? <Text style={styles.imageFallbackText}>Image unavailable</Text> : null}
    </View>
  );
}

function GlassSkeleton({
  label,
  opacity,
  bottomInset,
}: {
  label: string;
  opacity: Animated.Value;
  bottomInset: number;
}) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.loadingContent}>
      <Animated.View style={[styles.skeletonImage, { opacity }]} />
      <View style={styles.skeletonBody}>
        <Animated.View style={[styles.skeletonTitle, { opacity }]} />
        <Animated.View style={[styles.skeletonTitleShort, { opacity }]} />
        <Animated.View style={[styles.skeletonCopy, { opacity }]} />
        <Animated.View style={[styles.skeletonCopy, { opacity }]} />
        <Animated.View style={[styles.skeletonCopyShort, { opacity }]} />
      </View>
      <View style={[styles.skeletonFooter, { paddingBottom: Math.max(tokens.space.md, bottomInset) }]}>
        <Animated.View style={[styles.skeletonPrice, { opacity }]} />
        <Animated.View style={[styles.skeletonButton, { opacity }]} />
      </View>
    </View>
  );
}

export function PremiumProductSheet<
  TProduct extends PremiumSheetProduct,
>({
  visible,
  product,
  relatedProducts,
  loading = false,
  onClose,
  onAddToBag,
  onRelatedProductPress,
  addLabel = 'Add to Cart',
  bottomInset = 0,
  closeLabel = 'Close',
  descriptionTitle = 'Description',
  descriptionUnavailableLabel = 'Description unavailable.',
  formatPrice = defaultFormatPrice,
  loadingLabel = 'Loading product details',
  priceUnavailableLabel = 'Price unavailable',
  relatedTitle = 'Related products',
  unavailableLabel = 'Unavailable',
  renderGlassBackground,
}: PremiumProductSheetProps<TProduct>) {
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [cakeMessage, setCakeMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [favourite, setFavourite] = useState(false);
  const skeletonOpacity = useRef(new Animated.Value(0.52)).current;

  const sheetHeight = windowHeight;
  const description = useMemo(() => toPlainText(product?.description), [product?.description]);
  const filteredRelatedProducts = useMemo(() => relatedProducts.slice(0, 4), [relatedProducts]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        // Keep animations disabled when the platform preference cannot be read.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!loading || reduceMotionEnabled) {
      skeletonOpacity.stopAnimation();
      skeletonOpacity.setValue(0.58);
      return;
    }

    const animation = Animated.loop(Animated.sequence([
      Animated.timing(skeletonOpacity, { toValue: 0.9, duration: 850, useNativeDriver: true }),
      Animated.timing(skeletonOpacity, { toValue: 0.46, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [loading, reduceMotionEnabled, skeletonOpacity]);

  useEffect(() => {
    setMainImageFailed(false);
    const groups = (product?.options ?? []).filter(option => option.name && option.values.length);
    setSelectedOptions(Object.fromEntries((groups.length ? groups : defaultOptionGroups).map(option => [option.name, option.values[0] ?? ''])));
    setCakeMessage('');
    setQuantity(1);
    setFavourite(false);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, [product?.id, product?.image, visible]);

  useEffect(() => {
    if (visible && product && !loading) {
      AccessibilityInfo.announceForAccessibility(`${productName(product)} product details`);
    }
  }, [loading, product?.id, product?.name, visible]);

  const renderBackground = () => (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {renderGlassBackground ? renderGlassBackground() : <View style={styles.glassFallback} />}
      <View style={styles.glassHighlight} />
    </View>
  );

  const renderProduct = () => {
    if (!product) {
      return (
        <View accessible style={styles.unavailableContent}>
          <Text style={styles.unavailableTitle}>Product details unavailable</Text>
          <Text style={styles.unavailableCopy}>Close this panel and choose another product.</Text>
        </View>
      );
    }

    const name = productName(product);
    const price = product.price;
    const hasPrice = validPrice(price);
    const canAdd = hasPrice && product.available !== false;
    const priceLabel = hasPrice ? formatPrice(price) : priceUnavailableLabel;
    const imageUri = product.image?.trim() || null;
    const averageRating = typeof product.averageRating === 'number' && Number.isFinite(product.averageRating)
      ? product.averageRating
      : null;
    const reviewCount = typeof product.reviewCount === 'number' && Number.isInteger(product.reviewCount)
      ? Math.max(0, product.reviewCount)
      : 0;
    const isBestseller = (averageRating !== null && averageRating >= 4.5 && reviewCount >= 20)
      || /chocolate|fudge|black forest|red velvet/i.test(name);
    const optionGroups = (product.options ?? []).filter(option => option.name && option.values.length);
    const customizationGroups = optionGroups.length ? optionGroups : defaultOptionGroups;

    return (
      <>
        <ScrollView
          ref={scrollRef}
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainImageFrame}>
            {imageUri && !mainImageFailed ? (
              <Image
                accessibilityLabel={`${name} product image`}
                cachePolicy="memory-disk"
                contentFit="contain"
                contentPosition="center"
                onError={() => setMainImageFailed(true)}
                recyclingKey={`${String(product.id)}:${imageUri}`}
                source={{ uri: imageUri }}
                style={styles.mainImage}
                transition={reduceMotionEnabled ? 0 : 180}
              />
            ) : (
              <SheetImageFallback label={`${name} image unavailable`} />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favourite ? 'Remove from saved cakes' : 'Save this cake'}
              style={styles.favouriteButton}
              onPress={() => setFavourite(current => !current)}
            >
              <Ionicons name={favourite ? 'heart' : 'heart-outline'} size={19} color={tokens.color.brandStrong} />
            </Pressable>
            <View pointerEvents="none" style={styles.galleryDots}>
              {[0, 1, 2].map(index => (
                <View key={index} style={[styles.galleryDot, index === 0 && styles.galleryDotActive]} />
              ))}
            </View>
          </View>

          <View style={styles.detailBody}>
            {isBestseller || product.onSale || averageRating !== null ? (
              <View style={styles.detailMetaRow}>
                {isBestseller || product.onSale ? (
                  <View style={styles.bestsellerBadge}>
                    <Ionicons name={isBestseller ? 'star' : 'pricetag'} size={11} color="#F3A000" />
                    <Text style={styles.bestsellerText}>{isBestseller ? 'Bestseller' : 'Special offer'}</Text>
                  </View>
                ) : <View />}
                {averageRating !== null ? (
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={11} color="#F3A000" />
                    <Text style={styles.ratingText}>{averageRating.toFixed(1)}{reviewCount ? ` (${reviewCount} reviews)` : ''}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text accessibilityRole="header" style={styles.productName}>{name}</Text>
            <Text numberOfLines={1} style={[styles.detailPrice, !hasPrice && styles.footerPriceUnavailable]}>{priceLabel}</Text>

            {customizationGroups.map(option => (
              <View key={option.name}>
                <Text style={styles.optionLabel}>{option.name}</Text>
                <View style={styles.optionRow}>
                  {option.values.map(value => {
                    const selected = selectedOptions[option.name] === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[styles.optionChip, selected && styles.optionChipActive]}
                        onPress={() => setSelectedOptions(current => ({ ...current, [option.name]: value }))}
                      >
                        <Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{value}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text style={styles.optionLabel}>Add a Message (Optional)</Text>
            <TextInput
              accessibilityLabel="Message to write on the cake"
              maxLength={60}
              onChangeText={setCakeMessage}
              placeholder="Happy Birthday!"
              placeholderTextColor={tokens.color.mutedSoft}
              style={styles.messageInput}
              value={cakeMessage}
            />

            <View style={styles.deliveryNote}>
              <View style={styles.deliveryIcon}><Ionicons name="time-outline" size={16} color={tokens.color.brandStrong} /></View>
              <View style={styles.deliveryCopy}>
                <Text style={styles.deliveryTitle}>Next day delivery available</Text>
                <Text style={styles.deliveryText}>Order within 3 hours for earliest delivery</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={tokens.color.mutedSoft} />
            </View>

            <View style={styles.descriptionBlock}>
              <Text style={styles.descriptionTitle}>{descriptionTitle}</Text>
              <Text numberOfLines={4} style={[styles.description, !description && styles.descriptionUnavailable]}>{description || descriptionUnavailableLabel}</Text>
            </View>

            {filteredRelatedProducts.length ? (
              <View style={styles.relatedSection}>
                <Text style={styles.sectionTitle}>{relatedTitle}</Text>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relatedRail}
                >
                  {filteredRelatedProducts.map(related => {
                    const relatedName = productName(related);
                    const relatedPrice = related.price;
                    const hasRelatedPrice = validPrice(relatedPrice);
                    const relatedPriceLabel = hasRelatedPrice ? formatPrice(relatedPrice) : priceUnavailableLabel;
                    const relatedImageUri = related.image?.trim() || null;
                    const imageKey = `${String(related.id)}:${relatedImageUri ?? ''}`;

                    return (
                      <Pressable
                        key={String(related.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${relatedName}, ${relatedPriceLabel}`}
                        accessibilityHint="Opens these product details"
                        onPress={() => onRelatedProductPress(related)}
                        style={({ pressed }) => [styles.relatedCard, pressed && styles.relatedCardPressed]}
                      >
                        <View style={styles.relatedImageFrame}>
                          {relatedImageUri ? (
                            <Image
                              accessible={false}
                              cachePolicy="memory-disk"
                              contentFit="contain"
                              contentPosition="center"
                              recyclingKey={imageKey}
                              source={{ uri: relatedImageUri }}
                              style={styles.relatedImage}
                              transition={reduceMotionEnabled ? 0 : 140}
                            />
                          ) : (
                            <SheetImageFallback compact label={`${relatedName} image unavailable`} />
                          )}
                        </View>
                        <View style={styles.relatedBody}>
                          <Text numberOfLines={2} style={styles.relatedName}>{relatedName}</Text>
                          <Text
                            numberOfLines={1}
                            style={[styles.relatedPrice, !hasRelatedPrice && styles.relatedPriceUnavailable]}
                          >
                            {relatedPriceLabel}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.purchaseFooter, { paddingBottom: Math.max(tokens.space.md, bottomInset) }]}>
          <View style={styles.quantityPicker}>
            <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" style={styles.quantityButton} onPress={() => setQuantity(current => Math.max(1, current - 1))}>
              <Ionicons name="remove" size={16} color={tokens.color.ink} />
            </Pressable>
            <Text style={styles.quantityText}>{quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" style={styles.quantityButton} onPress={() => setQuantity(current => Math.min(9, current + 1))}>
              <Ionicons name="add" size={16} color={tokens.color.ink} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={canAdd
              ? `${addLabel}: ${name}, ${priceLabel}`
              : `${name} ${unavailableLabel.toLocaleLowerCase()}`}
            accessibilityHint={canAdd ? 'Adds this product to the shopping bag' : undefined}
            accessibilityState={{ disabled: !canAdd }}
            disabled={!canAdd}
            onPress={() => onAddToBag(product, {
              quantity,
              options: selectedOptions,
              message: cakeMessage.trim(),
            })}
            style={({ pressed }) => [
              styles.addButton,
              !canAdd && styles.addButtonDisabled,
              pressed && canAdd && styles.addButtonPressed,
            ]}
          >
            <Ionicons name="bag-handle" size={16} color={tokens.color.white} />
            <Text numberOfLines={1} style={[styles.addButtonText, !canAdd && styles.addButtonTextDisabled]}>
              {canAdd ? addLabel : unavailableLabel}
            </Text>
          </Pressable>
        </View>
      </>
    );
  };

  return (
    <Modal
      animationType={reduceMotionEnabled ? 'none' : 'slide'}
      navigationBarTranslucent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close product details"
          onPress={onClose}
          style={styles.scrim}
        />
        <View style={[styles.sheetShadow, { height: sheetHeight }]}>
          <View accessibilityViewIsModal style={styles.sheet}>
            {renderBackground()}
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                hitSlop={4}
                onPress={onClose}
                style={({ pressed }) => [styles.backButton, pressed && styles.closeButtonPressed]}
              >
                <Ionicons name="arrow-back" size={20} color={tokens.color.ink} />
              </Pressable>
              <Text style={styles.sheetTitle}>Product Details</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                hitSlop={4}
                onPress={onClose}
                style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
              >
                <Ionicons name="close" size={20} color={tokens.color.ink} />
              </Pressable>
            </View>
            {loading
              ? <GlassSkeleton bottomInset={bottomInset} label={loadingLabel} opacity={skeletonOpacity} />
              : renderProduct()}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(31, 19, 25, 0.42)' },
  sheetShadow: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    shadowColor: '#1F1319',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 18,
  },
  sheet: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: tokens.color.surface,
  },
  glassFallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.91)' : 'rgba(255,255,255,0.97)',
  },
  glassHighlight: {
    position: 'absolute',
    left: 26,
    right: 26,
    top: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  sheetHeader: {
    zIndex: 2,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(228,194,211,0.72)',
  },
  sheetTitle: { color: tokens.color.ink, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  backButton: { position: 'absolute', left: 9, width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  closeButton: {
    position: 'absolute',
    right: 10,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  closeButtonPressed: { backgroundColor: tokens.color.brandLight },
  scrollContent: { paddingBottom: 20 },
  mainImageFrame: {
    position: 'relative',
    height: 292,
    overflow: 'hidden',
    padding: 10,
    backgroundColor: '#FADCE7',
  },
  mainImage: { width: '100%', height: '100%' },
  favouriteButton: { position: 'absolute', right: 14, top: 14, width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFFE8', borderWidth: 1, borderColor: '#FFFFFF' },
  galleryDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  galleryDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFFAA',
  },
  galleryDotActive: {
    width: 16,
    backgroundColor: tokens.color.brandStrong,
  },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageFallbackText: { marginTop: 8, fontSize: 11, lineHeight: 15, fontWeight: '700', color: tokens.color.muted },
  fallbackMark: { width: 58, height: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: tokens.color.borderStrong, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.68)' },
  fallbackMarkCompact: { width: 38, height: 30, borderRadius: 10 },
  fallbackLineShort: { width: '35%', height: 3, borderRadius: 2, backgroundColor: tokens.color.brand },
  fallbackLineLong: { width: '58%', height: 3, marginTop: 5, borderRadius: 2, backgroundColor: tokens.color.borderStrong },
  detailBody: { paddingHorizontal: 16, paddingTop: 13 },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bestsellerBadge: { minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#FFF2D4' },
  bestsellerText: { color: '#9A6000', fontSize: 9, lineHeight: 12, fontWeight: '900' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: tokens.color.muted, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  productName: { maxWidth: 320, marginTop: 9, fontSize: 19, lineHeight: 23, fontWeight: '900', letterSpacing: 0, color: tokens.color.ink },
  detailPrice: { marginTop: 4, color: tokens.color.brandStrong, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  optionLabel: { marginTop: 14, marginBottom: 7, color: tokens.color.ink, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionChip: { minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.borderStrong, backgroundColor: tokens.color.surface },
  optionChipActive: { borderColor: tokens.color.brandStrong, backgroundColor: tokens.color.brandLight },
  optionChipText: { color: tokens.color.muted, fontSize: 9.5, lineHeight: 12, fontWeight: '700' },
  optionChipTextActive: { color: tokens.color.brandStrong, fontWeight: '900' },
  messageInput: { height: 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, color: tokens.color.ink, fontSize: 10.5 },
  deliveryNote: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: tokens.color.border },
  deliveryIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: tokens.color.brandLight },
  deliveryCopy: { flex: 1, minWidth: 0 },
  deliveryTitle: { color: tokens.color.ink, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  deliveryText: { marginTop: 2, color: tokens.color.muted, fontSize: 9, lineHeight: 12 },
  descriptionBlock: { marginTop: 13 },
  descriptionTitle: { color: tokens.color.ink, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  descriptionHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.md, marginTop: tokens.space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.border },
  descriptionHeaderPressed: { backgroundColor: 'rgba(253,230,243,0.58)' },
  descriptionControl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontWeight: '900', color: tokens.color.ink },
  textButton: { fontSize: 11.5, lineHeight: 16, fontWeight: '900', color: tokens.color.brandStrong },
  textButtonDisabled: { color: tokens.color.mutedSoft },
  description: { paddingTop: 6, fontSize: 10, lineHeight: 15, color: tokens.color.muted },
  descriptionUnavailable: { fontStyle: 'italic', color: tokens.color.mutedSoft },
  relatedSection: { marginTop: 18 },
  relatedRail: { gap: 10, paddingTop: 10, paddingRight: tokens.space.lg, paddingBottom: 4 },
  relatedCard: {
    width: 132,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
  },
  relatedCardPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  relatedImageFrame: { height: 92, backgroundColor: tokens.color.surfaceTint },
  relatedImage: { width: '100%', height: '100%' },
  relatedBody: { minHeight: 76, padding: 9 },
  relatedName: { minHeight: 34, fontSize: 11.5, lineHeight: 16, fontWeight: '800', color: tokens.color.ink },
  relatedPrice: { marginTop: 5, fontSize: 11.5, lineHeight: 16, fontWeight: '900', color: tokens.color.brandStrong },
  relatedPriceUnavailable: { fontSize: 10, color: tokens.color.muted },
  purchaseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 72,
    paddingTop: 10,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(228,194,211,0.86)',
    backgroundColor: tokens.color.surface,
  },
  quantityPicker: { height: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: tokens.color.border, borderRadius: 10, overflow: 'hidden', backgroundColor: tokens.color.surface },
  quantityButton: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  quantityText: { minWidth: 24, textAlign: 'center', color: tokens.color.ink, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  footerPriceBlock: { flex: 1, minWidth: 0 },
  footerPriceCaption: { fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: tokens.color.muted },
  footerPrice: { marginTop: 2, fontSize: 17, lineHeight: 22, fontWeight: '900', color: tokens.color.brandStrong },
  footerPriceUnavailable: { fontSize: 11.5, lineHeight: 17, color: tokens.color.muted },
  addButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    maxWidth: 240,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    paddingHorizontal: tokens.space.lg,
    borderWidth: 1,
    borderColor: tokens.color.brandDark,
    borderRadius: 10,
    backgroundColor: tokens.color.brandStrong,
  },
  addButtonDisabled: { borderColor: tokens.color.borderStrong, backgroundColor: tokens.color.brandLight },
  addButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  addButtonText: { fontSize: 13, lineHeight: 17, fontWeight: '900', color: tokens.color.white },
  addButtonTextDisabled: { color: tokens.color.muted },
  unavailableContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.space.xl },
  unavailableTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900', color: tokens.color.ink, textAlign: 'center' },
  unavailableCopy: { maxWidth: 270, marginTop: tokens.space.xs, fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, textAlign: 'center' },
  loadingContent: { flex: 1 },
  skeletonImage: { height: 188, marginHorizontal: tokens.space.lg, marginTop: tokens.space.md, borderRadius: tokens.radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)', backgroundColor: tokens.color.brandLight },
  skeletonBody: { flex: 1, paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg },
  skeletonTitle: { width: '78%', height: 20, borderRadius: 10, backgroundColor: tokens.color.borderStrong },
  skeletonTitleShort: { width: '48%', height: 20, marginTop: 8, borderRadius: 10, backgroundColor: tokens.color.border },
  skeletonCopy: { width: '100%', height: 11, marginTop: 22, borderRadius: 6, backgroundColor: tokens.color.border },
  skeletonCopyShort: { width: '62%', height: 11, marginTop: 8, borderRadius: 6, backgroundColor: tokens.color.border },
  skeletonFooter: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, paddingTop: tokens.space.md, paddingHorizontal: tokens.space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.color.border },
  skeletonPrice: { flex: 1, height: 22, borderRadius: 11, backgroundColor: tokens.color.border },
  skeletonButton: { width: 126, height: 50, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.brandLight },
});
