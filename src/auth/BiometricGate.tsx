import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "./AuthProvider";
import {
  disableBiometricUnlock,
  recentlyUnlocked,
  unlockDevice,
  useBiometricPreference,
} from "./biometrics";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
export function BiometricGate({ children }: PropsWithChildren) {
  const { customer, logout } = useAuth();
  const { colors } = useTheme();
  const pref = useBiometricPreference(customer?.id);
  const [locked, setLocked] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const away = useRef(0);
  const currentOwner = useRef(customer?.id);
  currentOwner.current = customer?.id;
  useEffect(() => {
    setBusy(false);
    away.current = 0;
  }, [customer?.id]);
  useEffect(() => {
    setLocked(!customer || !recentlyUnlocked(customer.id));
    setError("");
  }, [customer?.id, pref.enabled]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") away.current = Date.now();
      if (
        state === "active" &&
        pref.enabled &&
        away.current &&
        Date.now() - away.current >= 60000
      ) {
        setLocked(true);
        away.current = 0;
      }
    });
    return () => sub.remove();
  }, [pref.enabled]);
  const covered = !!customer && (!pref.ready || (pref.enabled && locked));
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1, opacity: covered ? 0 : 1 }}
        pointerEvents={covered ? "none" : "auto"}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {covered ? (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            gap: 20,
          }}
        >
          <BrandLogo width={140} />
          <Text style={{ fontSize: 27, fontWeight: "800", color: colors.ink }}>
            Welcome back.
          </Text>
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            Unlock your Cake City account with your phone.
          </Text>
          {error ? (
            <Text style={{ color: colors.brandStrong }}>{error}</Text>
          ) : null}
          <Button
            label="Use Face ID / fingerprint"
            loading={busy}
            disabled={!pref.ready || busy}
            onPress={() => {
              const owner = customer!.id;
              setBusy(true);
              setError("");
              void unlockDevice(owner)
                .then(() => {
                  if (currentOwner.current === owner) setLocked(false);
                })
                .catch((e) => {
                  if (currentOwner.current === owner)
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Unlock could not be completed.",
                    );
                })
                .finally(() => {
                  if (currentOwner.current === owner) setBusy(false);
                });
            }}
          />
          <Button
            variant="ghost"
            label="Sign in with account password"
            onPress={() => {
              const owner = customer!.id;
              void logout()
                .then(() => disableBiometricUnlock(owner))
                .catch(() => {
                  setError(
                    "Your device could not finish signing out. Please retry.",
                  );
                });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
