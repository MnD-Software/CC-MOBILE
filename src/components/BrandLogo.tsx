import { Image } from 'expo-image';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

export const cakeCityBrand = {
  pink: tokens.color.brand,
  pinkAccessible: tokens.color.brandStrong,
  pinkPressed: tokens.color.brandPressed,
  pinkSoft: tokens.color.surfaceTint,
  cyan: tokens.color.accent,
  cyanSoft: tokens.color.accentLight,
  cocoa: tokens.color.cocoa,
  ink: tokens.color.ink,
  muted: tokens.color.muted,
  background: tokens.color.background,
  surface: tokens.color.surface,
  border: tokens.color.border,
  error: tokens.color.error,
  errorSoft: tokens.color.errorLight,
} as const;

type BrandLogoProps = {
  width?: number;
  style?: StyleProp<ViewStyle>;
};

export function BrandLogo({ width = 126, style }: BrandLogoProps) {
  return (
    <View style={[styles.frame, { width, height: width * 0.72 }, style]}>
      <Image
        accessibilityLabel="Cake City, since 2012"
        accessible
        contentFit="contain"
        source={require('../../assets/cake-city-logo.png')}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
