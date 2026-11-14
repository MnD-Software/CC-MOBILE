import { router } from "expo-router";
import { PesapalCheckoutForm } from "@/features/commerce/PesapalCheckoutForm";
import { bagLineSchema, type BagLine } from "@/features/commerce/contracts";
import { BrandLogo } from "@/components/BrandLogo";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { mediaSource } from "@/features/editorial/content";
import { staffGreeting } from "@/auth/staff-routing";
import { useState } from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Disclosure } from "@/components/ui/Disclosure";
import { useTheme } from "@/theme/ThemeProvider";
import {
  exportExcel,
  shareBusinessDocument,
  exportPrivateFile,
} from "@/features/staff/report-export";

type Company = { id: string; name: string; billing_address: string };
type Inventory = {
  id: number;
  name: string;
  label: string;
  price_minor: number;
};
type Document = {
  id: string;
  kind: string;
  status: string;
  total_minor: number;
  discount_minor?: number;
  discount_bps?: number;
  cake_kg?: number;
  revision: number;
  reference: string;
  notes: string;
  linked_id: string | null;
  attachment_mime?: string | null;
  created_at: string;
  lines: {
    name: string;
    quantity: number;
    unit_minor: number;
    total_minor: number;
  }[];
};
type Details = {
  id: string;
  name: string;
  billing_address: string;
  branding?: { logo_url?: string; accent?: string };
  permissions: { team: boolean; onboard: boolean; manage: boolean };
  totals: { invoiced_minor: number; paid_minor: number; balance_minor: number };
  documents: Document[];
  activities: {
    id: string;
    actor: string;
    stage: string;
    note: string;
    follow_up_at: string | null;
    created_at: string;
  }[];
};
const cash = (minor: number) =>
  `KES ${(minor / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const teamRoles = [
  "admin",
  "staff",
  "ecommerce_manager",
  "corporate_manager",
  "corporate_assistant",
  "corporate_agent",
  "corporate_sales",
];
const onboardRoles = teamRoles.filter((r) => r !== "corporate_agent");

export function BusinessPortal() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [corporateCheckout, setCorporateCheckout] = useState<{
    id: string;
    lines: BagLine[];
  } | null>(null);
  const [company, setCompany] = useState<string | null>(null),
    [mode, setMode] = useState(""),
    [form, setForm] = useState<Record<string, string>>({}),
    [lines, setLines] = useState<{ item: Inventory; quantity: number }[]>([]),
    [search, setSearch] = useState(""),
    [queryText, setQueryText] = useState(""),
    [requestKey, setRequestKey] = useState(randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const companyOrders = useQuery({
    queryKey: ["company-orders", customer?.id, company],
    enabled: !!company,
    queryFn: () =>
      api.get<
        {
          reference: string;
          status: string;
          total_minor: number;
          can_open: boolean;
        }[]
      >(`/v1/business/companies/${company}/orders`, { auth: true }),
    refetchInterval: 30000,
  });
  const [evidence, setEvidence] = useState<{
    data: string;
    mime: string;
  } | null>(null);
  const isTeam = teamRoles.includes(customer?.role || "");
  const companies = useQuery({
    queryKey: ["business-companies", customer?.id],
    queryFn: () => api.get<Company[]>("/v1/business/companies", { auth: true }),
    enabled: !!customer,
  });
  const details = useQuery({
    queryKey: ["business-company", customer?.id, company],
    queryFn: () =>
      api.get<Details>(`/v1/business/companies/${company}`, { auth: true }),
    enabled: !!company,
  });
  const inventory = useQuery({
    queryKey: ["business-inventory", customer?.id, queryText],
    queryFn: () =>
      api.get<Inventory[]>(
        `/v1/business/inventory?search=${encodeURIComponent(queryText)}`,
        { auth: true },
      ),
    enabled: mode === "quote",
  });
  const team = useQuery({
    queryKey: ["business-team", customer?.id],
    queryFn: () =>
      api.get<{ id: string; name: string; role: string }[]>(
        "/v1/business/team",
        { auth: true },
      ),
    enabled: mode === "assign",
  });
  const open = (kind: string) => {
    setMode(kind);
    setEvidence(null);
    setForm({});
    setLines([]);
    setSearch("");
    setQueryText("");
    setRequestKey(randomUUID());
    setError("");
  };
  const field = (key: string, label: string, secure = false) => (
    <Input
      key={key}
      label={label}
      value={form[key] || ""}
      secureTextEntry={secure}
      autoCapitalize={key === "email" ? "none" : "sentences"}
      keyboardType={
        ["amount", "quantity"].includes(key) ? "decimal-pad" : "default"
      }
      onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
    />
  );
  async function work(action: () => Promise<unknown>, close = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      if (close) setMode("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["business-companies"] }),
        cache.invalidateQueries({ queryKey: ["business-company"] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (mode === "client") {
      await api.post(
        "/v1/business/companies",
        { request_key: requestKey, ...form },
        { auth: true },
      );
      return;
    }
    if (mode === "crm") {
      await api.post(
        `/v1/business/companies/${company}/activities`,
        {
          stage: form.stage || "contacted",
          note: form.note,
          follow_up_at: form.followup
            ? new Date(form.followup).toISOString()
            : null,
        },
        { auth: true },
      );
      return;
    }
    const amount = Number(form.amount || 0);
    if (mode === "payment" && (!Number.isFinite(amount) || amount <= 0))
      throw Error("Enter a valid payment amount.");
    const created = await api.post<Document>(
      `/v1/business/companies/${company}/documents`,
      {
        request_key: requestKey,
        kind: mode,
        lines: lines.map((l) => ({
          product_id: l.item.id,
          quantity: l.quantity,
        })),
        linked_id: form.linked_id || null,
        reference: form.reference || "",
        notes: form.notes || "",
        amount_minor: Math.round(amount * 100),
      },
      { auth: true },
    );
    if (evidence)
      await api.put(
        `/v1/business/companies/${company}/documents/${created.id}/attachment`,
        evidence,
        { auth: true, timeoutMs: 45000 },
      );
  }
  async function chooseEvidence() {
    setError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw Error("Allow photo access to attach an LPO or payment receipt.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw Error("This photo could not be attached.");
      if (asset.base64.length > 2666668)
        throw Error("Choose a smaller photo, under 2 MB.");
      setEvidence({
        data: asset.base64,
        mime: asset.mimeType === "image/png" ? "image/png" : "image/jpeg",
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Please retry your attachment.",
      );
    }
  }
  const panel = {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  };
  return (
    <View style={{ gap: 18 }}>
      {corporateCheckout ? (
        <BottomSheet
          visible
          title="Company checkout"
          onClose={() => setCorporateCheckout(null)}
        >
          <PesapalCheckoutForm
            corporateQuoteId={corporateCheckout.id}
            linesOverride={corporateCheckout.lines}
          />
        </BottomSheet>
      ) : null}
      <LinearGradient
        colors={["#281E38", "#4D355D", "#82627E"]}
        style={{ padding: 26, borderRadius: 30, gap: 12 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <BrandLogo width={105} />
          {details.data?.branding?.logo_url ? (
            <LoadingImage
              source={{ uri: mediaSource(details.data.branding.logo_url) }}
              contentFit="contain"
              style={{
                width: 100,
                height: 60,
                borderRadius: 12,
                backgroundColor: "#FFFFFF",
              }}
            />
          ) : null}
        </View>
        <Text style={{ color: "#F1DFEA", fontSize: 13 }}>
          {staffGreeting(new Date().getHours())},{" "}
          {customer?.first_name || "there"}.
        </Text>
        <Text
          style={{
            color: "#EACAE0",
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 2,
          }}
        >
          CAKE CITY / BUSINESS
        </Text>
        <Text
          style={{
            color: "white",
            fontSize: 29,
            lineHeight: 36,
            fontWeight: "800",
          }}
        >
          {company
            ? details.data?.name || "Your company"
            : "Great teams deserve great celebrations."}
        </Text>
        <Text style={{ color: "#F1DFEA", lineHeight: 21 }}>
          {isTeam
            ? "Your clients, conversations and commercial documents. One clear workspace."
            : "Quotations, LPOs and payment records, made simple."}
        </Text>
        {company && details.data ? (
          <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
            {[
              ["Invoiced", details.data.totals.invoiced_minor],
              ["Verified paid", details.data.totals.paid_minor],
              ["Outstanding", details.data.totals.balance_minor],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ gap: 5 }}>
                <Text style={{ color: "#EACAE0", fontSize: 11 }}>{label}</Text>
                <Text
                  style={{ color: "white", fontWeight: "800", fontSize: 20 }}
                >
                  {cash(Number(value))}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </LinearGradient>
      {company && details.data?.permissions.team ? (
        <Disclosure title="Company identity">
          <View style={{ gap: 12 }}>
            <Input
              label="Company logo URL"
              value={
                form.company_logo ?? details.data?.branding?.logo_url ?? ""
              }
              autoCapitalize="none"
              onChangeText={(value) =>
                setForm((f) => ({ ...f, company_logo: value }))
              }
            />
            <Button
              label="Save company logo"
              loading={busy}
              onPress={() =>
                void work(
                  () =>
                    api.put(
                      `/v1/business/companies/${company}/branding`,
                      {
                        logo_url:
                          form.company_logo ??
                          details.data?.branding?.logo_url ??
                          "",
                        accent: "#B80070",
                      },
                      { auth: true },
                    ),
                  false,
                )
              }
            />
          </View>
        </Disclosure>
      ) : null}
      {company && companyOrders.data?.length ? (
        <Disclosure title={`Company orders (${companyOrders.data.length})`}>
          <View style={{ gap: 12 }}>
            {companyOrders.data.map((o) => (
              <View
                key={o.reference}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceRaised,
                  gap: 8,
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: "800" }}>
                  {o.reference}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {o.status.replaceAll("_", " ")} - {cash(o.total_minor)}
                </Text>
                {o.can_open ? (
                  <Button
                    label="View order"
                    size="sm"
                    variant="outline"
                    onPress={() =>
                      router.push({
                        pathname: "/order/[reference]",
                        params: { reference: o.reference },
                      })
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
        </Disclosure>
      ) : null}
      {error ? <Notice error message={error} /> : null}
      {!company ? (
        <>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {onboardRoles.includes(customer?.role || "") ? (
              <Button
                label="Add corporate client"
                onPress={() => open("client")}
              />
            ) : null}
            <Button
              label="Refresh"
              variant="outline"
              onPress={() => void companies.refetch()}
            />
          </View>
          {companies.isPending ? (
            <Feedback loading />
          ) : companies.isError ? (
            <Feedback
              error={companies.error}
              onRetry={() => void companies.refetch()}
            />
          ) : !companies.data.length ? (
            <Notice
              message={
                isTeam
                  ? "Your assigned clients will appear here. A manager or assistant can add clients and give portal access."
                  : "Your corporate team will add your company and provide access. Contact Cake City to get started."
              }
            />
          ) : (
            companies.data.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${c.name}`}
                onPress={() => setCompany(c.id)}
                style={panel}
              >
                <Ionicons
                  name="business-outline"
                  color={colors.brandStrong}
                  size={27}
                />
                <Text
                  style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}
                >
                  {c.name}
                </Text>
                <Text style={{ color: colors.muted }}>{c.billing_address}</Text>
                <Text style={{ color: colors.brandStrong, fontWeight: "700" }}>
                  Open account →
                </Text>
              </Pressable>
            ))
          )}
        </>
      ) : (
        <>
          <Button
            label="All companies"
            size="sm"
            variant="ghost"
            onPress={() => setCompany(null)}
          />
          {details.isPending ? (
            <Feedback loading />
          ) : details.isError ? (
            <Feedback
              error={details.error}
              onRetry={() => void details.refetch()}
            />
          ) : details.data ? (
            <>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[
                  ["quote", "New quotation"],
                  ["lpo", "Add LPO"],
                  ["payment", "Submit payment record"],
                  ...(isTeam ? [["crm", "Log CRM activity"]] : []),
                  ...(details.data.permissions.onboard
                    ? [["assign", "Assign team member"]]
                    : []),
                ].map(([kind, label]) => (
                  <Button
                    key={kind}
                    label={label}
                    size="sm"
                    variant="outline"
                    onPress={() => open(kind)}
                  />
                ))}
                <Button
                  label="Excel statement"
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onPress={() =>
                    void work(
                      () =>
                        exportExcel(
                          `/v1/business/companies/${company}/report.xlsx`,
                          "corporate-statement",
                        ),
                      false,
                    )
                  }
                />
              </View>
              <Text
                style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}
              >
                Commercial desk
              </Text>
              {!details.data.documents.length ? (
                <Notice message="Start a quotation to plan your next celebration. Your corporate team reviews requests before issuing a final quotation." />
              ) : (
                details.data.documents.map((d) => (
                  <View key={d.id} style={panel}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.brandStrong,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        {d.kind.toUpperCase()} ·{" "}
                        {d.id.slice(0, 8).toUpperCase()}
                      </Text>
                      <Text
                        style={{
                          color: ["accepted", "verified"].includes(d.status)
                            ? colors.success
                            : colors.muted,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {d.status.replaceAll("_", " ")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 24,
                        fontWeight: "800",
                      }}
                    >
                      {cash(d.total_minor)}
                    </Text>
                    {d.reference ? (
                      <Text style={{ color: colors.muted }}>
                        Reference: {d.reference}
                      </Text>
                    ) : null}
                    <Disclosure
                      title={`${d.lines.length} items · document details`}
                    >
                      {d.lines.map((l, i) => (
                        <Text
                          key={i}
                          style={{ color: colors.ink, paddingVertical: 8 }}
                        >
                          {l.quantity} × {l.name} · {cash(l.total_minor)}
                        </Text>
                      ))}
                      <Text style={{ color: colors.muted }}>
                        {d.notes || "No additional notes"}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {new Date(d.created_at).toLocaleString()}
                      </Text>
                    </Disclosure>
                    <View
                      style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                    >
                      <Button
                        label="Share PDF"
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          void work(
                            () =>
                              shareBusinessDocument(
                                `/v1/business/companies/${company}/documents/${d.id}/print`,
                              ),
                            false,
                          )
                        }
                      />
                      {d.attachment_mime ? (
                        <Button
                          label="Share evidence"
                          size="sm"
                          variant="outline"
                          onPress={() =>
                            void work(
                              () =>
                                exportPrivateFile(
                                  `/v1/business/companies/${company}/documents/${d.id}/attachment`,
                                  "cake-city-evidence",
                                  d.attachment_mime!,
                                  d.attachment_mime === "application/pdf"
                                    ? "pdf"
                                    : d.attachment_mime === "image/png"
                                      ? "png"
                                      : "jpg",
                                ),
                              false,
                            )
                          }
                        />
                      ) : null}
                      {d.kind === "quote" &&
                      d.status === "accepted" &&
                      !isTeam ? (
                        <Button
                          label="Order these cakes"
                          disabled={busy}
                          onPress={() =>
                            void work(async () => {
                              const data = await api.get<{ lines: unknown[] }>(
                                `/v1/business/companies/${company}/documents/${d.id}/basket`,
                                { auth: true },
                              );
                              setCorporateCheckout({
                                id: d.id,
                                lines: bagLineSchema.array().parse(data.lines),
                              });
                            }, false)
                          }
                        />
                      ) : null}
                      {d.discount_minor ? (
                        <Text style={{ color: colors.success, fontSize: 12 }}>
                          Corporate saving {cash(d.discount_minor)} -{" "}
                          {(d.discount_bps || 0) / 100}% - {d.cake_kg} kg
                        </Text>
                      ) : null}
                      {d.kind === "quote" &&
                      ["requested", "issued"].includes(d.status) &&
                      isTeam ? (
                        <Button
                          label="Recall quote"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onPress={() =>
                            void work(() =>
                              api.post(
                                `/v1/business/companies/${company}/documents/${d.id}/status`,
                                { revision: d.revision, status: "recalled" },
                                { auth: true },
                              ),
                            )
                          }
                        />
                      ) : null}
                      {d.kind === "quote" && d.status === "issued" && !isTeam
                        ? ["accepted", "rejected"].map((status) => (
                            <Button
                              key={status}
                              label={
                                status === "accepted"
                                  ? "Accept quotation"
                                  : "Decline"
                              }
                              size="sm"
                              variant={
                                status === "accepted" ? "primary" : "ghost"
                              }
                              onPress={() =>
                                void work(
                                  () =>
                                    api.post(
                                      `/v1/business/companies/${company}/documents/${d.id}/status`,
                                      { revision: d.revision, status },
                                      { auth: true },
                                    ),
                                  false,
                                )
                              }
                            />
                          ))
                        : null}
                      {d.kind === "quote" &&
                      d.status === "requested" &&
                      isTeam ? (
                        <Button
                          label="Issue quotation"
                          size="sm"
                          onPress={() =>
                            void work(
                              () =>
                                api.post(
                                  `/v1/business/companies/${company}/documents/${d.id}/status`,
                                  { revision: d.revision, status: "issued" },
                                  { auth: true },
                                ),
                              false,
                            )
                          }
                        />
                      ) : null}
                      {d.kind === "quote" &&
                      d.status === "accepted" &&
                      isTeam ? (
                        <Button
                          label="Create invoice"
                          size="sm"
                          onPress={() =>
                            void work(
                              () =>
                                api.post(
                                  `/v1/business/companies/${company}/documents`,
                                  {
                                    request_key: `invoice-${d.id}`,
                                    kind: "invoice",
                                    linked_id: d.id,
                                  },
                                  { auth: true },
                                ),
                              false,
                            )
                          }
                        />
                      ) : null}
                      {d.kind === "payment" &&
                      d.status === "submitted" &&
                      details.data.permissions.onboard ? (
                        <Button
                          label="Verify payment received"
                          size="sm"
                          onPress={() =>
                            void work(
                              () =>
                                api.post(
                                  `/v1/business/companies/${company}/documents/${d.id}/status`,
                                  { revision: d.revision, status: "verified" },
                                  { auth: true },
                                ),
                              false,
                            )
                          }
                        />
                      ) : null}
                    </View>
                  </View>
                ))
              )}
              {isTeam ? (
                <>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "800",
                      color: colors.ink,
                    }}
                  >
                    Relationship timeline
                  </Text>
                  {details.data.activities.map((a) => (
                    <View key={a.id} style={panel}>
                      <Text
                        style={{ color: colors.brandStrong, fontWeight: "800" }}
                      >
                        {a.stage.replaceAll("_", " ")}
                      </Text>
                      <Text style={{ color: colors.ink, lineHeight: 23 }}>
                        {a.note}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        {a.actor} · {new Date(a.created_at).toLocaleString()}
                      </Text>
                      {a.follow_up_at ? (
                        <Text
                          style={{
                            color: colors.brandStrong,
                            fontWeight: "600",
                          }}
                        >
                          Follow up {new Date(a.follow_up_at).toLocaleString()}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
      <BottomSheet
        visible={!!mode}
        title={
          {
            client: "Welcome a corporate client",
            quote: "Build a quotation",
            lpo: "Add a purchase order",
            payment: "Payment evidence",
            crm: "Keep the relationship moving",
            assign: "Your client team",
          }[mode] || "Corporate desk"
        }
        onClose={() => {
          if (!busy) setMode("");
        }}
      >
        <View style={{ gap: 14 }}>
          {mode === "client" ? (
            <>
              {field("name", "Company name")}
              {field("billing_address", "Billing address")}
              {field("industry", "Industry (optional)")}
              {field("first_name", "Contact first name")}
              {field("last_name", "Contact last name")}
              {field("email", "Contact email")}
              {field("password", "Temporary password (10+ characters)", true)}
              <Notice message="Share login access privately with the client. Existing account passwords are preserved. No email is sent automatically." />
            </>
          ) : null}
          {mode === "quote" ? (
            <>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}
              >
                <View style={{ flex: 1 }}>
                  <Input
                    label="Find cakes and inventory"
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={() => setQueryText(search)}
                    returnKeyType="search"
                  />
                </View>
                <Button label="Find" onPress={() => setQueryText(search)} />
              </View>
              {inventory.isPending ? (
                <Feedback loading />
              ) : inventory.isError ? (
                <Feedback
                  error={inventory.error}
                  onRetry={() => void inventory.refetch()}
                />
              ) : (
                <Disclosure title="Choose a product or variation">
                  {inventory.data.map((item) => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      label={`${item.name} ${item.label} · ${cash(item.price_minor)}`}
                      onPress={() =>
                        setLines((current) => {
                          const old = current.find(
                            (l) => l.item.id === item.id,
                          );
                          return old
                            ? current.map((l) =>
                                l === old
                                  ? {
                                      ...l,
                                      quantity: Math.min(10000, l.quantity + 1),
                                    }
                                  : l,
                              )
                            : [...current, { item, quantity: 1 }];
                        })
                      }
                    />
                  ))}
                </Disclosure>
              )}
              {lines.map((l, i) => (
                <View
                  key={l.item.id}
                  style={{
                    gap: 8,
                    padding: 12,
                    backgroundColor: colors.surfaceRaised,
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ color: colors.ink, fontWeight: "700" }}>
                    {l.item.name} · {l.item.label}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      label="−"
                      accessibilityLabel={`Reduce ${l.item.name} quantity`}
                      onPress={() =>
                        setLines((v) =>
                          v.flatMap((x, j) =>
                            j !== i
                              ? [x]
                              : x.quantity > 1
                                ? [{ ...x, quantity: x.quantity - 1 }]
                                : [],
                          ),
                        )
                      }
                    />
                    <Text style={{ color: colors.ink }}>{l.quantity}</Text>
                    <Button
                      size="sm"
                      variant="outline"
                      label="+"
                      accessibilityLabel={`Increase ${l.item.name} quantity`}
                      onPress={() =>
                        setLines((v) =>
                          v.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  quantity: Math.min(10000, x.quantity + 1),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <Text
                      style={{ color: colors.brandStrong, fontWeight: "800" }}
                    >
                      {cash(l.item.price_minor * l.quantity)}
                    </Text>
                  </View>
                </View>
              ))}
              <Text
                style={{ fontSize: 24, fontWeight: "800", color: colors.ink }}
              >
                {cash(
                  lines.reduce(
                    (sum, l) => sum + l.item.price_minor * l.quantity,
                    0,
                  ),
                )}
              </Text>
              {field("notes", "Design, delivery date and requirements")}
              <Notice message="Prices come from inventory. Availability, delivery and tax treatment are reviewed by your corporate team before acceptance." />
            </>
          ) : null}
          {["payment", "lpo"].includes(mode) ? (
            <>
              <Text style={{ color: colors.ink, fontWeight: "700" }}>
                Choose the linked {mode === "payment" ? "invoice" : "quotation"}
              </Text>
              {details.data?.documents
                .filter(
                  (d) =>
                    d.kind === (mode === "payment" ? "invoice" : "quote") &&
                    !["rejected", "draft"].includes(d.status),
                )
                .map((d) => (
                  <Button
                    key={d.id}
                    variant={form.linked_id === d.id ? "primary" : "outline"}
                    label={`${d.id.slice(0, 8).toUpperCase()} · ${cash(d.total_minor)}`}
                    onPress={() => setForm((f) => ({ ...f, linked_id: d.id }))}
                  />
                ))}
              {field(
                "reference",
                mode === "payment" ? "Payment reference" : "LPO reference",
              )}
              {mode === "payment" ? field("amount", "Amount paid (KES)") : null}
              {field("notes", "Notes")}
              <Button
                label={
                  evidence
                    ? "Receipt photo attached · replace"
                    : "Attach LPO / payment receipt photo"
                }
                variant="outline"
                onPress={() => void chooseEvidence()}
              />
              <Notice
                message={
                  mode === "payment"
                    ? "Your team must verify the payment against its receipt before your balance changes."
                    : "Your LPO stays linked to the quotation and company account."
                }
              />
            </>
          ) : null}
          {mode === "crm" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  "lead",
                  "contacted",
                  "qualified",
                  "proposal",
                  "won",
                  "follow_up",
                  "closed",
                ].map((stage) => (
                  <Button
                    key={stage}
                    size="sm"
                    variant={
                      (form.stage || "contacted") === stage
                        ? "primary"
                        : "outline"
                    }
                    label={stage.replaceAll("_", " ")}
                    onPress={() => setForm((f) => ({ ...f, stage }))}
                  />
                ))}
              </View>
              {field("note", "Conversation or next action")}
              {field(
                "followup",
                "Follow-up date and time (optional, e.g. 2026-11-20T10:00)",
              )}
            </>
          ) : null}
          {mode === "assign" ? (
            team.isPending ? (
              <Feedback loading />
            ) : team.isError ? (
              <Feedback
                error={team.error}
                onRetry={() => void team.refetch()}
              />
            ) : (
              team.data.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  label={`${p.name} · ${p.role.replaceAll("_", " ")}`}
                  onPress={() =>
                    void work(() =>
                      api.put(
                        `/v1/business/companies/${company}/assignments`,
                        { customer_id: p.id },
                        { auth: true },
                      ),
                    )
                  }
                />
              ))
            )
          ) : null}
          {error ? <Notice error message={error} /> : null}
          {mode !== "assign" ? (
            <Button
              label={mode === "client" ? "Create client portal access" : "Save"}
              loading={busy}
              disabled={busy}
              onPress={() => void work(save)}
            />
          ) : null}
        </View>
      </BottomSheet>
    </View>
  );
}
