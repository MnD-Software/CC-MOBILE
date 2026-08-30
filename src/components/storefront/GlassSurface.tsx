import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import type { PropsWithChildren, RefObject } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@/theme/tokens';

type GlassSurfaceProps = PropsWithChildren<{
  blurTarget?: RefObject<View | null>;
  intensity?: number;
  interactive?: boolean;
  /** Override the frosted tint (iOS liquid glass + Android fallback). */
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}>;

const liquidGlassAvailable = Platform.OS === 'ios' && isGlassEffectAPIAvailable();

/**
 * Uses Apple's native Liquid Glass on supported iOS devices and Expo BlurView
 * everywhere else. Android blur is restricted to SDK 31+ to avoid the costly
 * legacy rendering path.
 */
export function GlassSurface({
  blurTarget,
  children,
  intensity = 72,
  interactive = false,
  tintColor = '#FFF9FBE8',
  style,
}: GlassSurfaceProps) {
  if (liquidGlassAvailable) {
    return (
      <GlassView
        colorScheme="light"
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={[styles.surface, style]}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      blurMethod={Platform.OS === 'android' && blurTarget ? 'dimezisBlurViewSdk31Plus' : 'none'}
      blurTarget={blurTarget}
      intensity={intensity}
      style={[styles.surface, { backgroundColor: tintColor }, style]}
      tint="systemUltraThinMaterialLight"
    >
      {children}
    </BlurView>
  );
}

export function GlassLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <GlassSurface style={styles.loading}>
      <ActivityIndicator color={tokens.color.brandStrong} size="small" />
      <Text style={styles.loadingText}>{label}</Text>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFFFFFE8',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: tokens.radius.lg,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '800',
  },
});
