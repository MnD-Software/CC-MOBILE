import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { BrandLogo, cakeCityBrand } from '@/components/BrandLogo';
import { AuroraBackdrop } from '@/components/storefront/AuroraBackdrop';
import { tokens } from '@/theme/tokens';

type Form = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
};

type FocusedField = keyof Form | null;

export default function Register() {
  const { register, startPreviewAccount } = useAuth();
  const lastNameInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const [form, setForm] = useState<Form>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitDisabled = busy || !form.first_name || !form.email || form.password.length < 10;
  const field = (key: keyof Form) => (value: string) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await register({
        ...form,
        email: form.email.trim().toLowerCase(),
        phone: form.phone || undefined,
      });
      router.replace('/home');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const previewAccount = () => {
    startPreviewAccount();
    router.replace('/home');
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.page}>
      <AuroraBackdrop variant="auth" style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={styles.content}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <BrandLogo width={136} />
            <Text style={styles.title}>Create your Cake City account</Text>
            <Text style={styles.copy}>Save orders, delivery details and rewards in one secure account.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, styles.nameField]}>
                <Text style={styles.label}>First name</Text>
                <View style={[styles.inputShell, focusedField === 'first_name' && styles.inputShellFocused]}>
                  <Ionicons name="person-outline" size={18} color={cakeCityBrand.cocoa} />
                  <TextInput
                    accessibilityLabel="First name"
                    autoComplete="given-name"
                    editable={!busy}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={field('first_name')}
                    onFocus={() => setFocusedField('first_name')}
                    onSubmitEditing={() => lastNameInput.current?.focus()}
                    placeholder="First name"
                    placeholderTextColor={cakeCityBrand.muted}
                    returnKeyType="next"
                    style={styles.input}
                    value={form.first_name}
                  />
                </View>
              </View>

              <View style={[styles.fieldGroup, styles.nameField]}>
                <Text style={styles.label}>Last name</Text>
                <View style={[styles.inputShell, focusedField === 'last_name' && styles.inputShellFocused]}>
                  <Ionicons name="person-outline" size={18} color={cakeCityBrand.cocoa} />
                  <TextInput
                    ref={lastNameInput}
                    accessibilityLabel="Last name"
                    autoComplete="family-name"
                    editable={!busy}
                    onBlur={() => setFocusedField(null)}
                    onChangeText={field('last_name')}
                    onFocus={() => setFocusedField('last_name')}
                    onSubmitEditing={() => emailInput.current?.focus()}
                    placeholder="Last name"
                    placeholderTextColor={cakeCityBrand.muted}
                    returnKeyType="next"
                    style={styles.input}
                    value={form.last_name}
                  />
                </View>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputShell, focusedField === 'email' && styles.inputShellFocused]}>
                <Ionicons name="mail-outline" size={18} color={cakeCityBrand.cocoa} />
                <TextInput
                  ref={emailInput}
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!busy}
                  keyboardType="email-address"
                  onBlur={() => setFocusedField(null)}
                  onChangeText={field('email')}
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => phoneInput.current?.focus()}
                  placeholder="you@example.com"
                  placeholderTextColor={cakeCityBrand.muted}
                  returnKeyType="next"
                  style={styles.input}
                  value={form.email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone number <Text style={styles.optional}>(optional)</Text></Text>
              <View style={[styles.inputShell, focusedField === 'phone' && styles.inputShellFocused]}>
                <Ionicons name="call-outline" size={18} color={cakeCityBrand.cocoa} />
                <TextInput
                  ref={phoneInput}
                  accessibilityLabel="Phone number, optional"
                  autoComplete="tel"
                  editable={!busy}
                  keyboardType="phone-pad"
                  onBlur={() => setFocusedField(null)}
                  onChangeText={field('phone')}
                  onFocus={() => setFocusedField('phone')}
                  onSubmitEditing={() => passwordInput.current?.focus()}
                  placeholder="07XX XXX XXX"
                  placeholderTextColor={cakeCityBrand.muted}
                  returnKeyType="next"
                  style={styles.input}
                  value={form.phone}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputShell, focusedField === 'password' && styles.inputShellFocused]}>
                <Ionicons name="lock-closed-outline" size={18} color={cakeCityBrand.cocoa} />
                <TextInput
                  ref={passwordInput}
                  accessibilityLabel="Password"
                  autoComplete="new-password"
                  editable={!busy}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={field('password')}
                  onFocus={() => setFocusedField('password')}
                  onSubmitEditing={() => {
                    if (!submitDisabled) void submit();
                  }}
                  placeholder="Create a secure password"
                  placeholderTextColor={cakeCityBrand.muted}
                  returnKeyType="done"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={form.password}
                />
                <Pressable
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={() => setShowPassword(current => !current)}
                  style={({ pressed }) => [styles.revealButton, pressed && styles.iconButtonPressed]}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={cakeCityBrand.muted}
                  />
                </Pressable>
              </View>
              <Text style={styles.passwordHint}>Use at least 10 characters.</Text>
            </View>

            {error ? (
              <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={19} color={cakeCityBrand.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: submitDisabled }}
              disabled={submitDisabled}
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                submitDisabled && styles.buttonDisabled,
                pressed && !submitDisabled && styles.primaryButtonPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={cakeCityBrand.surface} size="small" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Create account</Text>
                  <Ionicons name="arrow-forward" size={18} color={cakeCityBrand.surface} />
                </>
              )}
            </Pressable>

            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={17} color={cakeCityBrand.cyan} />
              <Text style={styles.privacyText}>Your details are used for your account, support and delivery updates.</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={previewAccount}
              style={({ pressed }) => [styles.previewButton, pressed && !busy && styles.previewButtonPressed]}
            >
              <View style={styles.previewIcon}>
                <Ionicons name="sparkles-outline" size={18} color={cakeCityBrand.cyan} />
              </View>
              <View style={styles.previewCopy}>
                <Text style={styles.previewTitle}>Use preview customer</Text>
                <Text style={styles.previewText}>Open the full UI flow with labelled demo orders and points.</Text>
              </View>
              <Ionicons name="arrow-forward" size={17} color={cakeCityBrand.pinkAccessible} />
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel="Sign in to an existing Cake City account"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.replace('/sign-in')}
            style={({ pressed }) => [styles.footerButton, pressed && styles.footerButtonPressed]}
          >
            <Text style={styles.footerText}>Already registered?</Text>
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      </AuroraBackdrop>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFF7FA' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  header: { alignItems: 'center', marginBottom: 13 },
  title: {
    color: cakeCityBrand.cocoa,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 8,
    textAlign: 'center',
  },
  copy: {
    maxWidth: 320,
    color: cakeCityBrand.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    borderRadius: 8,
    padding: 16,
    gap: 12,
    shadowColor: '#4C1832',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameField: { flex: 1, minWidth: 0 },
  fieldGroup: { gap: 6 },
  label: { color: cakeCityBrand.ink, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  optional: { color: cakeCityBrand.muted, fontWeight: '600' },
  inputShell: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    borderRadius: 8,
    backgroundColor: '#FFFCFE',
    paddingLeft: 12,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputShellFocused: { borderColor: cakeCityBrand.pink, backgroundColor: cakeCityBrand.surface },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 47,
    color: cakeCityBrand.ink,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  revealButton: {
    width: 41,
    height: 41,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: { backgroundColor: cakeCityBrand.pinkSoft },
  passwordHint: { color: cakeCityBrand.muted, fontSize: 10.5, lineHeight: 15 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#F2C7C2',
    borderRadius: 8,
    backgroundColor: cakeCityBrand.errorSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: cakeCityBrand.error,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: cakeCityBrand.pinkAccessible,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    ...tokens.shadow.card,
  },
  primaryButtonPressed: { opacity: 0.9 },
  primaryButtonText: { color: cakeCityBrand.surface, fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.42 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    backgroundColor: cakeCityBrand.cyanSoft,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  privacyText: {
    flex: 1,
    color: cakeCityBrand.cocoa,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
  },
  previewButton: {
    minHeight: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    backgroundColor: '#FFFBFD',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewButtonPressed: { backgroundColor: cakeCityBrand.cyanSoft },
  previewIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cakeCityBrand.cyanSoft,
  },
  previewCopy: { flex: 1, minWidth: 0 },
  previewTitle: { color: cakeCityBrand.cocoa, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
  previewText: { color: cakeCityBrand.muted, fontSize: 10.5, lineHeight: 15, marginTop: 1 },
  footerButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 7,
    paddingHorizontal: 12,
  },
  footerButtonPressed: { opacity: 0.65 },
  footerText: { color: cakeCityBrand.muted, fontSize: 12.5 },
  footerLink: { color: cakeCityBrand.pinkAccessible, fontSize: 12.5, fontWeight: '900' },
});
