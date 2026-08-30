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
import { env } from '@/config/env';
import { tokens } from '@/theme/tokens';

type FocusedField = 'email' | 'password' | null;

export default function SignIn() {
  const { login, completeGoogle, continueAsGuest, startPreviewAccount } = useAuth();
  const passwordInput = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submitDisabled = busy || !email.trim() || !password;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      router.replace('/home');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!env.googleWebClientId) {
      setError('Google sign-in is awaiting its configured client ID.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId: env.googleWebClientId,
        iosClientId: env.googleIosClientId || undefined,
        offlineAccess: false,
      });
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      if (isSuccessResponse(result) && result.data.idToken) {
        await completeGoogle(result.data.idToken);
        router.replace('/home');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuestUser = () => {
    continueAsGuest();
    router.replace('/home');
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
            <BrandLogo width={148} />
            <Text style={styles.title}>Make Every Moment Sweeter</Text>
            <Text style={styles.copy}>Sign in to order cakes, track deliveries and collect Cake City rewards.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputShell, focusedField === 'email' && styles.inputShellFocused]}>
                <Ionicons name="mail-outline" size={19} color={cakeCityBrand.cocoa} />
                <TextInput
                  accessibilityLabel="Email address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!busy}
                  keyboardType="email-address"
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => passwordInput.current?.focus()}
                  placeholder="you@example.com"
                  placeholderTextColor={cakeCityBrand.muted}
                  returnKeyType="next"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputShell, focusedField === 'password' && styles.inputShellFocused]}>
                <Ionicons name="lock-closed-outline" size={19} color={cakeCityBrand.cocoa} />
                <TextInput
                  ref={passwordInput}
                  accessibilityLabel="Password"
                  autoComplete="current-password"
                  editable={!busy}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onSubmitEditing={() => {
                    if (!submitDisabled) void submit();
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={cakeCityBrand.muted}
                  returnKeyType="done"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={password}
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
              <Text style={styles.passwordHint}>Use the password linked to your Cake City account.</Text>
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
                  <Text style={styles.primaryButtonText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={18} color={cakeCityBrand.surface} />
                </>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.divider} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={google}
              style={({ pressed }) => [
                styles.secondaryButton,
                busy && styles.buttonDisabled,
                pressed && !busy && styles.secondaryButtonPressed,
              ]}
            >
              <Ionicons name="logo-google" size={19} color={cakeCityBrand.cocoa} />
              <Text style={styles.secondaryButtonText}>Google</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={continueAsGuestUser}
              style={({ pressed }) => [styles.guestButton, pressed && !busy && styles.guestButtonPressed]}
            >
              <Ionicons name="compass-outline" size={18} color={cakeCityBrand.pinkAccessible} />
              <Text style={styles.guestButtonText}>Explore as a guest</Text>
            </Pressable>

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
                <Text style={styles.previewTitle}>Preview full customer flow</Text>
                <Text style={styles.previewText}>Demo-only orders and points for UI testing.</Text>
              </View>
              <Ionicons name="arrow-forward" size={17} color={cakeCityBrand.pinkAccessible} />
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel="Create a Cake City account"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.push('/register')}
            style={({ pressed }) => [styles.footerButton, pressed && styles.footerButtonPressed]}
          >
            <Text style={styles.footerText}>New to Cake City?</Text>
            <Text style={styles.footerLink}>Create an account</Text>
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
    paddingTop: 18,
    paddingBottom: 22,
  },
  header: { alignItems: 'center', marginBottom: 16 },
  title: {
    color: cakeCityBrand.cocoa,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 10,
    textAlign: 'center',
  },
  copy: {
    maxWidth: 326,
    color: cakeCityBrand.muted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 5,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    borderRadius: 8,
    padding: 16,
    gap: 13,
    shadowColor: '#4C1832',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  fieldGroup: { gap: 6 },
  label: { color: cakeCityBrand.ink, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  inputShell: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    borderRadius: 8,
    backgroundColor: '#FFFCFE',
    paddingLeft: 14,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputShellFocused: { borderColor: cakeCityBrand.pink, backgroundColor: cakeCityBrand.surface },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    color: cakeCityBrand.ink,
    fontSize: 14,
    paddingVertical: 0,
  },
  revealButton: {
    width: 42,
    height: 42,
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: cakeCityBrand.border },
  dividerText: { color: cakeCityBrand.muted, fontSize: 10.5, lineHeight: 15, fontWeight: '700' },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cakeCityBrand.border,
    backgroundColor: cakeCityBrand.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
  },
  secondaryButtonPressed: { backgroundColor: cakeCityBrand.cyanSoft },
  secondaryButtonText: { color: cakeCityBrand.cocoa, fontSize: 13.5, fontWeight: '800' },
  guestButton: {
    minHeight: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  guestButtonPressed: { backgroundColor: cakeCityBrand.pinkSoft },
  guestButtonText: { color: cakeCityBrand.pinkAccessible, fontSize: 12.5, fontWeight: '900' },
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
    marginTop: 8,
    paddingHorizontal: 12,
  },
  footerButtonPressed: { opacity: 0.65 },
  footerText: { color: cakeCityBrand.muted, fontSize: 12.5 },
  footerLink: { color: cakeCityBrand.pinkAccessible, fontSize: 12.5, fontWeight: '900' },
});
