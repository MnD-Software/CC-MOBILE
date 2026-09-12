import { useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Text, View, Platform } from "react-native";
import { z } from "zod";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen, Notice, ui } from "@/components/ui/Commerce";
import { useAuth } from "@/auth/AuthProvider";
import { authApi } from "@/auth/api";
import { env } from "@/config/env";
import { tokens } from "@/theme/tokens";
export function AuthScreen({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "reset";
}) {
  const auth = useAuth();
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
    register: "Make it personal.",
    forgot: "Forgot your password?",
    reset: "A fresh start.",
  }[mode];
  async function submit() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (mode !== "reset" && !z.email().safeParse(email.trim()).success)
        throw new Error("Enter a valid email address.");
      if (
        ["register", "reset"].includes(mode) &&
        (password.length < 10 || password.length > 128)
      )
        throw new Error("Use a password between 10 and 128 characters.");
      if (mode === "login") {
        if (!password) throw new Error("Enter your password.");
        await auth.login(email, password);
        if (router.canGoBack()) router.back();
        else router.replace("/home");
      }
      if (mode === "register") {
        if (!name.trim()) throw new Error("Enter your first name.");
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
        router.replace("/home");
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
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const { GoogleSignin, isSuccessResponse } = await import(
        "@react-native-google-signin/google-signin"
      );
      GoogleSignin.configure({
        webClientId: env.googleWebClientId,
        iosClientId: env.googleIosClientId || undefined,
      });
      if (Platform.OS === "android") await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      if (isSuccessResponse(result) && result.data.idToken) {
        await auth.completeGoogle(result.data.idToken);
        router.replace("/home");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Google sign-in could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title=""
      back
      right={
        <Link
          href="/home"
          style={{ color: tokens.color.brandStrong, padding: 12 }}
        >
          Explore cakes
        </Link>
      }
    >
      <View
        style={{ maxWidth: 480, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <BrandLogo width={112} />
        <View>
          <Text style={ui.eyebrow}>YOUR CELEBRATIONS, TOGETHER</Text>
          <Text
            style={[ui.title, { fontSize: 38, lineHeight: 44, marginTop: 10 }]}
          >
            {title}
          </Text>
          <Text style={[ui.body, { marginTop: 10 }]}>
            The cakes you love. The people you celebrate. A little more Cake
            City, just for you.
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
                    maxLength={120}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Last name"
                    value={last}
                    onChangeText={setLast}
                    autoComplete="family-name"
                    maxLength={120}
                  />
                </View>
              </View>
              <Input
                label="Phone (optional)"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={32}
              />
            </>
          ) : null}
          {mode !== "reset" ? (
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              maxLength={320}
            />
          ) : null}
          {mode !== "forgot" ? (
            <>
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                maxLength={128}
                onSubmitEditing={() => void submit()}
                hint={
                  mode === "register" ? "At least 10 characters." : undefined
                }
              />
              <Button
                variant="ghost"
                size="sm"
                label={visible ? "Hide password" : "Show password"}
                onPress={() => setVisible(!visible)}
              />
            </>
          ) : null}
          {error ? <Notice error message={error} /> : null}
          {success ? (
            <Notice message={success} />
          ) : (
            <Button
              loading={busy}
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
          )}{" "}
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
                label="Forgot password?"
                onPress={() => router.push("/forgot-password")}
              />
              {env.googleWebClientId &&
              Platform.OS !== "web" &&
              (Platform.OS !== "ios" || env.googleIosClientId) ? (
                <Button
                  variant="secondary"
                  label="Continue with Google"
                  loading={busy}
                  onPress={() => void google()}
                />
              ) : null}
              <Button
                variant="outline"
                label="Create a Cake City account"
                onPress={() => router.push("/register")}
              />
            </>
          ) : null}
          {mode === "register" ? (
            <Text style={[ui.body, { fontSize: 12 }]}>
              By creating an account, you agree to Cake City’s{" "}
              <Link href="/legal" style={{ color: tokens.color.brandStrong }}>
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
