import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { tokens } from '@/theme/tokens';

type Props = TextInputProps & {
  onClear?: () => void;
};

export function SearchBar({
  onClear,
  value,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  placeholderTextColor = tokens.color.muted,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const hasValue = typeof value === 'string' && value.length > 0;

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      <Ionicons accessible={false} name="search-outline" size={19} color={focused ? tokens.color.brand : tokens.color.muted} />
      <TextInput
        {...rest}
        accessibilityLabel={accessibilityLabel ?? rest.placeholder ?? 'Search'}
        accessibilityHint={accessibilityHint ?? 'Filters the current product list'}
        placeholderTextColor={placeholderTextColor}
        underlineColorAndroid="transparent"
        style={[styles.input, style]}
        value={value}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
      {hasValue && onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          accessibilityHint="Clears the current search term"
          hitSlop={6}
          style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
          onPress={onClear}
        >
          <Ionicons accessible={false} name="close" size={17} color={tokens.color.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    height: 50,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  containerFocused: { borderColor: tokens.color.brand, borderWidth: 2, paddingHorizontal: 13 },
  input: { flex: 1, minWidth: 0, paddingVertical: 0, fontSize: 15, lineHeight: 20, color: tokens.color.ink },
  clear: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clearPressed: { opacity: 0.68, backgroundColor: tokens.color.brandLight },
});
