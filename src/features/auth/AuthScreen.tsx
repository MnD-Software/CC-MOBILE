import { Ionicons } from "@expo/vector-icons";
import { Disclosure } from "@/components/ui/Disclosure";
import { accountDestination } from "@/auth/route-access";
import { takeCustomerRoute } from "@/auth/post-login";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  router,
  useLocalSearchParams,
  useRootNavigationState,
} from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { z } from "zod";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen, Notice, ui as baseUi } from "@/components/ui/Commerce";
import { useAuth } from "@/auth/AuthProvider";
import { authApi } from "@/auth/api";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
export function AuthScreen({
  mode,
  destination,
}: {
  mode: "login" | "register" | "forgot" | "reset";
  destination?: "/rider";
}) {
  const ui = useThemedStyles(baseUi);
  const { colors } = useTheme();
  const auth = useAuth();
  const navigation = useRootNavigationState();
  const submitting = useRef(false);
  const routed = useRef<string | null>(null);
  const params = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [visible, setVisible] = useState(false);
  const title = {
    login: "Welcome back.",
    register: "Join the sweet life.",
    forgot: "Forgot your password?",
    reset: "A fresh start.",
  }[mode];
  useEffect(() => {
    if (
      !navigation?.key ||
      auth.restoring ||
      !auth.customer ||
      !["login", "register"].includes(mode)
    )
      return;
    if (routed.current === auth.customer.id) return;
    routed.current = auth.customer.id;
    router.replace(
      auth.customer.role === "customer"
        ? destination || takeCustomerRoute() || "/home"
        : accountDestination(auth.customer.role),
    );
  }, [
    navigation?.key,
    mode,
    auth.restoring,
    auth.customer?.id,
    auth.customer?.role,
  ]);
  async function submit() {
    if (submitting.current || auth.restoring) return;
    submitting.current = true;
    setError("");
    setBusy(true);
    try {
      if (mode !== "reset" && !z.email().safeParse(email.trim()).success)
        throw new Error("Enter a valid email address.");
      if (
        ["register", "reset"].includes(mode) &&
        (password.length < 8 || password.length > 128)
      )
        throw new Error("Use a password between 8 and 128 characters.");
      if (mode === "login") {
        if (!password) throw new Error("Enter your password.");
        await auth.login(email, password);
        // The account effect routes once the authenticated role is available.
      }
      if (mode === "register") {
        if (!name.trim()) throw new Error("Enter your first name.");
        if (!last.trim()) throw new Error("Enter your last name.");
        if (
          phone.trim() &&
          !/^(?:\+?254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ""))
        )
          throw new Error("Enter a valid Kenyan phone number.");
        await auth.register({
          email: email.trim().toLowerCase(),
          password,
          first_name: name.trim(),
          last_name: last.trim(),
          phone: phone.trim() || undefined,
        });
        // One account effect owns navigation for both sign-in and sign-up.
      }
      if (mode === "forgot") {
        await authApi.forgotPassword(email.trim().toLowerCase());
        setSuccess(
          "If an account matches this email, a reset link is on its way.",
        );
      }
      if (mode === "reset") {
        if (!params.token)
          throw new Error("Open the password reset link from your email.");
        await authApi.resetPassword(params.token, password);
        setSuccess("Your password has been updated. You can sign in now.");
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && mode === "register") {
        setError("An account already exists for this email. Sign in instead.");
      } else {
        setError(e instanceof Error ? e.message : "Please try again.");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen title="" back={mode !== "login"}>
      <View
        style={{ maxWidth: 480, width: "100%", alignSelf: "center", gap: 20 }}
      >
        {mode === "login" || mode === "register" ? (
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              padding: 5,
              gap: 5,
              borderRadius: 20,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            {(["login", "register"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === value }}
                disabled={busy}
                onPress={() =>
                  router.replace(value === "login" ? "/sign-in" : "/register")
                }
                style={{
                  flex: 1,
                  minHeight: 46,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    mode === value ? colors.brandStrong : "transparent",
                }}
              >
                <Text
                  style={{
                    color: mode === value ? "#FFFFFF" : colors.ink,
                    fontWeight: "700",
                  }}
                >
                  {value === "login" ? "Sign in" : "Sign up"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View>
          <Text style={ui.eyebrow}>YOUR CELEBRATIONS, TOGETHER</Text>
          <Text
            style={[ui.title, { fontSize: 32, lineHeight: 38, marginTop: 6 }]}
          >
            {destination === "/rider" ? "Rider sign in" : title}
          </Text>
          <Text style={[ui.body, { marginTop: 10 }]}>
            {mode === "register"
              ? "Your cakes, orders and Club rewards, all in one account."
              : "Sign in once. Your orders and rewards stay with you."}
          </Text>
        </View>
        <View style={{ gap: 16 }}>
          {mode === "register" ? (
            <>
              <View style={ui.row}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="First name"
                    value={name}
                    onChangeText={setName}
                    autoComplete="given-name"
                    maxLength={80}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Last name"
                    value={last}
                    onChangeText={setLast}
                    autoComplete="family-name"
                    maxLength={80}
                  />
                </View>
              </View>
              <Disclosure title="Add a phone number (optional)">
                <Input
                  label="Phone (optional)"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={40}
                />
              </Disclosure>
            </>
          ) : null}
          {mode !== "reset" ? (
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete={mode === "login" ? "username" : "email"}
              textContentType={mode === "login" ? "username" : "emailAddress"}
              autoCorrect={false}
              editable={!busy}
              importantForAutofill="yes"
              maxLength={320}
            />
          ) : null}
          {mode !== "forgot" ? (
            <>
              <View style={{ position: "relative" }}>
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!visible}
                  textContentType={
                    mode === "login" ? "password" : "newPassword"
                  }
                  importantForAutofill="yes"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  style={{ paddingRight: 54 }}
                  returnKeyType="go"
                  editable={!busy}
                  maxLength={128}
                  onSubmitEditing={() => void submit()}
                  hint={
                    mode === "register" ? "At least 8 characters." : undefined
                  }
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    visible ? "Hide password" : "Show password"
                  }
                  onPress={() => setVisible((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: 23,
                    width: 44,
                    height: 48,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={visible ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
            </>
          ) : null}
          {error ? <Notice error message={error} /> : null}
          {success ? (
            <Notice message={success} />
          ) : (
            <Button
              loading={busy}
              disabled={busy || auth.restoring}
              label={
                {
                  login: "Sign in",
                  register: "Create account",
                  forgot: "Send reset link",
                  reset: "Update password",
                }[mode]
              }
              onPress={() => void submit()}
            />
          )}
          {success ? (
            <Button
              label="Back to sign in"
              onPress={() => router.replace("/sign-in")}
            />
          ) : null}
          {mode === "login" ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                label="Forgot password?"
                onPress={() => router.push("/forgot-password")}
              />
              {destination !== "/rider" ? (
                <>
                  <Button
                    variant="ghost"
                    label="Rider sign in"
                    onPress={() => router.push("/rider-login")}
                  />
                </>
              ) : (
                <Notice message="Use your provisioned rider or driver account. Dispatch assigns access; signing up as a customer does not grant rider access." />
              )}
            </>
          ) : null}
          {mode === "register" ? (
            <Text style={[ui.body, { fontSize: 12 }]}>
              By creating an account, you agree to Cake City’s{" "}
              <Link href="/legal" style={{ color: colors.brandStrong }}>
                terms and privacy policy
              </Link>
              .
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
