import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import type { Customer } from "@/auth/api";
import { profileInputSchema } from "@/auth/profile";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";

export function ProfileDetailsForm({ customer }: { customer: Customer }) {
  const { updateProfile } = useAuth();
  const { colors } = useTheme();
  const [first, setFirst] = useState(customer.first_name);
  const [last, setLast] = useState(customer.last_name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty =
    first !== customer.first_name ||
    last !== customer.last_name ||
    phone !== (customer.phone ?? "");
  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError("");
    setSaved(false);
  };
  const reset = () => {
    setFirst(customer.first_name);
    setLast(customer.last_name);
    setPhone(customer.phone ?? "");
    setError("");
    setSaved(false);
  };
  async function save() {
    const parsed = profileInputSchema.safeParse({
      first_name: first,
      last_name: last,
      phone,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await updateProfile(parsed.data);
      if (mounted.current) {
        setFirst(parsed.data.first_name);
        setLast(parsed.data.last_name);
        setPhone(parsed.data.phone ?? "");
        setSaved(true);
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Your details could not be saved. Please try again.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <View testID="profile-details-form" style={{ gap: tokens.space.lg }}>
      <Input
        label="First name"
        value={first}
        onChangeText={change(setFirst)}
        editable={!busy}
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={80}
      />
      <Input
        label="Last name"
        value={last}
        onChangeText={change(setLast)}
        editable={!busy}
        autoComplete="family-name"
        textContentType="familyName"
        maxLength={80}
      />
      <Input
        label="Contact phone (optional)"
        value={phone}
        onChangeText={change(setPhone)}
        editable={!busy}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={40}
        hint="Used as contact information. Changing this does not update existing orders or saved addresses."
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.error, lineHeight: 21 }}
        >
          {error}
        </Text>
      ) : null}
      {saved ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.success, lineHeight: 21 }}
        >
          Your details have been saved.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: tokens.space.md }}>
        <Button
          label="Discard changes"
          variant="outline"
          disabled={busy || !dirty}
          onPress={reset}
          style={{ flex: 1 }}
        />
        <Button
          label="Save details"
          loading={busy}
          disabled={!dirty}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
