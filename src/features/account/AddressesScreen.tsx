import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  AccountRequired,
  Feedback,
  Chip,
  Section,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { customerApi } from "@/features/commerce/api";
import type { SavedAddress } from "@/features/commerce/contracts";
export function AddressesScreen() {
  return (
    <Screen title="Your happy places." back>
      <AccountRequired>
        <AddressList />
      </AccountRequired>
    </Screen>
  );
}
function AddressList() {
  const { customer } = useAuth();
  const cache = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blank: Omit<SavedAddress, "id"> = {
    label: "Home",
    recipient_name: [customer?.first_name, customer?.last_name]
      .filter(Boolean)
      .join(" "),
    phone: customer?.phone ?? "",
    line1: "",
    line2: "",
    area: "",
    city: "Nairobi",
    delivery_notes: "",
    is_default: false,
  };
  const [form, setForm] = useState(blank);
  const query = useQuery({
    queryKey: ["addresses", customer?.id],
    queryFn: customerApi.addresses,
  });
  async function save() {
    setBusy(true);
    try {
      if (
        !form.label.trim() ||
        form.recipient_name.trim().length < 2 ||
        form.line1.trim().length < 3 ||
        form.area.trim().length < 2 ||
        form.city.trim().length < 2 ||
        !/^(?:\+?254|0)[17]\d{8}$/.test(form.phone.replace(/\s/g, ""))
      )
        throw new Error(
          "Check your name, full address and Kenyan phone number.",
        );
      await customerApi.saveAddress(form, editing?.id);
      await cache.invalidateQueries({ queryKey: ["addresses"] });
      setOpen(false);
      toast("Address saved for next time.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Address could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {query.data?.map((a) => (
        <View key={a.id} style={ui.panel}>
          <View style={ui.spread}>
            <Text style={ui.heading}>{a.label}</Text>
            {a.is_default ? <Text style={ui.eyebrow}>DEFAULT</Text> : null}
          </View>
          <Text style={ui.label}>
            {a.recipient_name} · {a.phone}
          </Text>
          <Text style={ui.body}>
            {[a.line1, a.line2, a.area, a.city].filter(Boolean).join(", ")}
          </Text>
          {a.delivery_notes ? (
            <Text style={ui.body}>{a.delivery_notes}</Text>
          ) : null}
          <View style={ui.row}>
            <Button
              variant="outline"
              label="Edit"
              onPress={() => {
                setEditing(a);
                setForm(a);
                setOpen(true);
              }}
            />
            <Button
              variant="ghost"
              label="Delete"
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await customerApi.deleteAddress(a.id);
                  await query.refetch();
                } catch (e) {
                  toast(
                    e instanceof Error
                      ? e.message
                      : "Could not delete address.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </View>
      ))}
      <Button
        label="Add an address"
        onPress={() => {
          setEditing(null);
          setForm(blank);
          setOpen(true);
        }}
      />
      {open ? (
        <View style={ui.panel}>
          <Section title={editing ? "Edit address" : "A new happy place"} />
          {(
            [
              ["label", "Label"],
              ["recipient_name", "Recipient name"],
              ["phone", "Phone"],
              ["line1", "Building, street and apartment"],
              ["line2", "Additional address details"],
              ["area", "Area"],
              ["city", "City"],
              ["delivery_notes", "Delivery notes"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={form[key] ?? ""}
              onChangeText={(value) => setForm((f) => ({ ...f, [key]: value }))}
              keyboardType={key === "phone" ? "phone-pad" : "default"}
              maxLength={key === "delivery_notes" ? 500 : 240}
            />
          ))}
          <Chip
            label={
              form.is_default ? "Default address ✓" : "Make default address"
            }
            selected={form.is_default}
            onPress={() =>
              setForm((f) => ({ ...f, is_default: !f.is_default }))
            }
          />
          <Button
            label="Save address"
            loading={busy}
            onPress={() => void save()}
          />
          <Button
            variant="ghost"
            label="Cancel"
            onPress={() => setOpen(false)}
          />
        </View>
      ) : null}
    </>
  );
}
