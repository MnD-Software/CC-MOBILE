import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice, Screen } from "@/components/ui/Commerce";
import {
  loadBillingProfile,
  saveBillingProfile,
  type BillingProfile,
} from "./billing-profile";

export function BillingDetailsScreen() {
  const { customer } = useAuth();
  return (
    <Screen
      title="Billing details"
      subtitle="Save your details before checkout."
      back
    >
      {customer ? (
        <BillingForm key={customer.id} customer={customer} />
      ) : (
        <>
          <Notice message="Sign in to save your own billing details on this device." />
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        </>
      )}
    </Screen>
  );
}

function BillingForm({
  customer,
}: {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string | null;
  };
}) {
  const [value, setValue] = useState<BillingProfile>({
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email,
    phone: customer.phone ?? "",
    address: "",
    area: "",
    city: "Nairobi",
    postcode: "",
    kraPin: "",
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void loadBillingProfile(customer.id)
      .then((saved) => {
        if (active.current && saved) setValue(saved);
      })
      .finally(() => {
        if (active.current) setReady(true);
      });
    return () => {
      active.current = false;
    };
  }, [customer.id]);
  async function save() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveBillingProfile(customer.id, value);
      if (active.current)
        setMessage(
          Platform.OS === "web"
            ? "Billing details saved for this browser session."
            : "Billing details saved securely on this device. They will fill your next checkout.",
        );
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Billing details could not be saved. Please try again.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Notice message="These details are saved separately from payment. Saving does not place an order or charge you." />
      {(
        [
          ["firstName", "First name"],
          ["lastName", "Last name"],
          ["email", "Billing email"],
          ["phone", "Phone number"],
          ["address", "Billing address"],
          ["area", "Area"],
          ["city", "City"],
          ["postcode", "Postal code"],
          ["kraPin", "KRA PIN (optional)"],
        ] as const
      ).map(([key, label]) => (
        <Input
          key={key}
          label={label}
          value={value[key]}
          editable={ready && !busy}
          keyboardType={
            key === "email"
              ? "email-address"
              : key === "phone"
                ? "phone-pad"
                : key === "postcode"
                  ? "number-pad"
                  : "default"
          }
          autoComplete={key === "postcode" ? "postal-code" : undefined}
          maxLength={key === "postcode" ? 5 : key === "kraPin" ? 11 : undefined}
          hint={
            key === "postcode"
              ? "Enter the postal code for your address."
              : undefined
          }
          autoCapitalize={
            key === "email"
              ? "none"
              : key === "kraPin"
                ? "characters"
                : "sentences"
          }
          onChangeText={(text) => {
            setValue((current) => ({ ...current, [key]: text }));
            setMessage("");
            setError("");
          }}
        />
      ))}
      {error ? <Notice error message={error} /> : null}
      {message ? <Notice message={message} /> : null}
      <Button
        label="Save billing details"
        loading={busy}
        disabled={!ready}
        onPress={() => void save()}
      />
    </View>
  );
}
