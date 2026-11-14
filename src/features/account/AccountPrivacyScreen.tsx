import { PrivacyRights } from "./PrivacyRights";
import { useState } from "react";
import { BiometricSettings } from "@/auth/BiometricSettings";
import { Platform, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Notice, Screen } from "@/components/ui/Commerce";
import { Disclosure } from "@/components/ui/Disclosure";
import { usePreferences, useBag } from "@/features/commerce/store";
import { useTheme } from "@/theme/ThemeProvider";
import {
  clearBillingProfile,
  loadBillingProfile,
} from "@/features/commerce/billing-profile";

export function AccountPrivacyScreen() {
  const { customer, logout } = useAuth();
  const { colors } = useTheme();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const data = await api.get<Record<string, unknown>>(
        "/v1/account/export",
        { auth: true },
      );
      const prefs = usePreferences.getState();
      const owner = customer!.id;
      const value = JSON.stringify(
        {
          ...data,
          on_this_device: {
            billing: await loadBillingProfile(owner),
            favourites: prefs.savedProductSlugs,
            recently_viewed: prefs.recentSlugsByOwner[owner] ?? [],
            designs: prefs.designs[owner] ?? [],
          },
        },
        null,
        2,
      );
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([value], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "cake-city-account.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, "cake-city-account.json");
        file.create({ overwrite: true });
        file.write(value);
        try {
          if (!(await Sharing.isAvailableAsync()))
            throw new Error("Sharing is unavailable on this phone.");
          await Sharing.shareAsync(file.uri, {
            mimeType: "application/json",
            dialogTitle: "Save your Cake City data",
          });
        } finally {
          file.delete();
        }
      }
      setMessage("Your account export is ready. Keep it somewhere private.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not export your data.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    setError("");
    try {
      await api.post(
        "/v1/account/close",
        { password, confirmation },
        { auth: true },
      );
      const owner = customer!.id;
      const p = usePreferences.getState();
      const { [owner]: avatar, ...profileAvatars } = p.profileAvatars;
      const { [owner]: recent, ...recentSlugsByOwner } = p.recentSlugsByOwner;
      const { [owner]: design, ...designs } = p.designs;
      usePreferences.setState({
        profileAvatars,
        recentSlugsByOwner,
        designs,
        savedProductSlugs: [],
        recentSearches: [],
      });
      useBag.setState({ lines: [] });
      await clearBillingProfile(owner).catch(() => undefined);
      await logout();
      router.replace("/sign-in");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not close your account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Privacy & account" back>
      {customer ? (
        <>
          <BiometricSettings />
          <PrivacyRights />
        </>
      ) : null}
      {!customer ? (
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      ) : (
        <>
          <Text style={{ color: colors.ink, lineHeight: 23 }}>
            Download your app account details, orders, requests and points
            activity.
          </Text>
          <Button
            label="Download my account data"
            loading={busy}
            onPress={() => void download()}
          />
          <Disclosure title="Delete my account">
            <Text style={{ color: colors.ink, lineHeight: 23 }}>
              Deleting closes your account and removes saved addresses and
              celebrations. You will be signed out on every device. Order,
              payment, loyalty and support records remain for accounting,
              disputes and required retention. Active orders must be resolved
              first.
            </Text>
            <Text style={{ color: colors.muted, lineHeight: 21 }}>
              Download your data first if you want a copy. Staff and
              company-linked accounts require help from our team.
            </Text>
            <Input
              label="Current password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!busy}
              autoComplete="current-password"
            />
            <Input
              label="Type DELETE to confirm"
              value={confirmation}
              onChangeText={setConfirmation}
              editable={!busy}
              autoCapitalize="characters"
            />
            <Button
              label="Permanently delete my account"
              variant="danger"
              disabled={confirmation !== "DELETE" || !password || busy}
              onPress={() => void close()}
            />
          </Disclosure>
          <Button
            label="Contact privacy support"
            variant="outline"
            onPress={() =>
              router.push({
                pathname: "/requests",
                params: {
                  kind: "support",
                  details:
                    "I need help with my account privacy or deletion request.",
                },
              })
            }
          />
          {message ? <Notice message={message} /> : null}
          {error ? <Notice error message={error} /> : null}
        </>
      )}
    </Screen>
  );
}
