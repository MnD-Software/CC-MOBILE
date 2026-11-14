import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CampaignDateField } from "@/components/ui/CampaignDateField";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { OrderJourney } from "@/features/commerce/OrderJourney";
import { appOrderSchema } from "@/features/commerce/app-orders";
import { exportExcel, shareBusinessDocument } from "./report-export";
type Case = {
  kind: "order" | "enquiry";
  identity: string;
  title: string;
  status: string;
  agent_id: string | null;
  agent_name: string | null;
  revision: number;
  priority: "normal" | "urgent";
  follow_up_at: string | null;
  order_value_minor: number | null;
};
type Detail = Case & {
  checkout_contacts?: Record<string, string>;
  recipient?: Record<string, string>;
  customer: { name: string; phone: string; email: string };
  notes: {
    id: string;
    actor: string;
    at: string;
    department: string;
    note: string;
  }[];
  order?: unknown;
  production?: { plant: string; assigned_to: string };
  enquiry?: {
    id: string;
    revision: number;
    status: string;
    details: string;
    staff_response: string;
  };
  enquiries?: {
    id: string;
    subject: string;
    status: string;
    details: string;
  }[];
  order_reference?: string;
};
export function ServiceDesk() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [kind, setKind] = useState<"order" | "enquiry">("order"),
    [scope, setScope] = useState("mine"),
    [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Case | null>(null),
    [note, setNote] = useState(""),
    [reply, setReply] = useState(""),
    [department, setDepartment] = useState("agent"),
    [priority, setPriority] = useState<"normal" | "urgent">("normal"),
    [assigned, setAssigned] = useState(""),
    [followup, setFollowup] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["service-desk", customer?.id, kind, scope, submitted, page],
    queryFn: ({ signal }) =>
      api.get<{ items: Case[]; has_more: boolean }>(
        `/v1/service-desk/records?${new URLSearchParams({ kind, scope, search: submitted, page: String(page) })}`,
        { auth: true, signal },
      ),
    refetchInterval: 15000,
  });
  const detail = useQuery({
    queryKey: [
      "service-detail",
      customer?.id,
      selected?.identity,
      selected?.kind,
    ],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      api.get<Detail>(
        `/v1/service-desk/records/${selected!.kind}/${encodeURIComponent(selected!.identity)}`,
        { auth: true, signal },
      ),
    refetchInterval: selected ? 15000 : false,
  });
  const agents = useQuery({
    queryKey: ["service-agents", customer?.id],
    queryFn: ({ signal }) =>
      api.get<{ id: string; name: string }[]>("/v1/service-desk/agents", {
        auth: true,
        signal,
      }),
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["service-desk"] }),
        cache.invalidateQueries({ queryKey: ["service-detail"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };
  const open = (item: Case) => {
    setSelected(item);
    setNote("");
    setReply("");
    setAssigned(item.agent_id || customer?.id || "");
    setPriority(item.priority);
    setFollowup(
      item.follow_up_at ? new Date(item.follow_up_at).toISOString() : "",
    );
    setDepartment("agent");
    setError("");
  };
  const choose = (
    values: string[],
    current: string,
    change: (v: string) => void,
  ) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === v }}
          onPress={() => change(v)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 15,
            backgroundColor:
              current === v ? colors.brandLight : colors.surfaceRaised,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "700" }}>
            {v.replaceAll("_", " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      {choose(["order", "enquiry"], kind, (v) => {
        setKind(v as "order" | "enquiry");
        setPage(1);
      })}
      {choose(["mine", "unassigned", "all"], scope, (v) => {
        setScope(v);
        setPage(1);
      })}
      <Input
        label="Find an order reference or enquiry subject"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => {
          setSubmitted(search);
          setPage(1);
        }}
        returnKeyType="search"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Search"
          size="sm"
          onPress={() => {
            setSubmitted(search);
            setPage(1);
          }}
        />
        <Button
          label="My assisted-order report"
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void run(() =>
              exportExcel("/v1/service-desk/report.xlsx", "assisted-orders"),
            )
          }
        />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Claim an unassigned request to handle it. Kitchen, dispatch, customer
        acknowledgement and receipts follow the same order.
      </Text>
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data?.items.length ? (
        query.data.items.map((item) => (
          <View
            key={item.identity}
            style={{
              padding: 17,
              gap: 9,
              borderRadius: 21,
              borderWidth: 1,
              borderColor:
                item.priority === "urgent" ? colors.brandStrong : colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "800" }}>
              {item.title}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {item.status.replaceAll("_", " ")} ·{" "}
              {item.agent_name || "Awaiting an agent"}
              {item.priority === "urgent" ? " · Urgent" : ""}
            </Text>
            {item.follow_up_at ? (
              <Text style={{ color: colors.brandStrong, fontSize: 12 }}>
                Follow-up {new Date(item.follow_up_at).toLocaleString()}
              </Text>
            ) : null}
            <Button
              size="sm"
              label={item.agent_id ? "Open case" : "Claim & open"}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!item.agent_id) {
                    const claimed = await api.put<Case>(
                      `/v1/service-desk/records/${item.kind}/${encodeURIComponent(item.identity)}`,
                      { revision: item.revision },
                      { auth: true },
                    );
                    open(claimed);
                  } else open(item);
                })
              }
            />
          </View>
        ))
      ) : (
        <Notice message="No requests in this queue. Choose Unassigned to pick up a new case." />
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {page > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            label="Previous"
            onPress={() => setPage((p) => p - 1)}
          />
        ) : null}
        {query.data?.has_more ? (
          <Button
            size="sm"
            variant="ghost"
            label="Next"
            onPress={() => setPage((p) => p + 1)}
          />
        ) : null}
      </View>
      {error ? <Notice error message={error} /> : null}
      <BottomSheet
        visible={!!selected}
        title={selected?.title || "Agent desk"}
        onClose={() => setSelected(null)}
      >
        {detail.isPending ? (
          <Feedback loading />
        ) : detail.isError ? (
          <Feedback
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />
        ) : detail.data ? (
          <View style={{ gap: 14 }}>
            <Text
              style={{ color: colors.ink, fontSize: 18, fontWeight: "800" }}
            >
              {detail.data.customer.name}
            </Text>
            <Text selectable style={{ color: colors.muted }}>
              {detail.data.customer.email}
            </Text>
            {detail.data.checkout_contacts ? (
              <View
                style={{
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: colors.surfaceRaised,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: "700" }}>
                  Order purchaser
                </Text>
                <Text selectable style={{ color: colors.muted }}>
                  {[
                    detail.data.checkout_contacts.first_name,
                    detail.data.checkout_contacts.last_name,
                    detail.data.checkout_contacts.email,
                    detail.data.checkout_contacts.phone,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </Text>
                {detail.data.checkout_contacts.phone ? (
                  <Button
                    label="Call order contact"
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      void Linking.openURL(
                        "tel:" +
                          detail.data!.checkout_contacts!.phone.replace(
                            /[^+0-9]/g,
                            "",
                          ),
                      )
                    }
                  />
                ) : null}
                {detail.data.recipient?.recipient_name ? (
                  <Text selectable style={{ color: colors.muted }}>
                    Recipient: {detail.data.recipient.recipient_name} -{" "}
                    {detail.data.recipient.recipient_phone}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {detail.data.customer.phone ? (
              <Button
                size="sm"
                variant="outline"
                label="Call customer"
                onPress={() =>
                  void Linking.openURL(
                    `tel:${detail.data!.customer.phone.replace(/[^+0-9]/g, "")}`,
                  )
                }
              />
            ) : null}
            {detail.data.order ? (
              <>
                <OrderJourney
                  order={appOrderSchema.parse(detail.data.order)}
                  refresh={() => void detail.refetch()}
                  refreshing={detail.isFetching}
                />
                <Button
                  size="sm"
                  label="Share customer receipt"
                  variant="outline"
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      shareBusinessDocument(
                        `/v1/service-desk/orders/${encodeURIComponent(detail.data!.identity)}/receipt`,
                      ),
                    )
                  }
                />
                {detail.data.production ? (
                  <Text style={{ color: colors.muted }}>
                    Production: {detail.data.production.plant}
                  </Text>
                ) : null}
                {detail.data.enquiries?.map((e) => (
                  <Text key={e.id} style={{ color: colors.muted }}>
                    {e.subject} · {e.status}
                    {"\n"}
                    {e.details}
                  </Text>
                ))}
              </>
            ) : null}
            {detail.data.enquiry ? (
              <>
                <Text style={{ color: colors.ink }}>
                  {detail.data.enquiry.details}
                </Text>
                {detail.data.enquiry.staff_response ? (
                  <Notice message={detail.data.enquiry.staff_response} />
                ) : null}
                <Input
                  label="Reply to the customer"
                  multiline
                  value={reply}
                  onChangeText={setReply}
                  maxLength={4000}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {["reviewing", "resolved"].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      label={
                        status === "resolved"
                          ? "Resolve & notify"
                          : "Reply & notify"
                      }
                      disabled={
                        busy ||
                        reply.trim().length < 3 ||
                        ["accepted", "resolved", "declined"].includes(
                          detail.data!.enquiry!.status,
                        )
                      }
                      onPress={() =>
                        void run(async () => {
                          await api.patch(
                            `/v1/admin/enquiries/${detail.data!.enquiry!.id}`,
                            {
                              revision: detail.data!.enquiry!.revision,
                              status,
                              response: reply,
                            },
                            { auth: true },
                          );
                          setReply("");
                        })
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}
            <Text style={{ color: colors.ink, fontWeight: "700" }}>
              Internal handoff & follow-up
            </Text>
            {choose(
              selected?.kind === "order"
                ? ["agent", "kitchen", "dispatch"]
                : ["agent"],
              department,
              setDepartment,
            )}
            {choose(["normal", "urgent"], priority, (v) =>
              setPriority(v as "normal" | "urgent"),
            )}
            {agents.data && agents.data.length > 1 ? (
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Responsible agent
                </Text>
                {agents.data.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: assigned === a.id }}
                    onPress={() => setAssigned(a.id)}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor:
                        assigned === a.id
                          ? colors.brandLight
                          : colors.surfaceRaised,
                    }}
                  >
                    <Text style={{ color: colors.ink }}>{a.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <CampaignDateField
              label={followup ? "Follow up" : "Add optional follow-up"}
              value={followup || new Date(Date.now() + 3600000).toISOString()}
              onChange={setFollowup}
            />
            {followup ? (
              <Button
                label="Remove follow-up"
                variant="ghost"
                size="sm"
                onPress={() => setFollowup("")}
              />
            ) : null}
            <Input
              label="Internal note or department instructions"
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={2000}
            />
            <Button
              label="Save handoff"
              disabled={busy}
              loading={busy}
              onPress={() =>
                void run(async () => {
                  const when = followup ? new Date(followup) : null;
                  if (when && !Number.isFinite(when.getTime()))
                    throw Error("Choose a valid follow-up date and time.");
                  await api.put(
                    `/v1/service-desk/records/${detail.data!.kind}/${encodeURIComponent(detail.data!.identity)}`,
                    {
                      revision: detail.data!.revision,
                      agent_id: assigned,
                      priority,
                      follow_up_at: when?.toISOString() || null,
                      handoff: department,
                      note,
                    },
                    { auth: true },
                  );
                  setNote("");
                })
              }
            />
            {detail.data.notes.map((n) => (
              <View
                key={n.id}
                style={{
                  padding: 12,
                  borderRadius: 15,
                  backgroundColor: colors.surfaceRaised,
                  gap: 4,
                }}
              >
                <Text
                  style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}
                >
                  {n.actor} → {n.department}
                </Text>
                <Text style={{ color: colors.ink }}>{n.note}</Text>
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  {new Date(n.at).toLocaleString()}
                </Text>
              </View>
            ))}
            {error ? <Notice error message={error} /> : null}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

export function OrderAgentNotes({ reference }: { reference: string }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["agent-handoff", customer?.id, reference],
    queryFn: ({ signal }) =>
      api.get<Detail>(
        `/v1/service-desk/records/order/${encodeURIComponent(reference)}`,
        { auth: true, signal },
      ),
    staleTime: 15000,
    refetchInterval: 30000,
  });
  if (!query.data?.notes.length) return null;
  return (
    <View
      style={{
        gap: 7,
        padding: 12,
        borderRadius: 16,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}>
        Agent: {query.data.agent_name || "Customer team"}
        {query.data.priority === "urgent" ? " · Urgent" : ""}
      </Text>
      {query.data.notes.slice(-2).map((n) => (
        <Text key={n.id} style={{ color: colors.muted, fontSize: 12 }}>
          {n.department}: {n.note}
        </Text>
      ))}
    </View>
  );
}
