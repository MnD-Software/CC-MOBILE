import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { tokens } from '@/theme/tokens';

import { CustomerAccessCard, CustomerPanelLoading } from './CustomerPanelStates';

export type CustomerOrderSummary = {
  reference: string;
  status: string;
  total: number;
  currency: string;
  placedAt: string;
  fulfillment?: string | null;
  deliverySlot?: string | null;
  itemSummary?: string | null;
  cakeName?: string | null;
  cakeSize?: string | null;
  imageUrl?: string | null;
  branchName?: string | null;
};

export type OrdersPanelContent =
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | { status: 'ready'; orders: readonly CustomerOrderSummary[] };

export type OrdersPanelProps = {
  authenticated: boolean;
  content: OrdersPanelContent;
  onSignIn: () => void;
  onShop: () => void;
  onRetry?: () => void;
  onOrderPress?: (order: CustomerOrderSummary) => void;
};

type OrderView = 'upcoming' | 'past';

const trackerSteps = [
  { label: 'Order Placed', icon: 'receipt-outline' as const },
  { label: 'Being Prepared', icon: 'restaurant-outline' as const },
  { label: 'Out for Delivery', icon: 'bicycle-outline' as const },
  { label: 'Delivered', icon: 'checkmark' as const },
];

function readableLabel(value: string): string {
  const normalized = value.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return normalized ? normalized.replace(/\b\w/g, letter => letter.toUpperCase()) : 'Processing';
}

function formatDate(value?: string | null, includeTime = false): string {
  if (!value) return 'To be confirmed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-KE', includeTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(amount: number, currency: string): string {
  const value = Number.isFinite(amount) ? amount.toLocaleString('en-KE') : 'Unavailable';
  return currency.trim().toUpperCase() === 'KES' ? `KSh ${value}` : `${currency.toUpperCase()} ${value}`;
}

function isPastOrder(order: CustomerOrderSummary) {
  return /delivered|completed|cancelled|canceled|refunded/i.test(order.status);
}

function orderProgress(status: string) {
  const value = status.toLowerCase();
  if (/delivered|completed/.test(value)) return 4;
  if (/out.for.delivery|dispatch|shipped/.test(value)) return 3;
  if (/baking|prepar|process/.test(value)) return 2;
  return 1;
}

function UpcomingOrder({ order, onPress }: { order: CustomerOrderSummary; onPress?: (order: CustomerOrderSummary) => void }) {
  const progress = orderProgress(order.status);
  const cakeName = order.cakeName ?? order.itemSummary ?? 'Cake City celebration order';
  return (
    <View style={styles.activeOrder}>
      <View style={styles.activeOrderTop}>
        <View>
          <Text style={styles.orderNumber}>Order #{order.reference.replace(/^PREVIEW-/i, '')}</Text>
          <Text style={styles.orderDate}>Placed {formatDate(order.placedAt)}</Text>
        </View>
        <View style={styles.statusPill}><Text style={styles.statusPillText}>{readableLabel(order.status)}</Text></View>
      </View>

      <View style={styles.orderItem}>
        <View style={styles.itemThumb}>
          {order.imageUrl ? (
            <Image source={{ uri: order.imageUrl }} cachePolicy="memory-disk" contentFit="contain" style={styles.itemImage} />
          ) : (
            <Ionicons name="storefront-outline" size={22} color={tokens.color.brandStrong} />
          )}
        </View>
        <View style={styles.itemCopy}>
          <Text numberOfLines={2} style={styles.itemName}>{cakeName}</Text>
          <Text style={styles.itemMeta}>{[order.cakeSize, order.fulfillment ? readableLabel(order.fulfillment) : null].filter(Boolean).join(' | ') || 'Cake City order'}</Text>
        </View>
        <Text style={styles.itemPrice}>{formatMoney(order.total, order.currency)}</Text>
      </View>

      <View style={styles.deliveryBanner}>
        <View style={styles.deliveryIcon}><Ionicons name="time-outline" size={18} color={tokens.color.brandStrong} /></View>
        <View style={styles.deliveryCopy}>
          <Text style={styles.deliveryLabel}>Delivery</Text>
          <Text style={styles.deliveryValue}>{formatDate(order.deliverySlot, true)}</Text>
          {order.branchName ? <Text style={styles.deliveryBranch}>{order.branchName}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" style={styles.viewDetails} onPress={() => onPress?.(order)}>
          <Text style={styles.viewDetailsText}>View Details</Text>
        </Pressable>
      </View>

      <View style={styles.tracker}>
        {trackerSteps.map((step, index) => {
          const complete = index < progress;
          return (
            <View key={step.label} style={styles.trackerStep}>
              {index < trackerSteps.length - 1 ? <View style={[styles.trackerLine, complete && index < progress - 1 && styles.trackerLineActive]} /> : null}
              <View style={[styles.trackerDot, complete && styles.trackerDotActive]}>
                <Ionicons name={step.icon} size={13} color={complete ? tokens.color.white : tokens.color.mutedSoft} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.orderFooter}>
        <Text style={styles.totalText}>Total: <Text style={styles.totalValue}>{formatMoney(order.total, order.currency)}</Text></Text>
        {onPress ? (
          <Pressable accessibilityRole="button" style={styles.viewDetails} onPress={() => onPress(order)}>
            <Text style={styles.viewDetailsText}>View Details</Text>
            <Ionicons name="chevron-forward" size={14} color={tokens.color.brandStrong} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PastOrder({ order, onPress }: { order: CustomerOrderSummary; onPress?: (order: CustomerOrderSummary) => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} style={styles.pastOrder} onPress={() => onPress?.(order)}>
      <View style={styles.itemThumb}>
        {order.imageUrl ? (
          <Image source={{ uri: order.imageUrl }} cachePolicy="memory-disk" contentFit="contain" style={styles.itemImage} />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={23} color={tokens.color.success} />
        )}
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.orderNumber}>Order #{order.reference.replace(/^PREVIEW-/i, '')}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>{order.cakeName ?? order.itemSummary ?? 'Cake City order'}</Text>
        <Text numberOfLines={1} style={styles.itemMeta}>{formatDate(order.placedAt)} | {readableLabel(order.status)}</Text>
      </View>
      <Text style={styles.itemPrice}>{formatMoney(order.total, order.currency)}</Text>
    </Pressable>
  );
}

export function OrdersPanel({ authenticated, content, onSignIn, onShop, onRetry, onOrderPress }: OrdersPanelProps) {
  const [view, setView] = useState<OrderView>('upcoming');
  const orders = useMemo(() => {
    if (content.status !== 'ready') return [];
    return content.orders.filter(order => view === 'past' ? isPastOrder(order) : !isPastOrder(order));
  }, [content, view]);

  if (!authenticated) {
    return <CustomerAccessCard icon="receipt-outline" title="Keep every celebration close." message="Sign in to see your Cake City orders and delivery updates." onSignIn={onSignIn} onShop={onShop} />;
  }
  if (content.status === 'loading') return <CustomerPanelLoading label="Loading your Cake City orders" />;
  if (content.status === 'error') return <ErrorState title="Your orders are unavailable" message={content.message} requestId={content.requestId} onRetry={onRetry} />;

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        {(['upcoming', 'past'] as const).map(item => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: view === item }} style={[styles.segment, view === item && styles.segmentActive]} onPress={() => setView(item)}>
            <Text style={[styles.segmentText, view === item && styles.segmentTextActive]}>{item === 'upcoming' ? 'Upcoming' : 'Past Orders'}</Text>
          </Pressable>
        ))}
      </View>
      {orders.length === 0 ? (
        <EmptyState icon="bag-handle-outline" title={view === 'upcoming' ? 'No upcoming orders' : 'No past orders'} message="Your Cake City orders will appear here." actionLabel="Explore cakes" onAction={onShop} />
      ) : (
        <View style={styles.orderList}>
          {orders.map(order => view === 'upcoming'
            ? <UpcomingOrder key={order.reference} order={order} onPress={onOrderPress} />
            : <PastOrder key={order.reference} order={order} onPress={onOrderPress} />)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  segmented: { height: 40, flexDirection: 'row', padding: 3, marginBottom: 14, borderRadius: 10, backgroundColor: '#F7E9EF' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: tokens.color.surface, ...tokens.shadow.card },
  segmentText: { color: tokens.color.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
  segmentTextActive: { color: tokens.color.brandStrong, fontWeight: '900' },
  orderList: { gap: 12 },
  activeOrder: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface, ...tokens.shadow.card },
  activeOrderTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  orderNumber: { color: tokens.color.ink, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  orderDate: { marginTop: 2, color: tokens.color.muted, fontSize: 8.5, lineHeight: 12 },
  statusPill: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8, backgroundColor: tokens.color.brandLight },
  statusPillText: { color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  deliveryBanner: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFF1F6' },
  deliveryIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: tokens.color.surface },
  deliveryCopy: { flex: 1 },
  deliveryLabel: { color: tokens.color.muted, fontSize: 8.5, lineHeight: 11 },
  deliveryValue: { marginTop: 2, color: tokens.color.ink, fontSize: 10.5, lineHeight: 14, fontWeight: '900' },
  deliveryBranch: { marginTop: 2, color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '800' },
  tracker: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
  trackerStep: { flex: 1, alignItems: 'center' },
  trackerLine: { position: 'absolute', left: '50%', right: '-50%', top: 13, height: 2, backgroundColor: tokens.color.border },
  trackerLineActive: { backgroundColor: tokens.color.brandStrong },
  trackerDot: { zIndex: 1, width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E7DCE1' },
  trackerDotActive: { backgroundColor: tokens.color.brandStrong },
  trackerLabel: { maxWidth: 70, marginTop: 5, color: tokens.color.mutedSoft, fontSize: 7.5, lineHeight: 10, textAlign: 'center' },
  trackerLabelActive: { color: tokens.color.ink, fontWeight: '800' },
  orderItem: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: tokens.color.border },
  itemThumb: { width: 58, height: 58, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFF0F5' },
  itemImage: { width: '100%', height: '100%' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemName: { color: tokens.color.ink, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },
  itemMeta: { marginTop: 3, color: tokens.color.muted, fontSize: 8.5, lineHeight: 11 },
  itemPrice: { maxWidth: 85, color: tokens.color.ink, fontSize: 9.5, lineHeight: 13, fontWeight: '900', textAlign: 'right' },
  orderFooter: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10 },
  totalText: { color: tokens.color.muted, fontSize: 9.5, lineHeight: 13 },
  totalValue: { color: tokens.color.ink, fontWeight: '900' },
  viewDetails: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: tokens.color.border },
  viewDetailsText: { color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  pastOrder: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
});
