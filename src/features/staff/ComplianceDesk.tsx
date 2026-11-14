import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback, Notice } from "@/components/ui/Commerce";
type Data = {
  settings: Record<string, string | boolean>;
  etims: { state: string; requires: string[] };
  tax_requests: { reference: string; buyer_pin: string; state: string }[];
  privacy_requests: {
    id: string;
    kind: string;
    status: string;
    details: string;
    response?: string;
  }[];
};
export function ComplianceDesk() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(
    null,
  );
  const [response, setResponse] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["compliance", customer?.id],
    queryFn: () => api.get<Data>("/v1/admin/compliance", { auth: true }),
  });
  async function work(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  if (!query.data)
    return (
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const cfg = draft || query.data.settings;
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "800" }}>
        Tax & privacy desk
      </Text>
      <Notice message="eTIMS is not connected. PIN capture and operational records do not constitute KRA certification or legal approval." />
      {query.data.etims.requires.map((v) => (
        <Text key={v} style={{ color: colors.muted }}>
          {v}
        </Text>
      ))}
      <Disclosure title="Business & data protection configuration">
        <View style={{ gap: 12 }}>
          {Object.entries(cfg)
            .filter(([k]) => k !== "policy_reviewed")
            .map(([k, v]) => (
              <Input
                key={k}
                label={k.replaceAll("_", " ")}
                value={String(v)}
                multiline={
                  k.includes("policy") ||
                  k.includes("register") ||
                  k.includes("purposes") ||
                  k.includes("plan")
                }
                onChangeText={(value) => setDraft({ ...cfg, [k]: value })}
              />
            ))}
          <Button
            label={
              cfg.policy_reviewed
                ? "Policy marked reviewed"
                : "Mark policy reviewed"
            }
            variant="outline"
            onPress={() =>
              setDraft({ ...cfg, policy_reviewed: !cfg.policy_reviewed })
            }
          />
          <Button
            label="Save operational settings"
            loading={busy}
            onPress={() =>
              void work(() =>
                api.put("/v1/admin/compliance/settings", cfg, { auth: true }),
              )
            }
          />
        </View>
      </Disclosure>
      <Disclosure
        title={`Buyer PIN requests (${query.data.tax_requests.length})`}
      >
        <View style={{ gap: 12 }}>
          {query.data.tax_requests.map((r) => (
            <Text key={r.reference} style={{ color: colors.ink }}>
              {r.reference} - {r.buyer_pin} - {r.state}
            </Text>
          ))}
        </View>
      </Disclosure>
      <Text style={{ color: colors.ink, fontWeight: "800" }}>
        Privacy requests
      </Text>
      {query.data.privacy_requests.map((r) => (
        <View
          key={r.id}
          style={{
            padding: 16,
            borderRadius: 20,
            backgroundColor: colors.surfaceRaised,
            gap: 10,
          }}
        >
          <Text style={{ color: colors.ink, fontWeight: "800" }}>
            {r.kind} - {r.status}
          </Text>
          <Text style={{ color: colors.muted }}>{r.details}</Text>
          {r.response ? (
            <Text style={{ color: colors.ink }}>{r.response}</Text>
          ) : null}
          <Input
            label="Response to customer"
            multiline
            value={response[r.id] || ""}
            onChangeText={(v) => setResponse((s) => ({ ...s, [r.id]: v }))}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["reviewing", "fulfilled", "declined"].map((status) => (
              <Button
                key={status}
                label={status}
                variant="outline"
                size="sm"
                disabled={busy || (response[r.id] || "").trim().length < 10}
                onPress={() =>
                  void work(() =>
                    api.patch(
                      `/v1/admin/compliance/privacy/${r.id}`,
                      { status, response: response[r.id] },
                      { auth: true },
                    ),
                  )
                }
              />
            ))}
          </View>
        </View>
      ))}
      {error ? <Notice error message={error} /> : null}
    </View>
  );
}
