import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "./AuthProvider";
import { useBiometricPreference } from "./biometrics";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
export function BiometricSettings() {
  const { customer } = useAuth();
  const pref = useBiometricPreference(customer?.id);
  const { colors } = useTheme();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}>
        Quick, private sign-in
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
        Your session stays signed in securely. Optionally protect the app with
        Face ID, fingerprint or your phone passcode after reopening it. Your
        face, fingerprints and password are never stored by Cake City on this
        device.
      </Text>
      <Button
        label={
          pref.enabled
            ? "Turn off biometric unlock"
            : "Enable Face ID / fingerprint"
        }
        variant="outline"
        disabled={!pref.ready || busy}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void pref
            .setEnabled(!pref.enabled)
            .then(() =>
              setMessage("Your unlock preference is saved on this phone."),
            )
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      />
      {message ? (
        <Text style={{ color: colors.brandStrong, fontSize: 12 }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
