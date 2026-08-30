import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { accountCommerceApi } from '@/api/account-commerce';
import { isApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AuroraBackdrop } from '@/components/storefront/AuroraBackdrop';
import { FuturisticTabBar } from '@/components/storefront/FuturisticTabBar';
import { GlassSurface } from '@/components/storefront/GlassSurface';
import { OrdersPanel } from '@/components/storefront/OrdersPanel';
import type { OrdersPanelContent } from '@/components/storefront/OrdersPanel';
import type { StorefrontCarouselProduct } from '@/components/storefront/PremiumProductCarousel';
import { PremiumProductSheet } from '@/components/storefront/PremiumProductSheet';
import type { PremiumProductSelection } from '@/components/storefront/PremiumProductSheet';
import { RewardsPanel } from '@/components/storefront/RewardsPanel';
import type { RewardsPanelContent } from '@/components/storefront/RewardsPanel';
import { startCakeCityOrderActivity } from '@/native/live-activities';
import { tokens } from '@/theme/tokens';

type Tab = 'home' | 'shop' | 'orders' | 'rewards' | 'account';
type ShopView = 'categories' | 'cakes';
type CatalogueStatus = 'loading' | 'ready' | 'empty' | 'unavailable';
type IconName = keyof typeof Ionicons.glyphMap;

type Product = StorefrontCarouselProduct & {
  id: number;
  slug: string;
  image: string;
  description: string;
  shortDescription: string;
  categories: string[];
  onSale: boolean;
  available: boolean;
  averageRating: number | null;
  reviewCount: number;
  options: Array<{ name: string; values: string[] }>;
};

type CartLine = Product & {
  lineKey: string;
  quantity: number;
  selectedOptions: Record<string, string>;
  message: string;
};

type StoreProduct = {
  id?: number;
  slug?: string;
  name?: string;
  description?: string;
  short_description?: string;
  on_sale?: boolean;
  is_in_stock?: boolean;
  is_purchasable?: boolean;
  average_rating?: string;
  review_count?: number;
  prices?: { price?: string; currency_minor_unit?: number };
  images?: Array<{ src?: string }>;
  categories?: Array<{ id?: number; name?: string; slug?: string }>;
  attributes?: Array<{ name?: string; terms?: Array<{ name?: string }> }>;
};

type StoreCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  parent: number;
};

const PAGE_SIZE = 100;
const STORE_API = 'https://cakecity.co.ke/wp-json/wc/store/v1/products';
const STORE_CATEGORY_API = 'https://cakecity.co.ke/wp-json/wc/store/v1/products/categories';
const PARTY_ACCESSORIES_CATEGORY_ID = 109;
const BAG_STORAGE_KEY = 'cakecity.shopping-bag.v1';

const tabs: Array<{ id: Tab; label: string; icon: IconName; selectedIcon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'home-outline', selectedIcon: 'home' },
  { id: 'shop', label: 'Categories', icon: 'grid-outline', selectedIcon: 'grid' },
  { id: 'orders', label: 'Orders', icon: 'receipt-outline', selectedIcon: 'receipt' },
  { id: 'rewards', label: 'Loyalty', icon: 'gift-outline', selectedIcon: 'gift' },
  { id: 'account', label: 'Profile', icon: 'person-outline', selectedIcon: 'person' },
];

const previewOrders: OrdersPanelContent = {
  status: 'ready',
  orders: [
    {
      reference: 'PREVIEW-CC10293',
      status: 'baking',
      total: 4350,
      currency: 'KES',
      placedAt: '2026-08-21T09:30:00+03:00',
      fulfillment: 'Delivery',
      deliverySlot: '2026-08-21T15:00:00+03:00',
      itemSummary: 'Chocolate fudge cake, birthday candles, cake topper, and balloon set',
      cakeName: 'Chocolate Fudge Delight',
      cakeSize: '1 Kg',
      imageUrl: 'https://cakecity.co.ke/wp-content/uploads/2025/08/Chocolate-fudge-Photoroom.avif',
      branchName: 'Athi River Branch',
    },
    {
      reference: 'PREVIEW-CC10241',
      status: 'delivered',
      total: 2850,
      currency: 'KES',
      placedAt: '2026-08-12T11:20:00+03:00',
      fulfillment: 'Pickup',
      itemSummary: 'Vanilla celebration cake and assorted cupcakes',
      cakeName: 'Red Velvet Dream',
      cakeSize: '1.5 Kg',
      imageUrl: 'https://cakecity.co.ke/wp-content/uploads/2025/08/Black-forest-Photoroom.avif',
      branchName: 'Athi River Branch',
    },
  ],
};

const previewRewards: RewardsPanelContent = {
  status: 'ready',
  account: {
    pointsBalance: 2450,
    lifetimePoints: 10880,
    tier: 'gold',
    wallet: { balance: 500, currency: 'KES' },
    nextTier: { name: 'platinum', spendRequired: 5200, currency: 'KES' },
    benefits: [
      'Birthday reward preview',
      'Priority celebration support preview',
      'Early access offer preview',
    ],
  },
  rewards: [
    {
      id: 'preview-free-delivery',
      name: 'Free delivery preview',
      description: 'Shows how a real delivery reward will appear once the API provides offers.',
      pointsCost: 2000,
    },
    {
      id: 'preview-cupcakes',
      name: 'Cupcake treat preview',
      description: 'A labelled sample redemption card for visual QA.',
      pointsCost: 1500,
    },
  ],
};

const catalogueFilters = [
  { id: 'all', label: 'All' },
  { id: 'birthday', label: 'Birthday' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'kids', label: 'Kids' },
  { id: 'chocolate', label: 'Chocolate' },
  { id: 'cupcakes', label: 'Cupcakes' },
  { id: 'pastries', label: 'Pastries' },
  { id: 'party', label: 'Party Items' },
  { id: 'offers', label: 'Offers' },
] as const;

type CatalogueFilter = (typeof catalogueFilters)[number]['id'];

const money = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return 'Price unavailable';
  return `KSh ${value.toLocaleString('en-KE')}`;
};

const decodeProductText = (value: string) => value
  .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#039;|&apos;/g, "'")
  .replace(/&hellip;/g, '…')
  .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/\s+/g, ' ')
  .trim();

const mapStoreProducts = (items: StoreProduct[]): Product[] => items.reduce<Product[]>((catalogue, item) => {
  if (!Number.isInteger(item.id) || typeof item.name !== 'string' || !item.name.trim()) return catalogue;

  const rawPrice = item.prices?.price;
  const minorUnit = Number(item.prices?.currency_minor_unit);
  const parsedPrice = rawPrice === undefined || rawPrice === '' ? Number.NaN : Number(rawPrice);
  const price = Number.isFinite(parsedPrice) && Number.isFinite(minorUnit)
    ? parsedPrice / 10 ** minorUnit
    : null;

  const description = decodeProductText(item.description ?? '');
  const shortDescription = decodeProductText(item.short_description ?? '');

  const categories = (item.categories ?? [])
    .map(category => category.name ?? category.slug ?? '')
    .filter((category): category is string => Boolean(category));
  const averageRating = Number(item.average_rating);

  catalogue.push({
    id: item.id as number,
    slug: typeof item.slug === 'string' ? item.slug : String(item.id),
    name: decodeProductText(item.name),
    price,
    image: item.images?.find(candidate => Boolean(candidate.src))?.src ?? '',
    description: description || shortDescription,
    shortDescription,
    categories,
    onSale: item.on_sale === true,
    available: item.is_in_stock !== false && item.is_purchasable !== false,
    averageRating: Number.isFinite(averageRating) && averageRating > 0 ? averageRating : null,
    reviewCount: Number.isInteger(item.review_count) && (item.review_count ?? 0) > 0 ? item.review_count as number : 0,
    options: (item.attributes ?? []).reduce<Array<{ name: string; values: string[] }>>((groups, attribute) => {
      if (typeof attribute.name !== 'string') return groups;
      const values = (attribute.terms ?? [])
        .map(term => typeof term.name === 'string' ? decodeProductText(term.name) : '')
        .filter(Boolean);
      if (values.length) groups.push({ name: decodeProductText(attribute.name), values });
      return groups;
    }, []),
  });
  return catalogue;
}, []);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function restoreBag(value: string | null): CartLine[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.reduce<CartLine[]>((lines, item) => {
      if (!isRecord(item)) return lines;
      const id = Number(item.id);
      const quantity = Number(item.quantity);
      const price = item.price === null ? null : Number(item.price);
      if (!Number.isInteger(id) || typeof item.name !== 'string' || !Number.isInteger(quantity) || quantity < 1) return lines;
      if (price !== null && !Number.isFinite(price)) return lines;
      lines.push({
        id,
        slug: typeof item.slug === 'string' ? item.slug : String(id),
        name: item.name,
        price,
        image: typeof item.image === 'string' ? item.image : '',
        description: typeof item.description === 'string' ? item.description : '',
        shortDescription: typeof item.shortDescription === 'string' ? item.shortDescription : '',
        categories: Array.isArray(item.categories) ? item.categories.filter((entry): entry is string => typeof entry === 'string') : [],
        onSale: item.onSale === true,
        available: item.available !== false,
        averageRating: typeof item.averageRating === 'number' && Number.isFinite(item.averageRating) ? item.averageRating : null,
        reviewCount: typeof item.reviewCount === 'number' && Number.isInteger(item.reviewCount) ? item.reviewCount : 0,
        options: Array.isArray(item.options) ? item.options.reduce<Array<{ name: string; values: string[] }>>((groups, option) => {
          if (!isRecord(option) || typeof option.name !== 'string' || !Array.isArray(option.values)) return groups;
          const values = option.values.filter((value): value is string => typeof value === 'string');
          if (values.length) groups.push({ name: option.name, values });
          return groups;
        }, []) : [],
        lineKey: typeof item.lineKey === 'string' ? item.lineKey : String(id),
        selectedOptions: isRecord(item.selectedOptions)
          ? Object.entries(item.selectedOptions).reduce<Record<string, string>>((options, [name, value]) => {
              if (typeof value === 'string') options[name] = value;
              return options;
            }, {})
          : {},
        message: typeof item.message === 'string' ? item.message : '',
        quantity: Math.min(quantity, 99),
      });
      return lines;
    }, []);
  } catch {
    return [];
  }
}

function productMatchesFilter(product: Product, filter: CatalogueFilter) {
  if (filter === 'all') return true;
  if (filter === 'offers') return product.onSale || /offer|sale/i.test(product.name);
  const searchable = `${product.name} ${product.categories.join(' ')}`;
  if (filter === 'birthday') return /birthday/i.test(searchable);
  if (filter === 'anniversary') return /anniversary|wedding|love/i.test(searchable);
  if (filter === 'kids') return /kids|children|cartoon|character/i.test(searchable);
  if (filter === 'chocolate') return /chocolate|fudge|cocoa/i.test(searchable);
  if (filter === 'cupcakes') return /cupcake/i.test(searchable);
  if (filter === 'pastries') return /pastr|croissant|donut|doughnut|cookie/i.test(searchable);
  return /party|balloon|candle|topper|accessor/i.test(searchable);
}

async function fetchCataloguePage(page: number, signal?: AbortSignal, categoryId?: number | null, search = '') {
  const params = new URLSearchParams({ per_page: String(PAGE_SIZE), page: String(page) });
  if (categoryId) params.set('category', String(categoryId));
  if (search.trim()) params.set('search', search.trim());
  if (!search.trim()) params.set('orderby', 'popularity');
  const response = await fetch(`${STORE_API}?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('catalogue unavailable');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('catalogue response was invalid');
  const total = Number(response.headers.get('x-wp-total'));
  const totalPages = Number(response.headers.get('x-wp-totalpages'));
  return {
    products: mapStoreProducts(payload as StoreProduct[]),
    total: Number.isFinite(total) && total > 0 ? total : null,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null,
  };
}

async function fetchAllStoreCategories(signal?: AbortSignal): Promise<StoreCategory[]> {
  const firstResponse = await fetch(`${STORE_CATEGORY_API}?per_page=${PAGE_SIZE}&page=1`, { signal });
  if (!firstResponse.ok) throw new Error('categories unavailable');
  const firstPayload: unknown = await firstResponse.json();
  if (!Array.isArray(firstPayload)) throw new Error('category response was invalid');
  const totalPages = Math.max(1, Number(firstResponse.headers.get('x-wp-totalpages')) || 1);
  const additionalPages = totalPages > 1
    ? await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
        const response = await fetch(`${STORE_CATEGORY_API}?per_page=${PAGE_SIZE}&page=${index + 2}`, { signal });
        if (!response.ok) throw new Error('categories unavailable');
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error('category response was invalid');
        return payload;
      }))
    : [];

  return [...firstPayload, ...additionalPages.flat()].reduce<StoreCategory[]>((items, value) => {
    if (!isRecord(value)) return items;
    const id = Number(value.id);
    const count = Number(value.count);
    const parent = Number(value.parent);
    if (!Number.isInteger(id) || typeof value.name !== 'string' || typeof value.slug !== 'string') return items;
    items.push({
      id,
      name: decodeProductText(value.name),
      slug: value.slug,
      count: Number.isFinite(count) ? count : 0,
      parent: Number.isFinite(parent) ? parent : 0,
    });
    return items;
  }, []);
}

function CatalogueFeedback({
  status,
  onRetry,
  compact = false,
}: {
  status: Exclude<CatalogueStatus, 'ready'>;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (status === 'loading') {
    return (
      <View
        accessibilityLabel="Loading Cake City cakes"
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        style={[styles.loadingCollection, compact && styles.loadingCollectionCompact]}
      >
        {[0, 1].map(item => (
          <GlassSurface key={item} style={styles.loadingCard}>
            <View style={styles.loadingMedia}><ActivityIndicator color={tokens.color.brandStrong} /></View>
            <View style={styles.loadingLineWide} />
            <View style={styles.loadingLineShort} />
          </GlassSurface>
        ))}
      </View>
    );
  }

  const isEmpty = status === 'empty';
  return (
    <View style={[styles.catalogueFeedback, compact && styles.catalogueFeedbackCompact]}>
      <View style={styles.feedbackIcon}>
        <Ionicons name={isEmpty ? 'file-tray-outline' : 'cloud-offline-outline'} size={24} color={tokens.color.brandStrong} />
      </View>
      <Text style={styles.feedbackTitle}>{isEmpty ? 'No cakes found' : 'We could not load the shop'}</Text>
      <Text style={styles.feedbackCopy}>
        {isEmpty
          ? 'Try refreshing in a moment.'
          : 'Check your connection and try again. Your bag has not been changed.'}
      </Text>
      <Pressable accessibilityRole="button" hitSlop={4} style={styles.retryButton} onPress={onRetry}>
        <Ionicons name="refresh-outline" size={16} color={tokens.color.brandStrong} />
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function ProductCard({
  product,
  onOpen,
  variant = 'rail',
}: {
  product: Product;
  onOpen: () => void;
  variant?: 'rail' | 'grid';
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(Boolean(product.image));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${product.name}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.productCard,
        variant === 'grid' && styles.productCardGrid,
        pressed && styles.productCardPressed,
      ]}
    >
      <View style={[styles.productMedia, variant === 'grid' && styles.productMediaGrid]}>
        {product.image && !imageFailed ? (
          <Image
            accessibilityLabel={`${product.name} product image`}
            cachePolicy="memory-disk"
            contentFit="contain"
            onError={() => { setImageFailed(true); setImageLoading(false); }}
            onLoad={() => setImageLoading(false)}
            recyclingKey={`${product.id}:${product.image}`}
            source={{ uri: product.image }}
            style={styles.productImage}
            transition={240}
          />
        ) : (
          <View style={styles.imageFallback} accessibilityLabel="Product image unavailable">
            <Ionicons name="image-outline" size={27} color={tokens.color.brandStrong} />
          </View>
        )}
        {imageLoading ? (
          <View style={styles.productImageLoader}>
            <ActivityIndicator color={tokens.color.brandStrong} size="small" />
          </View>
        ) : null}
        {product.onSale ? <View style={styles.saleBadge}><Text style={styles.saleBadgeText}>SALE</Text></View> : null}
        <View style={styles.openHint}>
          <Ionicons name="heart-outline" size={14} color={tokens.color.brandStrong} />
        </View>
      </View>
      <View style={styles.productBody}>
        <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
        <Text numberOfLines={1} style={[styles.price, product.price === null && styles.priceUnavailable]}>
          {product.price === null ? 'Price unavailable' : `From ${money(product.price)}`}
        </Text>
      </View>
    </Pressable>
  );
}

function StoreEmptyState({
  icon,
  title,
  copy,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  copy: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={27} color={tokens.color.brandStrong} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={onAction}>
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={tokens.color.brandStrong} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Home() {
  const { customer, isGuest, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const blurTargetRef = useRef<View | null>(null);
  const productDetailController = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [shopView, setShopView] = useState<ShopView>('categories');
  const [products, setProducts] = useState<Product[]>([]);
  const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [partyProducts, setPartyProducts] = useState<Product[]>([]);
  const [catalogueStatus, setCatalogueStatus] = useState<CatalogueStatus>('loading');
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);
  const [nextPage, setNextPage] = useState(2);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CatalogueFilter>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [bagHydrated, setBagHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const [bagToast, setBagToast] = useState('');
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [ordersAttempt, setOrdersAttempt] = useState(0);
  const [rewardsAttempt, setRewardsAttempt] = useState(0);
  const [ordersContent, setOrdersContent] = useState<OrdersPanelContent>({ status: 'ready', orders: [] });
  const [rewardsContent, setRewardsContent] = useState<RewardsPanelContent>({
    status: 'ready',
    account: null,
    rewards: [],
  });
  const isPreviewCustomer = customer?.role === 'preview';

  useEffect(() => {
    if (!customer && !isGuest) router.replace('/sign-in');
  }, [customer, isGuest]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(BAG_STORAGE_KEY)
      .then(value => {
        if (mounted) setCart(restoreBag(value));
      })
      .finally(() => {
        if (mounted) setBagHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!bagHydrated) return;
    void AsyncStorage.setItem(BAG_STORAGE_KEY, JSON.stringify(cart));
  }, [bagHydrated, cart]);

  useEffect(() => {
    if (!bagToast) return;
    const timer = setTimeout(() => setBagToast(''), 2400);
    return () => clearTimeout(timer);
  }, [bagToast]);

  useEffect(() => () => productDetailController.current?.abort(), []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchAllStoreCategories(controller.signal),
      fetchCataloguePage(1, controller.signal, PARTY_ACCESSORIES_CATEGORY_ID).then(result => result.products),
    ])
      .then(([categories, accessories]) => {
        if (controller.signal.aborted) return;
        setStoreCategories(categories);
        setPartyProducts(accessories);
      })
      .catch(() => {
        // The main cake catalogue remains usable if category metadata is temporarily unavailable.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogueStatus('loading');
    setProducts([]);
    setNextPage(2);
    setHasMoreProducts(false);
    setTotalProducts(null);

    void fetchCataloguePage(1, controller.signal, activeCategoryId, debouncedQuery)
      .then(result => {
        if (controller.signal.aborted) return;
        setProducts(result.products);
        setTotalProducts(result.total);
        setHasMoreProducts(result.totalPages ? result.totalPages > 1 : result.products.length === PAGE_SIZE);
        setCatalogueStatus(result.products.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogueStatus('unavailable');
      });

    return () => controller.abort();
  }, [activeCategoryId, catalogueAttempt, debouncedQuery]);

  useEffect(() => {
    if (!customer || tab !== 'orders') return;
    if (customer.role === 'preview') {
      setOrdersContent(previewOrders);
      return;
    }
    const controller = new AbortController();
    setOrdersContent({ status: 'loading' });
    void accountCommerceApi.getOrders({ signal: controller.signal })
      .then(orders => {
        if (controller.signal.aborted) return;
        setOrdersContent({
          status: 'ready',
          orders: orders.map(order => ({
            reference: order.reference,
            status: order.state,
            total: Number(order.total),
            currency: order.currency,
            placedAt: order.created_at,
            fulfillment: order.fulfilment,
            deliverySlot: order.delivery_slot,
          })),
        });
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setOrdersContent({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'We could not load your orders.',
          requestId: isApiError(reason) ? reason.requestId ?? undefined : undefined,
        });
      });
    return () => controller.abort();
  }, [customer, ordersAttempt, tab]);

  useEffect(() => {
    if (!customer || tab !== 'rewards') return;
    if (customer.role === 'preview') {
      setRewardsContent(previewRewards);
      return;
    }
    const controller = new AbortController();
    setRewardsContent({ status: 'loading' });
    void accountCommerceApi.getRewards({ signal: controller.signal })
      .then(rewards => {
        if (controller.signal.aborted) return;
        setRewardsContent({
          status: 'ready',
          account: {
            pointsBalance: rewards.points_balance,
            tier: rewards.tier,
            lifetimePoints: rewards.lifetime_points,
            lifetimeSpend: Number(rewards.lifetime_spend),
            wallet: { balance: Number(rewards.wallet.balance), currency: rewards.wallet.currency },
            nextTier: rewards.next_tier
              ? { name: rewards.next_tier.name, spendRequired: Number(rewards.next_tier.spend_required), currency: rewards.wallet.currency }
              : null,
            benefits: rewards.benefits,
          },
          rewards: [],
        });
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setRewardsContent({
          status: 'error',
          message: reason instanceof Error ? reason.message : 'We could not load your rewards.',
          requestId: isApiError(reason) ? reason.requestId ?? undefined : undefined,
        });
      });
    return () => controller.abort();
  }, [customer, rewardsAttempt, tab]);

  const filteredProducts = useMemo(() => {
    const normalisedQuery = query.trim().toLocaleLowerCase();
    return products.filter(product => {
      const searchable = `${product.name} ${product.description} ${product.categories.join(' ')}`.toLocaleLowerCase();
      return (!normalisedQuery || searchable.includes(normalisedQuery))
        && (activeCategoryId !== null || productMatchesFilter(product, activeFilter));
    });
  }, [activeCategoryId, activeFilter, products, query]);

  const featuredProducts = useMemo(() => {
    const complete = products.filter(product => product.image && product.price !== null && product.available);
    return (complete.length ? complete : products).slice(0, 5);
  }, [products]);
  const heroProduct = featuredProducts[0] ?? null;

  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    const selectedCategories = new Set(selectedProduct.categories.map(category => category.toLocaleLowerCase()));
    const others = products.filter(product => product.id !== selectedProduct.id);
    const sameCategory = others.filter(product => product.categories.some(category => selectedCategories.has(category.toLocaleLowerCase())));
    const isPartyItem = selectedProduct.categories.some(category => /party accessories/i.test(category));
    const cakePairings = (sameCategory.length ? sameCategory : others).slice(0, isPartyItem ? 4 : 2);
    const accessoryPairings = isPartyItem
      ? []
      : partyProducts.filter(product => product.id !== selectedProduct.id).slice(0, 2);
    return [...cakePairings, ...accessoryPairings].filter((product, index, items) => items.findIndex(item => item.id === product.id) === index).slice(0, 4);
  }, [partyProducts, products, selectedProduct]);

  const cartItemCount = useMemo(() => cart.reduce((total, line) => total + line.quantity, 0), [cart]);
  const cartTotal = useMemo(() => cart.reduce((total, line) => total + (line.price ?? 0) * line.quantity, 0), [cart]);
  const heroTitle = heroProduct?.name && /chocolate\s*fudge/i.test(heroProduct.name)
    ? 'Chocolate Fudge Delight'
    : heroProduct?.name ?? 'Chocolate Fudge Delight';
  const retryCatalogue = () => setCatalogueAttempt(attempt => attempt + 1);
  const goToTab = (nextTab: Tab) => {
    setTab(nextTab);
    if (nextTab === 'shop') setShopView('categories');
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const shopBy = (filter: CatalogueFilter) => {
    const categoryOptions: Partial<Record<CatalogueFilter, { slugs: string[]; fallback: number }>> = {
      birthday: { slugs: ['birthday-cakes'], fallback: 124 },
      anniversary: { slugs: ['anniversary-cakes'], fallback: 174 },
      kids: { slugs: ['custom-cakes'], fallback: 123 },
      chocolate: { slugs: ['chocolate-base-sponge', 'chocolate-craze'], fallback: 168 },
      cupcakes: { slugs: ['cupcakes'], fallback: 110 },
      pastries: { slugs: ['cookies'], fallback: 111 },
      party: { slugs: ['party-accessories'], fallback: PARTY_ACCESSORIES_CATEGORY_ID },
      offers: { slugs: ['offers', 'deals-and-steals'], fallback: 98 },
    };
    const categoryOption = categoryOptions[filter];
    const category = categoryOption
      ? storeCategories.find(item => categoryOption.slugs.includes(item.slug))
      : null;
    setActiveFilter(filter);
    setActiveCategoryId(categoryOption ? category?.id ?? categoryOption.fallback : null);
    setQuery('');
    setDebouncedQuery('');
    setShopView('cakes');
    setTab('shop');
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const openStoreCategory = (category: StoreCategory) => {
    setActiveFilter('all');
    setActiveCategoryId(category.id);
    setQuery('');
    setDebouncedQuery('');
    setShopView('cakes');
    setTab('shop');
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };
  const openProduct = (product: Product) => {
    productDetailController.current?.abort();
    const controller = new AbortController();
    productDetailController.current = controller;
    setSelectedProduct(product);
    setProductDetailLoading(true);
    const timeout = setTimeout(() => controller.abort(), 8_000);

    void fetch(`${STORE_API}/${product.id}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('product unavailable');
        const payload: unknown = await response.json();
        if (!isRecord(payload)) throw new Error('product response was invalid');
        const [detail] = mapStoreProducts([payload as StoreProduct]);
        if (!detail || controller.signal.aborted) return;
        setSelectedProduct(current => current?.id === product.id ? detail : current);
        setProducts(current => current.map(item => item.id === detail.id ? detail : item));
      })
      .catch(() => {
        // The list response already contains a safe product summary to display.
      })
      .finally(() => {
        clearTimeout(timeout);
        if (productDetailController.current === controller) {
          productDetailController.current = null;
          setProductDetailLoading(false);
        }
      });
  };
  const closeProduct = () => {
    productDetailController.current?.abort();
    setProductDetailLoading(false);
    setSelectedProduct(null);
  };
  const add = (product: Product, selection: PremiumProductSelection) => {
    if (product.price === null || !product.available) return;
    const selectedOptions = Object.entries(selection.options)
      .filter((entry): entry is [string, string] => Boolean(entry[0]) && Boolean(entry[1]))
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, string>>((options, [name, value]) => {
        options[name] = value;
        return options;
      }, {});
    const message = selection.message.trim();
    const lineKey = `${product.id}:${JSON.stringify({ selectedOptions, message })}`;
    const quantity = Math.max(1, Math.min(9, Math.trunc(selection.quantity)));
    setCart(current => {
      const existingLine = current.find(line => line.lineKey === lineKey);
      if (!existingLine) return [...current, { ...product, lineKey, quantity, selectedOptions, message }];
      return current.map(line => line.lineKey === lineKey ? { ...line, quantity: Math.min(line.quantity + quantity, 99) } : line);
    });
    setBagToast(`${product.name} added to your bag`);
  };
  const updateQuantity = (lineKey: string, adjustment: number) => {
    setCart(current => current.flatMap(line => {
      if (line.lineKey !== lineKey) return [line];
      const quantity = line.quantity + adjustment;
      return quantity > 0 ? [{ ...line, quantity: Math.min(quantity, 99) }] : [];
    }));
  };
  const loadMoreProducts = async () => {
    if (loadingMore || !hasMoreProducts) return;
    setLoadingMore(true);
    try {
      const result = await fetchCataloguePage(nextPage, undefined, activeCategoryId, debouncedQuery);
      setProducts(current => {
        const seen = new Set(current.map(product => product.id));
        return [...current, ...result.products.filter(product => !seen.has(product.id))];
      });
      setTotalProducts(result.total);
      setHasMoreProducts(result.totalPages ? nextPage < result.totalPages : result.products.length === PAGE_SIZE);
      setNextPage(page => page + 1);
    } catch {
      setBagToast('More cakes could not be loaded. Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };
  const continueFromBag = () => {
    if (!customer) {
      setCartOpen(false);
      router.replace('/sign-in');
      return;
    }
    if (isPreviewCustomer) {
      setCartOpen(false);
      setBagToast('Preview checkout shown. Real checkout needs the Cake City API.');
      void startCakeCityOrderActivity({
        orderId: 'PREVIEW-CC10293',
        cakeName: cart[0]?.name ?? 'Chocolate Fudge Delight',
        status: 'out_for_delivery',
        etaMinutes: 12,
        progress: 0.74,
      });
      goToTab('orders');
      return;
    }
    setCheckoutMessage('Checkout is temporarily unavailable. Your bag is safe—please try again later.');
  };

  if (!customer && !isGuest) return null;

  const categoryBySlug = (...slugs: string[]) => storeCategories.find(category => slugs.includes(category.slug));
  const categoryCards: Array<{
    id: CatalogueFilter;
    label: string;
    icon: IconName;
    categoryId: number | null;
    count?: number;
  }> = [
    { id: 'all', label: 'Cakes', icon: 'storefront-outline', categoryId: null, count: totalProducts ?? undefined },
    { id: 'birthday', label: 'Birthday Cakes', icon: 'gift-outline', categoryId: categoryBySlug('birthday-cakes')?.id ?? 124, count: categoryBySlug('birthday-cakes')?.count },
    { id: 'anniversary', label: 'Anniversary', icon: 'heart-outline', categoryId: categoryBySlug('anniversary-cakes')?.id ?? 174, count: categoryBySlug('anniversary-cakes')?.count },
    { id: 'kids', label: 'Kids Cakes', icon: 'happy-outline', categoryId: categoryBySlug('custom-cakes')?.id ?? 123, count: categoryBySlug('custom-cakes')?.count },
    { id: 'chocolate', label: 'Chocolate', icon: 'cafe-outline', categoryId: categoryBySlug('chocolate-base-sponge', 'chocolate-craze')?.id ?? 168, count: categoryBySlug('chocolate-base-sponge', 'chocolate-craze')?.count },
    { id: 'cupcakes', label: 'Cupcakes', icon: 'flower-outline', categoryId: categoryBySlug('cupcakes')?.id ?? 110, count: categoryBySlug('cupcakes')?.count },
    { id: 'pastries', label: 'Cookies & Pastries', icon: 'restaurant-outline', categoryId: categoryBySlug('cookies')?.id ?? 111, count: categoryBySlug('cookies')?.count },
    { id: 'party', label: 'Party Items', icon: 'balloon-outline', categoryId: categoryBySlug('party-accessories')?.id ?? PARTY_ACCESSORIES_CATEGORY_ID, count: categoryBySlug('party-accessories')?.count },
    { id: 'offers', label: 'Offers', icon: 'pricetag-outline', categoryId: categoryBySlug('offers', 'deals-and-steals')?.id ?? 98, count: categoryBySlug('offers', 'deals-and-steals')?.count },
  ];

  const home = (
    <>
      {isPreviewCustomer ? (
        <View style={styles.previewPill}>
          <Ionicons name="eye-outline" size={12} color={tokens.color.brandStrong} />
          <Text numberOfLines={1} style={styles.previewPillText}>Preview customer · sample account activity</Text>
        </View>
      ) : null}

      <View style={styles.welcomeRow}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeTitle}>{customer ? `Hello, ${customer.first_name}` : 'Hello, cake lover'}!</Text>
          <Text style={styles.welcomeSubtitle}>What are we celebrating today?</Text>
        </View>
      </View>

      <Pressable accessibilityRole="button" style={styles.homeSearch} onPress={() => goToTab('shop')}>
        <Ionicons name="search-outline" size={17} color={tokens.color.mutedSoft} />
        <Text style={styles.homeSearchText}>Search cakes, flavors and more...</Text>
        <View style={styles.homeFilterIcon}>
          <Ionicons name="options" size={16} color={tokens.color.white} />
        </View>
      </Pressable>

      <View style={styles.heroCard}>
        <View pointerEvents="none" style={styles.heroBackdrop} />
        <View pointerEvents="none" style={styles.heroRibbon} />
        <View style={styles.heroCopyArea}>
          <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>NEW</Text></View>
          <Text numberOfLines={3} style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroCopy}>Rich. Moist. Irresistible.</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.heroPrimary}
            onPress={() => heroProduct ? openProduct(heroProduct) : goToTab('shop')}
          >
            <Text style={styles.heroPrimaryText}>Order Now</Text>
          </Pressable>
        </View>
        {heroProduct?.image ? (
          <Image
            accessibilityLabel={`${heroProduct.name} featured cake`}
            cachePolicy="memory-disk"
            contentFit="contain"
            source={{ uri: heroProduct.image }}
            style={styles.heroImage}
          />
        ) : (
          <View style={styles.heroImageFallback}><Ionicons name="storefront-outline" size={44} color="#FFFFFFC7" /></View>
        )}
      </View>

      <View style={styles.compactSectionHeading}>
        <Text style={styles.compactSectionTitle}>Categories</Text>
        <Pressable accessibilityRole="button" onPress={() => goToTab('shop')} hitSlop={6}>
          <Text style={styles.compactSectionLink}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.homeCategoryRow}>
        {categoryCards.slice(0, 5).map(category => (
          <Pressable key={category.id} accessibilityRole="button" style={styles.homeCategory} onPress={() => shopBy(category.id)}>
            <View style={styles.homeCategoryIcon}><Ionicons name={category.icon} size={19} color={tokens.color.brandStrong} /></View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.homeCategoryLabel}>{category.label.replace(' Cakes', '')}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.compactSectionHeading}>
        <Text style={styles.compactSectionTitle}>Bestsellers</Text>
        {catalogueStatus === 'ready' ? (
          <Pressable accessibilityRole="button" onPress={() => goToTab('shop')} hitSlop={6}>
            <Text style={styles.compactSectionLink}>See all</Text>
          </Pressable>
        ) : null}
      </View>
      {catalogueStatus === 'ready' ? (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRail}>
          {featuredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onOpen={() => openProduct(product)}
            />
          ))}
        </ScrollView>
      ) : (
        <CatalogueFeedback status={catalogueStatus} onRetry={retryCatalogue} compact />
      )}

      <Pressable accessibilityRole="button" style={styles.promoStrip} onPress={() => shopBy('offers')}>
        <View style={styles.promoIcon}><Ionicons name="gift" size={20} color={tokens.color.brandStrong} /></View>
        <View style={styles.promoCopy}>
          <Text style={styles.promoTitle}>Save up to 10%</Text>
          <Text style={styles.promoText}>with Cake City Rewards</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={tokens.color.brandStrong} />
      </Pressable>
    </>
  );

  const categoryCatalogue = (
    <>
      <Pressable accessibilityRole="button" style={styles.categorySearch} onPress={() => shopBy('all')}>
        <Ionicons name="search-outline" size={17} color={tokens.color.mutedSoft} />
        <Text style={styles.categorySearchText}>Search categories...</Text>
        <Ionicons name="arrow-forward" size={16} color={tokens.color.brandStrong} />
      </Pressable>
      <View style={styles.categoryGrid}>
        {categoryCards.map((category, index) => {
          const categoryProduct = products[index % Math.max(products.length, 1)];
          return (
            <Pressable key={category.id} accessibilityRole="button" style={styles.categoryCard} onPress={() => shopBy(category.id)}>
              <View style={styles.categoryImageFrame}>
                {categoryProduct?.image ? (
                  <Image source={{ uri: categoryProduct.image }} cachePolicy="memory-disk" contentFit="contain" style={styles.categoryImage} />
                ) : (
                  <Ionicons name={category.icon} size={30} color={tokens.color.brandStrong} />
                )}
              </View>
              <Text numberOfLines={2} style={styles.categoryName}>{category.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {storeCategories.length ? (
        <View style={styles.allCollections}>
          <Text style={styles.allCollectionsTitle}>All Cake City Collections</Text>
          <View style={styles.collectionChips}>
            {storeCategories
              .filter(category => category.count > 0)
              .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
              .map(category => (
                <Pressable key={category.id} accessibilityRole="button" style={styles.collectionChip} onPress={() => openStoreCategory(category)}>
                  <Text style={styles.collectionChipText}>{category.name}</Text>
                  <Text style={styles.collectionCount}>{category.count}</Text>
                </Pressable>
              ))}
          </View>
        </View>
      ) : null}
    </>
  );

  const cakesCatalogue = (
    <>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={17} color={tokens.color.mutedSoft} />
        <TextInput
          accessibilityLabel="Search Cake City cakes"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search cakes, flavors and more..."
          placeholderTextColor={tokens.color.mutedSoft}
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
        <View style={styles.searchFilter}><Ionicons name="options" size={15} color={tokens.color.white} /></View>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {catalogueFilters.slice(0, 5).map(filter => (
          <Pressable key={filter.id} accessibilityRole="button" accessibilityState={{ selected: activeFilter === filter.id }} style={[styles.chip, activeFilter === filter.id && styles.chipActive]} onPress={() => shopBy(filter.id)}>
            <Text style={[styles.chipText, activeFilter === filter.id && styles.chipTextActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {catalogueStatus === 'ready' ? filteredProducts.length ? (
        <>
          <View style={styles.productGrid}>
            {filteredProducts.map(product => (
              <View key={product.id} style={styles.gridItem}><ProductCard product={product} onOpen={() => openProduct(product)} variant="grid" /></View>
            ))}
          </View>
          {hasMoreProducts ? (
            <Pressable accessibilityRole="button" accessibilityState={{ busy: loadingMore, disabled: loadingMore }} disabled={loadingMore} style={styles.loadMoreButton} onPress={() => void loadMoreProducts()}>
              {loadingMore ? <ActivityIndicator color={tokens.color.brandStrong} size="small" /> : null}
              <Text style={styles.loadMoreText}>{loadingMore ? 'Loading...' : 'Load more products'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <StoreEmptyState icon="search-outline" title="No matching cakes" copy="Try another search or category." actionLabel="Show all cakes" onAction={() => { setQuery(''); setActiveFilter('all'); }} />
      ) : <CatalogueFeedback status={catalogueStatus} onRetry={retryCatalogue} />}
    </>
  );

  const shop = shopView === 'categories' ? categoryCatalogue : cakesCatalogue;

  const orders = (
    <OrdersPanel
      authenticated={Boolean(customer)}
      content={ordersContent}
      onRetry={() => setOrdersAttempt(attempt => attempt + 1)}
      onShop={() => goToTab('shop')}
      onSignIn={() => router.replace('/sign-in')}
    />
  );

  const rewards = (
    <RewardsPanel
      authenticated={Boolean(customer)}
      content={rewardsContent}
      onRetry={() => setRewardsAttempt(attempt => attempt + 1)}
      onShop={() => goToTab('shop')}
      onSignIn={() => router.replace('/sign-in')}
    />
  );

  const account = (
    <>
      <Text style={styles.pageTitle}>{customer ? 'My account' : 'Sign in to Cake City'}</Text>
      <Text style={styles.pageCopy}>{customer ? 'Customer details and account shortcuts.' : 'Keep orders, deliveries and rewards linked to you.'}</Text>
      {customer ? (
        <>
          <View style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{customer.first_name[0]?.toLocaleUpperCase() ?? 'C'}</Text></View>
            <View style={styles.profileIdentity}>
              <Text style={styles.profileName}>{`${customer.first_name} ${customer.last_name}`.trim()}</Text>
              <Text style={styles.profileEmail}>{customer.email}</Text>
              {customer.phone ? <Text style={styles.profilePhone}>{customer.phone}</Text> : null}
              {isPreviewCustomer ? (
                <View style={styles.profilePreviewPill}>
                  <Ionicons name="sparkles-outline" size={13} color={tokens.color.accentStrong} />
                  <Text style={styles.profilePreviewText}>Preview customer</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.accountMenu}>
            <Pressable accessibilityRole="button" style={styles.accountAction} onPress={() => goToTab('orders')}>
              <View style={styles.accountActionIcon}><Ionicons name="receipt-outline" size={19} color={tokens.color.brandStrong} /></View>
              <View style={styles.accountActionCopy}>
                <Text style={styles.accountActionTitle}>My orders</Text>
                <Text style={styles.accountActionText}>Track current and past orders</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.color.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.accountAction} onPress={() => goToTab('rewards')}>
              <View style={styles.accountActionIcon}><Ionicons name="gift-outline" size={19} color={tokens.color.brandStrong} /></View>
              <View style={styles.accountActionCopy}>
                <Text style={styles.accountActionTitle}>Loyalty rewards</Text>
                <Text style={styles.accountActionText}>View points and available rewards</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.color.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.accountAction, styles.accountActionLast]} onPress={() => goToTab('shop')}>
              <View style={styles.accountActionIcon}><Ionicons name="grid-outline" size={19} color={tokens.color.brandStrong} /></View>
              <View style={styles.accountActionCopy}>
                <Text style={styles.accountActionTitle}>Shop all categories</Text>
                <Text style={styles.accountActionText}>Cakes, cupcakes and party accessories</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.color.muted} />
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.accountGuestCard}>
          <View style={styles.accountGuestIcon}><Ionicons name="person-outline" size={23} color={tokens.color.brandStrong} /></View>
          <Text style={styles.accountGuestTitle}>Your celebrations in one place</Text>
          <Text style={styles.accountGuestCopy}>Sign in to access orders, delivery updates and loyalty points.</Text>
          <Pressable accessibilityRole="button" style={styles.accountGuestButton} onPress={() => router.replace('/sign-in')}>
            <Text style={styles.accountGuestButtonText}>Sign in</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" />
          </Pressable>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        style={styles.signOut}
        onPress={async () => { await logout(); router.replace('/sign-in'); }}
      >
        <Text style={styles.signOutText}>{customer ? 'Sign out' : 'Return to sign in'}</Text>
      </Pressable>
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <BlurTargetView ref={blurTargetRef} style={styles.flex}>
        <AuroraBackdrop style={styles.flex}>
        <View style={styles.topbar}>
          {tab === 'home' ? (
            <Image source={require('../assets/cake-city-logo.png')} style={styles.headerLogo} contentFit="contain" accessibilityLabel="Cake City" />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={5}
              style={styles.headerIconButton}
              onPress={() => {
                if (tab === 'shop' && shopView === 'cakes') {
                  setShopView('categories');
                  requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
                } else {
                  goToTab('home');
                }
              }}
            >
              <Ionicons name="arrow-back" size={19} color={tokens.color.ink} />
            </Pressable>
          )}
          {tab !== 'home' ? (
            <Text numberOfLines={1} style={styles.headerTitle}>
              {tab === 'shop' ? (shopView === 'categories' ? 'Categories' : 'Cakes') : tab === 'orders' ? 'My Orders' : tab === 'rewards' ? 'Cake City Rewards' : 'My Profile'}
            </Text>
          ) : null}
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Saved cakes" style={styles.headerIconButton} onPress={() => setBagToast('Saved cakes will appear here.')}>
              <Ionicons name="heart-outline" size={19} color={tokens.color.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open shopping bag${cartItemCount ? ` with ${cartItemCount} item${cartItemCount === 1 ? '' : 's'}` : ''}`}
              style={styles.headerIconButton}
              onPress={() => { setCheckoutMessage(''); setCartOpen(true); }}
            >
              <Ionicons name="bag-handle-outline" size={19} color={tokens.color.ink} />
              {cartItemCount > 0 ? <View style={styles.cartCount}><Text style={styles.cartCountText}>{cartItemCount > 9 ? '9+' : cartItemCount}</Text></View> : null}
            </Pressable>
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {({ home, shop, orders, rewards, account })[tab]}
        </ScrollView>
        </AuroraBackdrop>
      </BlurTargetView>

      {bagToast ? (
        <GlassSurface blurTarget={blurTargetRef} style={[styles.toast, { bottom: 98 + Math.max(insets.bottom, 8) }]}>
          <View style={styles.toastIcon}><Ionicons name="checkmark" size={15} color="#fff" /></View>
          <Text numberOfLines={2} style={styles.toastText}>{bagToast}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Open bag" hitSlop={6} onPress={() => setCartOpen(true)}>
            <Text style={styles.toastAction}>View</Text>
          </Pressable>
        </GlassSurface>
      ) : null}

      <FuturisticTabBar
        activeId={tab}
        blurTarget={blurTargetRef}
        bottomInset={insets.bottom}
        onChange={goToTab}
        tabs={tabs}
      />

      <PremiumProductSheet
        bottomInset={insets.bottom}
        loading={productDetailLoading}
        onAddToBag={add}
        onClose={closeProduct}
        onRelatedProductPress={openProduct}
        product={selectedProduct}
        relatedProducts={relatedProducts}
        relatedTitle="Pair it with"
        renderGlassBackground={() => (
          <GlassSurface blurTarget={blurTargetRef} intensity={92} style={StyleSheet.absoluteFill} />
        )}
        visible={selectedProduct !== null}
      />

      <Modal visible={cartOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setCartOpen(false)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close bag" style={styles.modalBackdrop} onPress={() => setCartOpen(false)} />
          <View style={[styles.bagSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.modalTitle}>My Cart</Text>
                <Text style={styles.modalSubtitle}>{cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close bag" style={styles.closeButton} onPress={() => setCartOpen(false)}>
                <Ionicons name="close" size={23} color={tokens.color.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.bagContent} showsVerticalScrollIndicator={false}>
              {cart.length === 0 ? (
                <StoreEmptyState
                  icon="bag-handle-outline"
                  title="Your bag is ready for something sweet"
                  copy="Add a cake from the collection to get started."
                  actionLabel="Browse cakes"
                  onAction={() => { setCartOpen(false); goToTab('shop'); }}
                />
              ) : (
                <>
                  {cart.map(line => (
                    <View key={line.lineKey} style={styles.cartItem}>
                      {line.image ? (
                        <Image source={{ uri: line.image }} cachePolicy="memory-disk" contentFit="contain" style={styles.cartImage} />
                      ) : (
                        <View style={[styles.cartImage, styles.cartImageFallback]}><Ionicons name="image-outline" size={22} color={tokens.color.brandStrong} /></View>
                      )}
                      <View style={styles.cartInfo}>
                        <Text numberOfLines={2} style={styles.cartName}>{line.name}</Text>
                        <Text style={styles.cartPrice}>{money(line.price)}</Text>
                        {Object.keys(line.selectedOptions).length || line.message ? (
                          <Text numberOfLines={2} style={styles.cartOptions}>
                            {[...Object.values(line.selectedOptions), line.message ? `Message: ${line.message}` : ''].filter(Boolean).join(' | ')}
                          </Text>
                        ) : null}
                        <View style={styles.quantityControl}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${line.name} quantity`} style={styles.quantityButton} onPress={() => updateQuantity(line.lineKey, -1)}>
                            <Ionicons name="remove" size={15} color={tokens.color.ink} />
                          </Pressable>
                          <Text accessibilityLabel={`Quantity ${line.quantity}`} style={styles.quantityValue}>{line.quantity}</Text>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${line.name} quantity`} style={styles.quantityButton} onPress={() => updateQuantity(line.lineKey, 1)}>
                            <Ionicons name="add" size={16} color={tokens.color.ink} />
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.lineTotal}>{money((line.price ?? 0) * line.quantity)}</Text>
                    </View>
                  ))}
                  <Pressable accessibilityRole="button" style={styles.clearBag} onPress={() => setCart([])}>
                    <Ionicons name="trash-outline" size={15} color={tokens.color.brandStrong} />
                    <Text style={styles.clearBagText}>Clear bag</Text>
                  </Pressable>
                  <View style={styles.total}>
                    <View style={styles.totalCopy}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text style={styles.totalHint}>Delivery is calculated at checkout.</Text>
                    </View>
                    <Text style={styles.totalValue}>{money(cartTotal)}</Text>
                  </View>
                  {checkoutMessage ? (
                    <View style={styles.checkoutMessage}>
                      <Ionicons name="information-circle-outline" size={19} color={tokens.color.warning} />
                      <Text style={styles.checkoutMessageText}>{checkoutMessage}</Text>
                    </View>
                  ) : null}
                  <Pressable accessibilityRole="button" style={({ pressed }) => [styles.checkout, pressed && styles.checkoutPressed]} onPress={continueFromBag}>
                    <Text style={styles.checkoutText}>{customer ? 'Continue to checkout' : 'Sign in to checkout'}</Text>
                    <Ionicons name="arrow-forward" size={17} color="#fff" />
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFF9FB' },
  flex: { flex: 1 },
  topbar: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
    backgroundColor: '#FFFFFFF7',
  },
  headerLogo: { width: 90, height: 44, marginLeft: -3 },
  headerTitle: { position: 'absolute', left: 62, right: 112, textAlign: 'center', color: tokens.color.ink, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 'auto' },
  headerIconButton: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  location: { fontSize: 10, lineHeight: 14, color: tokens.color.muted },
  cartButton: { width: 46, height: 46, borderRadius: 15, borderWidth: 1, borderColor: tokens.color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface },
  cartCount: { position: 'absolute', right: -2, top: -2, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 3, backgroundColor: tokens.color.brandStrong, alignItems: 'center', justifyContent: 'center' },
  cartCountText: { fontSize: 9, color: '#fff', fontWeight: '900' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: 96 },
  previewPill: { alignSelf: 'flex-start', minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: tokens.color.brandLight, marginBottom: 6 },
  previewPillText: { maxWidth: 250, color: tokens.color.brandStrong, fontSize: 9.5, lineHeight: 12, fontWeight: '800' },
  previewNotice: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderWidth: 1,
    borderColor: '#C9EDF8',
    borderRadius: 16,
    backgroundColor: tokens.color.accentLight,
    marginBottom: 14,
  },
  previewNoticeText: { flex: 1, minWidth: 0, color: tokens.color.accentStrong, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2 },
  welcomeCopy: { flex: 1 },
  welcomeMark: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border },
  eyebrow: { fontSize: 10.5, lineHeight: 14, color: tokens.color.brandStrong, fontWeight: '900', letterSpacing: 0, marginTop: 2 },
  welcomeTitle: { maxWidth: 290, fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: 0, color: tokens.color.ink },
  welcomeSubtitle: { marginTop: 2, fontSize: 11, lineHeight: 15, color: tokens.color.muted },
  homeSearch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingLeft: 12, paddingRight: 5, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 12, backgroundColor: tokens.color.surface },
  homeSearchText: { flex: 1, minWidth: 0, fontSize: 10.5, color: tokens.color.mutedSoft },
  homeFilterIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandStrong },
  heroCard: {
    minHeight: 170,
    overflow: 'hidden',
    padding: 14,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: tokens.color.brandStrong,
    ...tokens.shadow.card,
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: tokens.color.brandStrong,
  },
  heroRibbon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '43%',
    backgroundColor: '#F7B6CB',
    opacity: 0.5,
  },
  heroCopyArea: { zIndex: 2, width: '53%', minHeight: 142, alignItems: 'flex-start', justifyContent: 'center' },
  heroTop: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroBadge: {
    minHeight: 21,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#FFFFFFE8',
  },
  heroBadgeText: { color: tokens.color.brandStrong, fontSize: 7.5, lineHeight: 10, fontWeight: '900' },
  heroTitle: { maxWidth: 170, marginTop: 9, color: tokens.color.white, fontSize: 17, lineHeight: 20, fontWeight: '900', letterSpacing: 0 },
  heroCopy: { maxWidth: 160, marginTop: 4, color: '#FFE8F1', fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
  heroPrimary: { minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 10, borderRadius: 8, backgroundColor: tokens.color.white },
  heroPrimaryText: { color: tokens.color.brandStrong, fontSize: 9.5, lineHeight: 13, fontWeight: '900' },
  heroImage: { position: 'absolute', right: -1, bottom: -2, width: '51%', height: '95%' },
  heroImageFallback: { position: 'absolute', right: 0, bottom: 0, width: '43%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  heroSecondary: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#FFFFFF55',
    borderRadius: 23,
    backgroundColor: '#FFFFFF1F',
  },
  heroSecondaryText: { color: tokens.color.white, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 },
  statCard: {
    minWidth: 0,
    flexGrow: 1,
    flexBasis: 104,
    minHeight: 104,
    padding: 12,
    borderRadius: 18,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFFBF',
  },
  statValue: { marginTop: 8, color: tokens.color.ink, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  statValueSmall: { marginTop: 8, color: tokens.color.ink, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
  statLabel: { marginTop: 3, color: tokens.color.muted, fontSize: 10.5, lineHeight: 14.5, fontWeight: '700' },
  pageTitle: { maxWidth: 330, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: 0, color: tokens.color.ink, marginTop: 5 },
  pageCopy: { maxWidth: 330, fontSize: 13, lineHeight: 18.5, color: tokens.color.muted, marginTop: 8, marginBottom: 13 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 23, marginBottom: 11 },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', color: tokens.color.ink, letterSpacing: 0 },
  sectionSubtitle: { fontSize: 11.8, lineHeight: 16.5, color: tokens.color.muted, marginTop: 3 },
  sectionLink: { minHeight: 40, textAlignVertical: 'center', fontSize: 11.5, lineHeight: 40, color: tokens.color.brandStrong, fontWeight: '900' },
  moments: { marginTop: 18 },
  compactSectionHeading: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 7 },
  compactSectionTitle: { color: tokens.color.ink, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  compactSectionLink: { color: tokens.color.brandStrong, fontSize: 9.5, lineHeight: 14, fontWeight: '900' },
  homeCategoryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  homeCategory: { flex: 1, minWidth: 0, alignItems: 'center' },
  homeCategoryIcon: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F5', borderWidth: 1, borderColor: '#FFD7E6' },
  homeCategoryLabel: { width: '100%', marginTop: 4, color: tokens.color.cocoa, fontSize: 8, lineHeight: 11, fontWeight: '800', textAlign: 'center' },
  promoStrip: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FFD2E2', backgroundColor: '#FFF0F6' },
  promoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface },
  promoCopy: { flex: 1, minWidth: 0 },
  promoTitle: { color: tokens.color.ink, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  promoText: { marginTop: 1, color: tokens.color.muted, fontSize: 9.5, lineHeight: 13 },
  productRail: { gap: 8, paddingHorizontal: 1, paddingVertical: 2, paddingRight: 14 },
  productCard: { width: 108, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 11, overflow: 'hidden' },
  productCardGrid: { width: '100%' },
  productCardPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  productMedia: { position: 'relative', height: 98, backgroundColor: '#FFF0F5', padding: 4, overflow: 'hidden' },
  productMediaGrid: { height: 145 },
  productMediaPressed: { opacity: 0.84 },
  productImage: { width: '100%', height: '100%' },
  productImageLoader: { position: 'absolute', inset: 0, borderWidth: 0, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.accentLight },
  productBadges: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', gap: 5 },
  saleBadge: { position: 'absolute', left: 6, top: 6, minHeight: 19, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 6, backgroundColor: tokens.color.brandStrong },
  saleBadgeText: { color: tokens.color.white, fontSize: 7, lineHeight: 9, fontWeight: '900' },
  stockBadge: { minHeight: 24, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 8, backgroundColor: tokens.color.error },
  stockBadgeText: { color: tokens.color.white, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7 },
  openHint: { position: 'absolute', right: 6, top: 6, width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFE8' },
  productBody: { paddingHorizontal: 7, paddingTop: 7, paddingBottom: 8 },
  productName: { fontSize: 9.5, lineHeight: 12.5, minHeight: 25, fontWeight: '800', color: tokens.color.ink },
  productMetaRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  productCategory: { minWidth: 0, flex: 1, color: tokens.color.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '700' },
  rewardEligible: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, backgroundColor: tokens.color.brandLight },
  rewardEligibleText: { color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  productRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 },
  price: { marginTop: 4, fontSize: 8.5, lineHeight: 11, fontWeight: '900', color: tokens.color.brandStrong },
  priceUnavailable: { fontSize: 8, color: tokens.color.muted },
  addButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: tokens.color.brandStrong, alignItems: 'center', justifyContent: 'center' },
  addButtonDisabled: { backgroundColor: '#B9AFCB' },
  addButtonPressed: { transform: [{ scale: 0.95 }], opacity: 0.84 },
  signatureCard: { minHeight: 98, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 23, borderRadius: 16, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, ...tokens.shadow.card },
  signatureIcon: { width: 45, height: 45, borderRadius: 15, backgroundColor: tokens.color.brandLight, alignItems: 'center', justifyContent: 'center' },
  signatureCopy: { flex: 1, minWidth: 0 },
  signatureEyebrow: { fontSize: 9, lineHeight: 12, letterSpacing: 1.05, fontWeight: '900', color: tokens.color.brandStrong },
  signatureTitle: { fontSize: 13, lineHeight: 18, fontWeight: '900', color: tokens.color.ink, marginTop: 4 },
  signatureAction: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFC7', borderWidth: 1, borderColor: tokens.color.border },
  categorySearch: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 13, borderRadius: 12, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  categorySearchText: { flex: 1, color: tokens.color.mutedSoft, fontSize: 10.5 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  categoryCard: { width: '31.5%', minHeight: 137, overflow: 'hidden', borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  categoryImageFrame: { height: 103, alignItems: 'center', justifyContent: 'center', padding: 5, backgroundColor: '#FFF0F5' },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { minHeight: 33, paddingHorizontal: 5, paddingVertical: 6, color: tokens.color.ink, fontSize: 9, lineHeight: 11, fontWeight: '800', textAlign: 'center' },
  allCollections: { marginTop: 18 },
  allCollectionsTitle: { marginBottom: 9, color: tokens.color.ink, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  collectionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  collectionChip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  collectionChipText: { maxWidth: 190, color: tokens.color.cocoa, fontSize: 9, lineHeight: 12, fontWeight: '700' },
  collectionCount: { color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  search: { minHeight: 44, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 12, paddingLeft: 12, paddingRight: 5, flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, minHeight: 42, fontSize: 11, marginLeft: 7, color: tokens.color.ink },
  searchFilter: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandStrong },
  chips: { gap: 6, paddingVertical: 11, paddingRight: 14 },
  chip: { minHeight: 34, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface },
  chipActive: { backgroundColor: tokens.color.brandStrong, borderColor: tokens.color.brandStrong },
  chipText: { fontSize: 9.5, color: tokens.color.muted, fontWeight: '700' },
  chipTextActive: { color: '#fff', fontWeight: '900' },
  resultsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 3, marginBottom: 11 },
  resultsTitle: { fontSize: 18, lineHeight: 22, color: tokens.color.ink, fontWeight: '900' },
  resultsCount: { fontSize: 11, color: tokens.color.muted, fontWeight: '800' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  gridItem: { width: '48.5%' },
  loadMoreButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: tokens.color.borderStrong, backgroundColor: tokens.color.surface, marginTop: 14 },
  loadMorePressed: { backgroundColor: tokens.color.brandLight },
  loadMoreText: { fontSize: 12.5, fontWeight: '900', color: tokens.color.brandStrong },
  loadingCollection: { flexDirection: 'row', gap: 10, marginTop: 8 },
  loadingCollectionCompact: { marginTop: 0 },
  loadingCard: { flex: 1, height: 248, padding: 9, borderRadius: 20, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF9E' },
  loadingMedia: { height: 170, borderRadius: 15, backgroundColor: '#FBE8F2B8', alignItems: 'center', justifyContent: 'center' },
  loadingLineWide: { width: '76%', height: 11, borderRadius: 6, backgroundColor: tokens.color.border, marginTop: 14 },
  loadingLineShort: { width: '46%', height: 9, borderRadius: 5, backgroundColor: tokens.color.brandLight, marginTop: 9 },
  catalogueFeedback: { alignItems: 'center', backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 24, marginTop: 8 },
  catalogueFeedbackCompact: { paddingVertical: 20, marginTop: 0 },
  feedbackIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: tokens.color.accentLight, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  feedbackTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', textAlign: 'center', color: tokens.color.ink },
  feedbackCopy: { maxWidth: 290, fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, textAlign: 'center', marginTop: 6 },
  retryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 22, paddingHorizontal: 15, marginTop: 16 },
  retryText: { fontSize: 12, fontWeight: '900', color: tokens.color.brandStrong },
  emptyState: { alignItems: 'center', backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 25, marginTop: 11 },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: tokens.color.accentLight, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  emptyTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: tokens.color.ink, textAlign: 'center' },
  emptyCopy: { maxWidth: 290, fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, textAlign: 'center', marginTop: 6 },
  secondaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 22, paddingHorizontal: 15, marginTop: 17 },
  secondaryButtonText: { fontSize: 12, fontWeight: '900', color: tokens.color.brandStrong },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, marginTop: 9, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, ...tokens.shadow.card },
  avatar: { width: 54, height: 54, borderRadius: 8, backgroundColor: tokens.color.brandLight, borderWidth: 1, borderColor: tokens.color.borderStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 21, fontWeight: '900', color: tokens.color.brandStrong },
  profileIdentity: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 16, lineHeight: 20, fontWeight: '900', color: tokens.color.ink },
  profileEmail: { fontSize: 11.5, lineHeight: 16, color: tokens.color.muted, marginTop: 2 },
  profilePhone: { fontSize: 11, lineHeight: 15, color: tokens.color.muted, marginTop: 1 },
  profilePreviewPill: { alignSelf: 'flex-start', minHeight: 25, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: tokens.color.accentLight, marginTop: 6 },
  profilePreviewText: { fontSize: 10.5, lineHeight: 14, color: tokens.color.accentStrong, fontWeight: '900' },
  accountMenu: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, overflow: 'hidden' },
  accountAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.surface },
  accountActionLast: { borderBottomWidth: 0 },
  accountActionIcon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandLight },
  accountActionCopy: { flex: 1, minWidth: 0, marginHorizontal: 11 },
  accountActionTitle: { fontSize: 13, fontWeight: '900', color: tokens.color.ink },
  accountActionText: { fontSize: 11.5, lineHeight: 16, color: tokens.color.muted, marginTop: 2 },
  accountGuestCard: { padding: 18, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, marginTop: 9, ...tokens.shadow.card },
  accountGuestIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandLight },
  accountGuestTitle: { maxWidth: 280, fontSize: 18, lineHeight: 23, color: tokens.color.ink, fontWeight: '900', marginTop: 14 },
  accountGuestCopy: { maxWidth: 305, fontSize: 12.5, lineHeight: 18, color: tokens.color.muted, marginTop: 6 },
  accountGuestButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: tokens.color.brandStrong, marginTop: 16 },
  accountGuestButtonText: { fontSize: 12.5, fontWeight: '900', color: '#fff' },
  signOut: { height: 46, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  signOutText: { fontSize: 12.5, color: tokens.color.brandStrong, fontWeight: '900' },
  toast: { position: 'absolute', left: 14, right: 14, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 19, borderColor: '#FFFFFFE8', backgroundColor: '#FBF7FFD9', zIndex: 8, ...tokens.shadow.floating },
  toastIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.success },
  toastText: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 16, fontWeight: '800', color: tokens.color.ink },
  toastAction: { minHeight: 40, lineHeight: 40, fontSize: 11.5, fontWeight: '900', color: tokens.color.brandStrong },
  modalLayer: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', inset: 0, backgroundColor: '#251A3F73' },
  bagSheet: { maxHeight: '88%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: tokens.color.background, overflow: 'hidden', ...tokens.shadow.floating },
  sheetHandle: { width: 42, height: 5, alignSelf: 'center', borderRadius: 3, backgroundColor: tokens.color.borderStrong, marginTop: 8 },
  sheetHeader: { minHeight: 66, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.surface },
  modalTitle: { fontSize: 19, lineHeight: 23, fontWeight: '900', color: tokens.color.ink },
  modalSubtitle: { fontSize: 10.5, lineHeight: 14, color: tokens.color.muted, marginTop: 1 },
  closeButton: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surfaceTint, borderWidth: 1, borderColor: tokens.color.border },
  bagContent: { paddingHorizontal: 16, paddingBottom: 20 },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  cartImage: { width: 60, height: 60, borderRadius: 8, backgroundColor: tokens.color.accentLight },
  cartImageFallback: { alignItems: 'center', justifyContent: 'center' },
  cartInfo: { flex: 1, minWidth: 0 },
  cartName: { fontSize: 12.5, lineHeight: 16, fontWeight: '900', color: tokens.color.ink, marginBottom: 3 },
  cartPrice: { fontSize: 11.5, fontWeight: '900', color: tokens.color.brandStrong },
  cartOptions: { marginTop: 3, fontSize: 9.5, lineHeight: 13, color: tokens.color.muted },
  quantityControl: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  quantityButton: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surface },
  quantityValue: { minWidth: 18, textAlign: 'center', fontSize: 12, fontWeight: '900', color: tokens.color.ink },
  lineTotal: { maxWidth: 76, fontSize: 11.5, lineHeight: 15, textAlign: 'right', color: tokens.color.brandStrong, fontWeight: '900' },
  clearBag: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 12 },
  clearBagText: { fontSize: 11.5, fontWeight: '900', color: tokens.color.brandStrong },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: 16, paddingBottom: 17, gap: 16 },
  totalCopy: { flex: 1, minWidth: 0 },
  totalLabel: { fontSize: 13, fontWeight: '900', color: tokens.color.ink },
  totalHint: { fontSize: 11.5, lineHeight: 16, color: tokens.color.muted, marginTop: 3 },
  totalValue: { maxWidth: 130, fontSize: 17, fontWeight: '900', color: tokens.color.ink, textAlign: 'right' },
  checkoutMessage: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: '#F0D89F', backgroundColor: tokens.color.warningLight, marginBottom: 12 },
  checkoutMessageText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: tokens.color.warning },
  checkout: { minHeight: 50, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, flexDirection: 'row', gap: 8, backgroundColor: tokens.color.brandStrong, ...tokens.shadow.card },
  checkoutPressed: { opacity: 0.88 },
  checkoutText: { color: tokens.color.white, fontSize: 13, fontWeight: '900' },
});
