import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';
import { Button } from './Button';

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
  requestId?: string;
};

export function ErrorState({ title = 'Something went wrong', message, onRetry, requestId }: Props) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={28} color={tokens.color.brand} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="outline" style={styles.button} /> : null}
      {requestId ? <Text style={styles.requestId}>Reference: {requestId}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.xl,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.brandLight,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.md,
  },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: tokens.color.ink, marginBottom: 6, textAlign: 'center' },
  message: { width: '100%', maxWidth: 288, fontSize: 13, lineHeight: 19, color: tokens.color.muted, textAlign: 'center' },
  button: { alignSelf: 'stretch', width: '100%', maxWidth: 280, marginTop: tokens.space.lg },
  requestId: { fontSize: 11, lineHeight: 15, color: tokens.color.muted, marginTop: tokens.space.md, textAlign: 'center' },
});
