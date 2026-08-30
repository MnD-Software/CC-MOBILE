import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { tokens } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = PressableProps & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  label: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const variantStyles: Record<Variant, { bg: string; border?: string; text: string }> = {
  primary: { bg: tokens.color.brandStrong, border: tokens.color.brandDark, text: tokens.color.white },
  secondary: { bg: tokens.color.surface, border: tokens.color.border, text: tokens.color.ink },
  outline: { bg: 'transparent', border: tokens.color.brandStrong, text: tokens.color.brandStrong },
  ghost: { bg: 'transparent', text: tokens.color.brandStrong },
  danger: { bg: tokens.color.error, border: tokens.color.error, text: tokens.color.white },
};

const sizeStyles: Record<Size, { height: number; fontSize: number; paddingH: number; radius: number }> = {
  // A compact visual size still receives a 48 dp hit area through hitSlop.
  sm: { height: 40, fontSize: 13, paddingH: 14, radius: tokens.radius.pill },
  md: { height: 48, fontSize: 14, paddingH: 18, radius: tokens.radius.pill },
  lg: { height: 54, fontSize: 16, paddingH: 22, radius: tokens.radius.pill },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  label,
  icon,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  hitSlop,
  ...rest
}: Props) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = Boolean(disabled || loading || accessibilityState?.disabled);

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: loading || accessibilityState?.busy }}
      disabled={isDisabled}
      hitSlop={hitSlop ?? (size === 'sm' ? 4 : undefined)}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border ?? 'transparent',
          borderWidth: variant === 'ghost' ? 0 : 1,
          height: s.height,
          paddingHorizontal: s.paddingH,
          borderRadius: s.radius,
        },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <>
          {icon}
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.label, { color: v.text, fontSize: s.fontSize }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  label: {
    fontWeight: '800',
    flexShrink: 1,
    textAlign: 'center',
  },
  disabled: { opacity: 0.52 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
