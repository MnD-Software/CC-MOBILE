import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { tokens } from '@/theme/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
};

export const Input = forwardRef<TextInput, Props>(function Input({
  label,
  error,
  hint,
  style,
  multiline,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  placeholderTextColor = tokens.color.muted,
  selectionColor = tokens.color.brand,
  ...rest
}, ref) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        ref={ref}
        multiline={multiline}
        accessibilityLabel={accessibilityLabel ?? label ?? rest.placeholder ?? 'Text input'}
        accessibilityHint={accessibilityHint ?? error ?? hint}
        placeholderTextColor={placeholderTextColor}
        selectionColor={selectionColor}
        underlineColorAndroid="transparent"
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && !error && styles.inputFocused,
          error ? styles.inputError : null,
          rest.editable === false && styles.inputDisabled,
          style,
        ]}
      />
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: '100%', minWidth: 0, gap: 6 },
  label: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: tokens.color.ink },
  input: {
    width: '100%',
    minWidth: 0,
    height: 50,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 15,
    lineHeight: 20,
    color: tokens.color.ink,
    backgroundColor: tokens.color.surface,
  },
  inputMultiline: { height: 116, minHeight: 116, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  inputFocused: { borderColor: tokens.color.brand, borderWidth: 2, paddingHorizontal: 13 },
  inputError: { borderColor: tokens.color.error, borderWidth: 2, paddingHorizontal: 13 },
  inputDisabled: { backgroundColor: tokens.color.background, color: tokens.color.muted },
  hint: { fontSize: 12, lineHeight: 16, color: tokens.color.muted },
  error: { fontSize: 12, lineHeight: 16, color: tokens.color.error, fontWeight: '700' },
});
