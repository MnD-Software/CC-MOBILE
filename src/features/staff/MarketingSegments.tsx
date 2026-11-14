import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { Skeleton } from "@/components/ui/Skeleton";
type Settings = {
  high_spender_minor: number;
  inactive_days: number;
  reminder_minutes: number;
  reminders_enabled: boolean;
};
export function MarketingSegments() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Settings | null>(null);
  const query = useQuery({
    queryKey: ["marketing-segments", customer?.id],
    queryFn: () =>
      api.get<{
        settings: Settings;
        segments: { id: string; label: string; count: number }[];
        definition: string;
      }>("/v1/admin/marketing/segments", { auth: true }),
  });
  const people = useQuery({
    queryKey: ["marketing-clients", customer?.id, segment, page],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          name: string;
          email: string;
          phone: string;
          segments: string[];
          purchases: number;
          net_spend_minor: number;
          marketing_consent: boolean;
        }[];
        has_more: boolean;
        total: number;
      }>(`/v1/admin/marketing/clients?segment=${segment}&page=${page}`, {
        auth: true,
      }),
  });
  const cfg = draft || query.data?.settings;
  if (query.isPending) return <Skeleton height={130} radius={20} />;
  if (query.isError)
    return (
      <Feedback error={query.error} onRetry={() => void query.refetch()} />
    );
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
        Know your customers
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
        {query.data?.definition}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {query.data?.segments.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: segment === s.id }}
            onPress={() => {
              setSegment(s.id);
              setPage(1);
            }}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor:
                segment === s.id ? colors.brandLight : colors.surfaceRaised,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              {s.label} {s.count}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Choose this audience in a campaign or discount editor. Segments update
        from order activity.
      </Text>
      {people.isPending ? (
        <Skeleton height={120} />
      ) : people.isError ? (
        <Feedback error={people.error} />
      ) : (
        <>
          <Text style={{ color: colors.muted }}>
            {people.data?.total} clients
          </Text>
          {people.data?.items.map((p) => (
            <View
              key={p.id}
              style={{
                padding: 15,
                borderRadius: 18,
                backgroundColor: colors.surfaceRaised,
                gap: 5,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: "800" }}>
                {p.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {p.email} {p.phone}
              </Text>
              <Text style={{ color: colors.brandStrong, fontSize: 12 }}>
                {p.purchases} purchases - KES {p.net_spend_minor / 100}{" "}
                collected net
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {p.marketing_consent
                  ? "Marketing opted in"
                  : "No marketing consent"}{" "}
                -{" "}
                {p.segments
                  .filter((s) => s !== "all")
                  .join(", ")
                  .replaceAll("_", " ")}
              </Text>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Previous"
              variant="outline"
              size="sm"
              disabled={page === 1}
              onPress={() => setPage((p) => p - 1)}
            />
            <Button
              label={`Next - page ${page}`}
              variant="outline"
              size="sm"
              disabled={!people.data?.has_more}
              onPress={() => setPage((p) => p + 1)}
            />
          </View>
        </>
      )}
      {cfg ? (
        <Disclosure title="Segment thresholds & checkout reminders">
          <View style={{ gap: 12 }}>
            {[
              ["high_spender_minor", "High spender threshold (KES)", 100],
              ["inactive_days", "Inactive after days", 1],
              ["reminder_minutes", "Checkout reminder after minutes", 1],
            ].map(([id, label, factor]) => (
              <Input
                key={String(id)}
                label={String(label)}
                value={String(
                  (cfg[id as keyof Settings] as number) / Number(factor),
                )}
                keyboardType="numeric"
                onChangeText={(value) =>
                  setDraft({ ...cfg, [id]: Number(value) * Number(factor) })
                }
              />
            ))}
            <Button
              label={
                cfg.reminders_enabled ? "Reminders enabled" : "Reminders paused"
              }
              variant="outline"
              onPress={() =>
                setDraft({ ...cfg, reminders_enabled: !cfg.reminders_enabled })
              }
            />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              One reminder per customer per day after a checkout quote. Only
              opted-in customers receive these. A running notification worker is
              required; phone push needs configured delivery.
            </Text>
            {error ? <Notice error message={error} /> : null}
            <Button
              label="Save settings"
              loading={saving}
              onPress={() => {
                setSaving(true);
                setError("");
                void api
                  .put("/v1/admin/marketing/settings", cfg, { auth: true })
                  .then(() => query.refetch())
                  .catch((e) => setError(e.message))
                  .finally(() => setSaving(false));
              }}
            />
          </View>
        </Disclosure>
      ) : null}
    </View>
  );
}
export function AdminFunnel() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["admin-funnel", customer?.id],
    enabled: ["admin", "staff", "ecommerce_manager"].includes(
      customer?.role || "",
    ),
    queryFn: () =>
      api.get<{
        stages: { id: string; label: string; count: number }[];
        definition: string;
      }>("/v1/admin/operations/funnel", { auth: true }),
    refetchInterval: 30000,
  });
  if (!query.data) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "800" }}>
        The whole operation
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {query.data.definition}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {query.data.stages.map((s) => (
          <View
            key={s.id}
            style={{
              width: "47%",
              padding: 16,
              borderRadius: 18,
              backgroundColor: colors.surfaceRaised,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: colors.brandStrong,
                fontSize: 25,
                fontWeight: "800",
              }}
            >
              {s.count}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 12 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
