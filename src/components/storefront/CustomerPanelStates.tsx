import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { tokens } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

type CustomerPanelHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function CustomerPanelHeader({ eyebrow, title, description }: CustomerPanelHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

type CustomerAccessCardProps = {
  icon: IconName;
  title: string;
  message: string;
  onSignIn: () => void;
  onShop?: () => void;
};

export function CustomerAccessCard({ icon, title, message, onSignIn, onShop }: CustomerAccessCardProps) {
  return (
    <View style={styles.accessCard}>
      <View style={styles.accessContent}>
        <View style={styles.accessIcon}>
          <Ionicons name={icon} size={24} color={tokens.color.brandStrong} />
        </View>
        <Text accessibilityRole="header" style={styles.accessTitle}>{title}</Text>
        <Text style={styles.accessMessage}>{message}</Text>
        <View style={styles.accessActions}>
          <Button
            label="Sign in"
            onPress={onSignIn}
            variant="primary"
            size="md"
            icon={<Ionicons accessible={false} name="person-outline" size={17} color={tokens.color.white} />}
            style={styles.primaryAction}
          />
          {onShop ? (
            <Button
              label="Browse cakes"
              onPress={onShop}
              variant="secondary"
              size="md"
              icon={<Ionicons accessible={false} name="arrow-forward" size={17} color={tokens.color.ink} />}
              style={styles.secondaryAction}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function CustomerPanelLoading({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={styles.loadingList}
    >
      {[0, 1, 2].map((row) => (
        <View key={row} accessible={false} style={styles.loadingCard}>
          <View style={styles.loadingTop}>
            <View style={styles.loadingIdentity}>
              <Skeleton width={42} height={42} radius={14} />
              <View style={styles.loadingCopy}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="42%" height={10} />
              </View>
            </View>
            <Skeleton width={72} height={24} radius={12} />
          </View>
          <Skeleton width="86%" height={11} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%', marginBottom: tokens.space.lg },
  eyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  title: {
    maxWidth: 330,
    marginTop: 5,
    color: tokens.color.ink,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },
  description: {
    maxWidth: 344,
    marginTop: 8,
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  accessCard: {
    width: '100%',
    minHeight: 226,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  accessContent: { zIndex: 1, padding: tokens.space.xl },
  accessIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.brandLight,
  },
  accessTitle: {
    maxWidth: 286,
    marginTop: tokens.space.lg,
    color: tokens.color.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: 0,
  },
  accessMessage: {
    maxWidth: 300,
    marginTop: tokens.space.sm,
    color: tokens.color.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  accessActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.space.sm,
    marginTop: tokens.space.lg,
  },
  primaryAction: { minWidth: 124 },
  secondaryAction: { minWidth: 142 },
  loadingList: { width: '100%', gap: tokens.space.md },
  loadingCard: {
    gap: tokens.space.md,
    padding: tokens.space.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
  },
  loadingTop: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space.md,
  },
  loadingIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
  loadingCopy: { minWidth: 0, flex: 1, gap: tokens.space.sm },
});
