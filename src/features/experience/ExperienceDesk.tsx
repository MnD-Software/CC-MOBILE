import { useState } from "react";
import { View, Pressable, Switch } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CampaignDateField } from "@/components/ui/CampaignDateField";
import type { Slot } from "./FulfilmentSlots";

const managers = ["admin", "staff", "ecommerce_manager"];
const slotStaff = [...managers, "dispatch"];
const careRoles = [
  ...managers,
  "call_center_manager",
  "call_center_agent",
  "customer_service",
  "sales",
];
const marketingRoles = [...managers, "marketing_manager", "content_manager"];
type Care = {
  id: string;
  reference: string;
  state: string;
  due_at: string;
  agent_id: string | null;
  revision: number;
  reply: string;
  feedback: {
    rating: number;
    condition: string;
    timing: string;
    comment: string;
  };
};
type Promo = {
  code: string;
  title: string;
  orders: number;
  first_buyers: number;
  repeat_buyers: number;
  review_orders: number;
  net_collected_minor: number;
  discount_minor: number;
};
export function ExperienceDesk() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const role = customer?.role || "";
  const tabs = [
    ...(role !== "marketing_manager" && role !== "content_manager"
      ? ["attention"]
      : []),
    ...(careRoles.includes(role) ? ["care"] : []),
    ...(slotStaff.includes(role) ? ["slots"] : []),
    ...(marketingRoles.includes(role) ? ["results"] : []),
  ];
  const [tab, setTab] = useState(tabs[0] || "attention"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [care, setCare] = useState<Care | null>(null),
    [reply, setReply] = useState(""),
    [slot, setSlot] = useState<Partial<Slot> | null>(null);
  const [override, setOverride] = useState<Slot | null>(null),
    [reason, setReason] = useState(""),
    [places, setPlaces] = useState("1");
  const suffix =
    tab === "attention"
      ? "exceptions"
      : tab === "results"
        ? "promotion-results"
        : tab;
  const query = useQuery({
    queryKey: ["experience-desk", customer?.id, tab],
    queryFn: () =>
      api.get<unknown>(`/v1/experience/staff/${suffix}`, { auth: true }),
    enabled: !!customer && tabs.includes(tab),
    refetchInterval: 30000,
  });
  const panel = {
    padding: 18,
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  } as const;
  async function work(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await cache.invalidateQueries({
        queryKey: ["experience-desk", customer?.id],
      });
      setCare(null);
      setSlot(null);
      setOverride(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const slots =
    tab === "slots" && Array.isArray(query.data) ? (query.data as Slot[]) : [];
  return (
    <View style={{ gap: 16 }}>
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {tabs.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{
              padding: 14,
              borderRadius: 16,
              backgroundColor:
                tab === t ? colors.brandLight : colors.surfaceRaised,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              {
                {
                  attention: "Attention",
                  care: "Customer care",
                  slots: "Time slots",
                  results: "Promotion results",
                }[t as "care"]
              }
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Notice error message={error} /> : null}
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {tab === "attention" ? (
            <>
              <Notice message="Alerts use a 15-minute kitchen assignment threshold, 60 minutes without a trip update and a 24-hour care response target. These are operational prompts, not promised arrival times." />
              {(
                (
                  query.data as {
                    items: {
                      reference: string;
                      kind: string;
                      label: string;
                      minutes: number;
                    }[];
                  }
                )?.items || []
              ).map((a, i) => (
                <View key={a.reference + a.kind + i} style={panel}>
                  <Text style={{ color: colors.warning, fontWeight: "800" }}>
                    {a.label}
                  </Text>
                  <Text style={{ color: colors.ink }}>{a.reference}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {a.minutes} minutes
                  </Text>
                </View>
              ))}
              {!(query.data as { items: unknown[] })?.items?.length ? (
                <Notice message="No exceptions in your authorised workload." />
              ) : null}
            </>
          ) : null}
          {tab === "care" ? (
            (query.data as Care[])?.length ? (
              (query.data as Care[]).map((c) => (
                <View key={c.id} style={panel}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontWeight: "800",
                      fontSize: 17,
                    }}
                  >
                    {c.reference}
                  </Text>
                  <Text
                    style={{
                      color:
                        new Date(c.due_at) < new Date()
                          ? colors.error
                          : colors.muted,
                    }}
                  >
                    Respond by {new Date(c.due_at).toLocaleString()}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    {c.feedback.rating}/5 · {c.feedback.condition} ·{" "}
                    {c.feedback.timing}
                  </Text>
                  <Text style={{ color: colors.ink }}>
                    {c.feedback.comment}
                  </Text>
                  <Button
                    size="sm"
                    label="Follow up"
                    onPress={() => {
                      setCare(c);
                      setReply(c.reply);
                    }}
                  />
                </View>
              ))
            ) : (
              <Notice message="No open delivery-care cases." />
            )
          ) : null}
          {tab === "results" ? (
            <>
              <Notice
                message={
                  (query.data as { definition: string })?.definition ||
                  "Verified app collections only."
                }
              />
              {((query.data as { items: Promo[] })?.items || []).map((p) => (
                <View key={p.code} style={panel}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontWeight: "800",
                      fontSize: 18,
                    }}
                  >
                    {p.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.brandStrong,
                      fontSize: 24,
                      fontWeight: "800",
                    }}
                  >
                    KES {(p.net_collected_minor / 100).toLocaleString()}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Net collections · {p.orders} paid orders
                  </Text>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <Text style={{ color: colors.ink }}>
                      {p.first_buyers} first-time buyers
                    </Text>
                    <Text style={{ color: colors.ink }}>
                      {p.repeat_buyers} returning
                    </Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Discounts KES {(p.discount_minor / 100).toLocaleString()} ·{" "}
                    {p.review_orders} review orders separately
                  </Text>
                </View>
              ))}
            </>
          ) : null}
          {tab === "slots" ? (
            <>
              <Notice message="Create only the windows your kitchen and dispatch team can fulfil. Capacity is a number of orders. Booked windows cannot be moved; contact affected clients for changes." />
              <Button
                label="Add a fulfilment window"
                onPress={() =>
                  setSlot({
                    id: randomUUID(),
                    label: "",
                    fulfilment: "delivery",
                    capacity: 10,
                    revision: 0,
                    enabled: true,
                  })
                }
              />
              {slots.map((s) => (
                <View key={s.id} style={panel}>
                  <Text style={{ color: colors.ink, fontWeight: "800" }}>
                    {s.label}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    {new Date(s.starts_at).toLocaleString()} · {s.fulfilment}
                  </Text>
                  <Text
                    style={{
                      color:
                        s.full || s.booking_closed
                          ? colors.error
                          : colors.success,
                      fontWeight: "700",
                    }}
                  >
                    {s.remaining}/{s.capacity} places free ·{" "}
                    {s.full
                      ? "Full"
                      : s.booking_closed
                        ? "Booking closed"
                        : s.enabled
                          ? "Open"
                          : "Closed"}
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    label="Manage capacity"
                    onPress={() => setSlot(s)}
                  />
                  {role === "dispatch" && !s.booking_closed && s.enabled ? (
                    <Button
                      label={
                        s.full
                          ? "Override full window"
                          : "Add capacity with reason"
                      }
                      size="sm"
                      onPress={() => {
                        setOverride(s);
                        setReason("");
                        setPlaces("1");
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
      <BottomSheet
        visible={!!override}
        title="Dispatch Manager override"
        onClose={() => setOverride(null)}
      >
        {override ? (
          <View style={{ gap: 16 }}>
            <Notice message="Confirm kitchen and rider capacity first. This opens extra booking places; your reason is recorded in the audit trail." />
            <Input
              label="Extra order places"
              keyboardType="numeric"
              value={places}
              onChangeText={setPlaces}
            />
            <Input
              label="Reason for override"
              multiline
              value={reason}
              onChangeText={setReason}
              maxLength={1000}
            />
            <Button
              label="Confirm capacity override"
              loading={busy}
              onPress={() =>
                void work(() =>
                  api.post(
                    `/v1/experience/staff/slots/${override.id}/override`,
                    {
                      revision: override.revision,
                      extra_places: Number(places),
                      reason,
                    },
                    { auth: true },
                  ),
                )
              }
            />
            {error ? <Notice error message={error} /> : null}
          </View>
        ) : null}
      </BottomSheet>
      <BottomSheet
        visible={!!care}
        title="Customer-care follow-up"
        onClose={() => setCare(null)}
      >
        {care ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: colors.muted }}>
              Your response is visible to the customer. Confirm the outcome
              before resolving.
            </Text>
            <Input
              multiline
              label="Customer update"
              value={reply}
              onChangeText={setReply}
              maxLength={1500}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {["contacted", "resolved"].map((state) => (
                <View key={state} style={{ flex: 1 }}>
                  <Button
                    loading={busy}
                    label={state === "contacted" ? "Send update" : "Resolve"}
                    onPress={() =>
                      void work(() =>
                        api.put(
                          `/v1/experience/staff/care/${care.id}`,
                          { state, reply, revision: care.revision },
                          { auth: true },
                        ),
                      )
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </BottomSheet>
      <BottomSheet
        visible={!!slot}
        title="Fulfilment capacity"
        onClose={() => setSlot(null)}
      >
        {slot ? (
          <View style={{ gap: 14 }}>
            <Input
              label="Window label"
              value={slot.label || ""}
              onChangeText={(label) => setSlot({ ...slot, label })}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["delivery", "pickup"] as const).map((fulfilment) => (
                <Button
                  key={fulfilment}
                  label={fulfilment === "delivery" ? "Delivery" : "Pickup"}
                  variant={
                    slot.fulfilment === fulfilment ? "primary" : "outline"
                  }
                  onPress={() => setSlot({ ...slot, fulfilment })}
                />
              ))}
            </View>
            {(
              [
                ["cutoff_at", "Order cutoff"],
                ["starts_at", "Window starts"],
                ["ends_at", "Window ends"],
              ] as const
            ).map(([key, label]) => (
              <CampaignDateField
                key={key}
                label={label}
                value={slot[key] || ""}
                onChange={(value) => setSlot({ ...slot, [key]: value })}
              />
            ))}
            <Input
              label="Order capacity"
              value={String(slot.capacity || "")}
              keyboardType="numeric"
              onChangeText={(value) =>
                setSlot({ ...slot, capacity: Number(value) })
              }
            />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Text style={{ color: colors.ink }}>Accept bookings</Text>
              <Switch
                accessibilityLabel="Accept bookings in this window"
                value={slot.enabled ?? true}
                onValueChange={(enabled) => setSlot({ ...slot, enabled })}
              />
            </View>
            <Button
              label="Save window"
              loading={busy}
              onPress={() =>
                void work(() =>
                  api.put(
                    `/v1/experience/staff/slots/${slot.id}`,
                    {
                      label: slot.label,
                      fulfilment: slot.fulfilment,
                      starts_at: slot.starts_at,
                      ends_at: slot.ends_at,
                      cutoff_at: slot.cutoff_at,
                      capacity: slot.capacity,
                      enabled: slot.enabled,
                      revision: slot.revision || 0,
                    },
                    { auth: true },
                  ),
                )
              }
            />
            {error ? <Notice error message={error} /> : null}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
