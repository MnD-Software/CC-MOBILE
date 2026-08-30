import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

export type CelebrationMomentTone = 'rose' | 'sky' | 'gold' | 'violet' | 'neutral';

export type CelebrationMoment = {
  id: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  tone?: CelebrationMomentTone;
};

export type CelebrationMomentsRailProps = {
  /** All moment labels, icons, and actions come from the caller. */
  moments: readonly CelebrationMoment[];
  title?: string;
  onViewAll?: () => void;
  viewAllLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const toneStyles: Record<CelebrationMomentTone, { background: string; border: string; accent: string }> = {
  rose: { background: tokens.color.brandLight, border: '#FFC7E4', accent: tokens.color.brandStrong },
  sky: { background: tokens.color.accentLight, border: '#A8EDFB', accent: tokens.color.accentStrong },
  gold: { background: tokens.color.sunshineLight, border: '#FFDF9E', accent: tokens.color.sunshineStrong },
  violet: { background: tokens.color.violetLight, border: '#DCCBFC', accent: tokens.color.violetStrong },
  neutral: { background: tokens.color.surface, border: tokens.color.borderStrong, accent: tokens.color.cocoa },
};

const defaultTones: CelebrationMomentTone[] = ['rose', 'sky', 'gold', 'violet'];

export function CelebrationMomentsRail({
  moments,
  title,
  onViewAll,
  viewAllLabel = 'View all',
  style,
}: CelebrationMomentsRailProps) {
  if (!moments.length) return null;

  return (
    <View style={[styles.container, style]}>
      {title || onViewAll ? (
        <View style={styles.headingRow}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {onViewAll ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={viewAllLabel}
              hitSlop={6}
              onPress={onViewAll}
              style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
            >
              <Text style={styles.viewAllText}>{viewAllLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {moments.map((moment, index) => {
          const tone = toneStyles[moment.tone ?? defaultTones[index % defaultTones.length]];
          return (
            <Pressable
              key={moment.id}
              accessibilityRole="button"
              accessibilityLabel={moment.accessibilityLabel ?? moment.label}
              accessibilityHint={moment.accessibilityHint}
              onPress={moment.onPress}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: tone.background, borderColor: tone.border },
                pressed && styles.cardPressed,
              ]}
            >
              <View
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={[styles.iconFrame, { borderColor: tone.border }]}
              >
                {moment.icon}
              </View>
              <Text numberOfLines={2} style={styles.label}>{moment.label}</Text>
              <View pointerEvents="none" style={[styles.accent, { backgroundColor: tone.accent }]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', minWidth: 0 },
  headingRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.md, marginBottom: tokens.space.sm },
  title: { flex: 1, fontSize: 18, lineHeight: 23, fontWeight: '900', letterSpacing: 0, color: tokens.color.ink },
  viewAll: { minHeight: 40, justifyContent: 'center', paddingHorizontal: tokens.space.xs },
  viewAllPressed: { opacity: 0.65 },
  viewAllText: { fontSize: 11.5, lineHeight: 16, fontWeight: '900', color: tokens.color.brandStrong },
  rail: { gap: 9, paddingVertical: 3, paddingRight: tokens.space.lg },
  card: {
    position: 'relative',
    width: 82,
    minHeight: 88,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  iconFrame: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: tokens.color.surface,
  },
  label: { maxWidth: 70, marginTop: 7, fontSize: 10.5, lineHeight: 14, fontWeight: '800', textAlign: 'center', color: tokens.color.ink },
  accent: { position: 'absolute', width: 18, height: 3, right: 7, top: 7, borderRadius: 2 },
});
