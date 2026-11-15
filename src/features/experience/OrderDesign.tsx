import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Notice } from "@/components/ui/Commerce";
import { Disclosure } from "@/components/ui/Disclosure";
import { useScreenActive } from "@/design/useScreenActive";

export type Proof = {
  revision: number;
  state: string;
  description: string;
  image_data: string;
  customer_note: string;
  published_at: string;
};
export function OrderDesign({ reference }: { reference: string }) {
  const { customer } = useAuth(),
    { colors } = useTheme();
  const active = useScreenActive();
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["order-design", customer?.id, reference],
    queryFn: () =>
      api.get<Proof | null>(`/v1/journey/orders/${reference}/design`, {
        auth: true,
      }),
    enabled: !!customer && active,
    refetchInterval: active ? 30000 : false,
    retry: false,
  });
  const proof = query.data;
  if (!proof) return null;
  async function decide(decision: "approved" | "changes_requested") {
    if (busy || !proof) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/v1/journey/orders/${reference}/design`,
        { revision: proof.revision, decision, note: note.trim() },
        { auth: true },
      );
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 22,
        gap: 12,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor:
          proof.state === "approved" ? colors.success : colors.border,
      }}
    >
      <Text
        style={{
          color: proof.state === "approved" ? colors.success : colors.ink,
          fontWeight: "800",
          fontSize: 18,
        }}
      >
        {proof.state === "approved"
          ? "Design approved"
          : proof.state === "changes_requested"
            ? "Changes sent to the kitchen"
            : "Your cake, before we create it"}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Design version {proof.revision}
      </Text>
      {proof.image_data ? (
        <LoadingImage
          source={{ uri: proof.image_data }}
          contentFit="contain"
          style={{ width: "100%", height: 220, borderRadius: 16 }}
          accessibilityLabel="Your cake design for approval"
        />
      ) : null}
      <Text style={{ color: colors.ink, lineHeight: 22 }}>
        {proof.description}
      </Text>
      {error ? <Notice error message={error} /> : null}
      {proof.state === "awaiting_approval" ? (
        <>
          <Button
            label="Approve this design"
            disabled={busy}
            loading={busy}
            onPress={() => void decide("approved")}
          />
          <Disclosure title="Request a change">
            <Input
              label="What should we change?"
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={1000}
              editable={!busy}
            />
            <Button
              variant="outline"
              label="Send changes"
              disabled={busy || note.trim().length < 5}
              onPress={() => void decide("changes_requested")}
            />
          </Disclosure>
        </>
      ) : proof.customer_note ? (
        <Text style={{ color: colors.muted }}>{proof.customer_note}</Text>
      ) : null}
    </View>
  );
}
