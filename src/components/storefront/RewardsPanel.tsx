import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { tokens } from '@/theme/tokens';

import { CustomerAccessCard, CustomerPanelLoading } from './CustomerPanelStates';

export type CustomerLoyaltyAccount = {
  pointsBalance: number;
  tier?: string | null;
  lifetimePoints?: number | null;
  lifetimeSpend?: number | null;
  wallet?: { balance: number; currency: string } | null;
  nextTier?: { name: string; spendRequired: number; currency: string } | null;
  benefits?: readonly string[];
};

export type CustomerRewardOffer = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  imageUrl?: string | null;
};

export type RewardsPanelContent =
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | { status: 'ready'; account: CustomerLoyaltyAccount | null; rewards: readonly CustomerRewardOffer[] };

export type RewardsPanelProps = {
  authenticated: boolean;
  content: RewardsPanelContent;
  onSignIn: () => void;
  onShop: () => void;
  onRetry?: () => void;
  onRewardPress?: (reward: CustomerRewardOffer) => void;
};

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('en-KE', { maximumFractionDigits: 0 }) : 'Unavailable';
}

function readableLabel(value?: string | null) {
  return value?.trim().replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) || 'Member';
}

function formatMoney(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount.toLocaleString('en-KE') : 'Unavailable';
  return currency.trim().toUpperCase() === 'KES' ? `KSh ${value}` : `${currency.toUpperCase()} ${value}`;
}

function PointsCard({ account }: { account: CustomerLoyaltyAccount }) {
  const lifetimeSpend = account.lifetimeSpend ?? 0;
  const spendRequired = account.nextTier?.spendRequired ?? 0;
  const membershipTarget = lifetimeSpend + spendRequired;
  const progress = membershipTarget > 0 ? Math.min(100, Math.max(0, (lifetimeSpend / membershipTarget) * 100)) : 100;
  return (
    <View style={styles.pointsCard}>
      <View style={styles.pointsTop}>
        <View style={styles.crown}><Ionicons name="trophy" size={18} color="#C68100" /></View>
        <View style={styles.tierPill}><Text style={styles.tierText}>{readableLabel(account.tier)} Member</Text></View>
      </View>
      <Text style={styles.pointsLabel}>Your Points</Text>
      <Text style={styles.pointsValue}>{formatNumber(account.pointsBalance)}</Text>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>{formatMoney(lifetimeSpend, account.nextTier?.currency ?? account.wallet?.currency ?? 'KES')} spent</Text>
        <Text style={styles.progressText}>{account.nextTier ? `${formatMoney(spendRequired, account.nextTier.currency)} to ${readableLabel(account.nextTier.name)}` : 'Highest tier reached'}</Text>
      </View>
    </View>
  );
}

function RewardCard({ reward, onPress }: { reward: CustomerRewardOffer; onPress?: (reward: CustomerRewardOffer) => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} style={styles.rewardCard} onPress={() => onPress?.(reward)}>
      <View style={styles.rewardMedia}>
        {reward.imageUrl ? <Image source={{ uri: reward.imageUrl }} contentFit="contain" style={styles.rewardImage} /> : <Ionicons name="gift" size={29} color={tokens.color.brandStrong} />}
      </View>
      <Text numberOfLines={2} style={styles.rewardName}>{reward.name}</Text>
      <Text style={styles.rewardCost}>{formatNumber(reward.pointsCost)} pts</Text>
    </Pressable>
  );
}

export function RewardsPanel({ authenticated, content, onSignIn, onShop, onRetry, onRewardPress }: RewardsPanelProps) {
  if (!authenticated) {
    return <CustomerAccessCard icon="gift-outline" title="Your rewards belong with you." message="Sign in to view Cake City points, rewards, and member benefits." onSignIn={onSignIn} onShop={onShop} />;
  }
  if (content.status === 'loading') return <CustomerPanelLoading label="Loading your Cake City rewards" />;
  if (content.status === 'error') return <ErrorState title="Your rewards are unavailable" message={content.message} requestId={content.requestId} onRetry={onRetry} />;
  if (!content.account && content.rewards.length === 0) {
    return <EmptyState icon="gift-outline" title="No rewards to show yet" message="Your points and Cake City offers will appear here." actionLabel="Explore cakes" onAction={onShop} />;
  }

  const benefits = content.account?.benefits?.filter(Boolean) ?? [];
  return (
    <View style={styles.container}>
      {content.account ? <PointsCard account={content.account} /> : null}

      {content.account?.wallet || content.account?.lifetimePoints != null ? (
        <View style={styles.factRow}>
          {content.account.lifetimePoints != null ? (
            <View style={styles.fact}>
              <View style={styles.factIcon}><Ionicons name="sparkles" size={17} color={tokens.color.brandStrong} /></View>
              <View><Text style={styles.factLabel}>Lifetime points</Text><Text style={styles.factValue}>{formatNumber(content.account.lifetimePoints)}</Text></View>
            </View>
          ) : null}
          {content.account.wallet ? (
            <View style={styles.fact}>
              <View style={styles.factIcon}><Ionicons name="wallet" size={17} color={tokens.color.brandStrong} /></View>
              <View><Text style={styles.factLabel}>Cake City wallet</Text><Text style={styles.factValue}>{formatMoney(content.account.wallet.balance, content.account.wallet.currency)}</Text></View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your Rewards</Text>
        {content.rewards.length ? <Text style={styles.sectionLink}>See all</Text> : null}
      </View>
      {content.rewards.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rewardRail}>
          {content.rewards.map(reward => <RewardCard key={reward.id} reward={reward} onPress={onRewardPress} />)}
        </ScrollView>
      ) : (
        <View style={styles.noOffers}><Ionicons name="gift-outline" size={20} color={tokens.color.muted} /><Text style={styles.noOffersText}>New reward offers will appear here when available.</Text></View>
      )}

      {benefits.length ? (
        <View style={styles.benefitsSection}>
          <Text style={styles.sectionTitle}>Member Benefits</Text>
          <View style={styles.benefitsList}>
            {benefits.map((benefit, index) => (
              <View key={`${benefit}-${index}`} style={styles.benefitRow}>
                <View style={styles.benefitCheck}><Ionicons name="checkmark" size={13} color={tokens.color.success} /></View>
                <Text style={styles.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  pointsCard: { padding: 15, borderRadius: 13, borderWidth: 1, borderColor: '#F1D9A6', backgroundColor: '#FFF9E9', ...tokens.shadow.card },
  pointsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  crown: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFE7A7' },
  tierPill: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8, backgroundColor: tokens.color.surface },
  tierText: { color: '#9A6400', fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  pointsLabel: { marginTop: 13, color: tokens.color.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
  pointsValue: { marginTop: 1, color: tokens.color.ink, fontSize: 31, lineHeight: 37, fontWeight: '900' },
  progressTrack: { height: 7, overflow: 'hidden', marginTop: 12, borderRadius: 4, backgroundColor: '#F1DFB9' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: tokens.color.brandStrong },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  progressText: { color: tokens.color.muted, fontSize: 7.5, lineHeight: 10 },
  factRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  fact: { flex: 1, minWidth: 0, minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9, borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  factIcon: { width: 32, height: 32, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: tokens.color.brandLight },
  factLabel: { color: tokens.color.muted, fontSize: 7.5, lineHeight: 10 },
  factValue: { marginTop: 2, color: tokens.color.ink, fontSize: 9.5, lineHeight: 13, fontWeight: '900' },
  sectionHeading: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, marginBottom: 8 },
  sectionTitle: { color: tokens.color.ink, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  sectionLink: { color: tokens.color.brandStrong, fontSize: 9, lineHeight: 12, fontWeight: '900' },
  rewardRail: { gap: 8, paddingRight: 14 },
  rewardCard: { width: 105, overflow: 'hidden', borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  rewardMedia: { height: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F5' },
  rewardImage: { width: '100%', height: '100%' },
  rewardName: { minHeight: 31, paddingHorizontal: 7, paddingTop: 7, color: tokens.color.ink, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  rewardCost: { paddingHorizontal: 7, paddingBottom: 8, color: tokens.color.brandStrong, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
  noOffers: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  noOffersText: { flex: 1, color: tokens.color.muted, fontSize: 9.5, lineHeight: 14 },
  benefitsSection: { marginTop: 18 },
  benefitsList: { marginTop: 8, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: tokens.color.border, backgroundColor: tokens.color.surface },
  benefitRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.color.border },
  benefitCheck: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: tokens.color.successLight },
  benefitText: { flex: 1, color: tokens.color.cocoa, fontSize: 9.5, lineHeight: 13, fontWeight: '700' },
});
