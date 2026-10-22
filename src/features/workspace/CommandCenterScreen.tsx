import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Screen, Notice, ui as baseUi } from "@/components/ui/Commerce";
import { useThemedStyles } from "@/theme/ThemeProvider";
import { workspaceSchema, enquirySchema, type Enquiry } from "./contracts";

export function CommandCenterScreen() {
  const { customer } = useAuth();
  return (
    <Screen title="Command Center" subtitle="Cake City · Team workspace" back>
      {customer ? (
        <Workspace key={customer.id} owner={customer.id} />
      ) : (
        <>
          <Notice message="Sign in with your authorized team account." />
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        </>
      )}
    </Screen>
  );
}
function Workspace({ owner }: { owner: string }) {
  const ui = useThemedStyles(baseUi);
  const access = useQuery({
    queryKey: ["workspace-access", owner],
    queryFn: async ({ signal }) =>
      workspaceSchema.parse(
        await api.get("/v1/workspace/session", { auth: true, signal }),
      ),
    retry: false,
  });
  if (access.isPending)
    return <Notice message="Checking workspace permissions…" />;
  if (access.isError)
    return (
      <>
        <Notice error message={access.error.message} />
        <Button label="Retry" onPress={() => void access.refetch()} />
      </>
    );
  const permissions = access.data.permissions;
  if (!permissions.length)
    return (
      <Notice message="This account has no Command Center permissions. Ask your administrator for access." />
    );
  return (
    <View style={{ gap: 20 }}>
      <Text style={ui.heading}>Your workspace</Text>
      <Text style={ui.body}>{access.data.role.replaceAll("_", " ")}</Text>
      <Notice message="This workspace shows recorded requests and content. Revenue, payment reconciliation and branch operations are not connected." />
      {permissions.includes("content.write") ? (
        <Button
          label="Open Campaign Studio"
          onPress={() => router.push("/campaign-studio")}
        />
      ) : null}
      {permissions.includes("content.read") ? (
        <ContentHistory
          owner={owner}
          canRestore={permissions.includes("content.write")}
        />
      ) : null}
      {permissions.includes("enquiries.read") ? (
        <Queue
          owner={owner}
          canReply={permissions.includes("enquiries.write")}
        />
      ) : null}
      {permissions.includes("audit.read") ? <Audit owner={owner} /> : null}
    </View>
  );
}
function Queue({ owner, canReply }: { owner: string; canReply: boolean }) {
  const ui = useThemedStyles(baseUi);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const query = useQuery({
    queryKey: ["workspace-enquiries", owner],
    queryFn: async ({ signal }) =>
      enquirySchema
        .array()
        .parse(await api.get("/v1/admin/enquiries", { auth: true, signal })),
    retry: false,
  });
  const rows =
    query.data?.filter(
      (row) =>
        (status === "all" || row.status === status) &&
        (row.subject + " " + row.details)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <View style={{ gap: 14 }}>
      <Text style={ui.heading}>Requests and quotations</Text>
      <Input label="Search requests" value={search} onChangeText={setSearch} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          "all",
          "submitted",
          "reviewing",
          "quoted",
          "accepted",
          "resolved",
          "declined",
        ].map((value) => (
          <Button
            key={value}
            label={value}
            variant={status === value ? "secondary" : "outline"}
            onPress={() => setStatus(value)}
          />
        ))}
      </View>
      <Button
        label="Refresh requests"
        variant="outline"
        onPress={() => void query.refetch()}
      />
      {query.isPending ? <Notice message="Loading recorded requests…" /> : null}
      {query.isError ? <Notice error message={query.error.message} /> : null}
      {query.data ? (
        <Text style={ui.body}>
          {rows.length} matching requests from the latest {query.data.length}{" "}
          records.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Reply
          key={row.id + ":" + row.revision}
          row={row}
          owner={owner}
          canReply={canReply}
        />
      ))}
    </View>
  );
}
function Reply({
  row,
  owner,
  canReply,
}: {
  row: Enquiry;
  owner: string;
  canReply: boolean;
}) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const [response, setResponse] = useState("");
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState<
    "reviewing" | "quoted" | "resolved" | "declined" | null
  >(null);
  const reply = useMutation({
    mutationFn: () =>
      api.patch(
        `/v1/admin/enquiries/${row.id}`,
        {
          revision: row.revision,
          status: confirm,
          response,
          ...(confirm === "quoted"
            ? {
                quote_minor: Number(amount) * 100,
                quote_expires_at: new Date(
                  Date.now() + 48 * 60 * 60 * 1000,
                ).toISOString(),
              }
            : {}),
        },
        { auth: true },
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["workspace-enquiries", owner],
      });
      await cache.invalidateQueries({ queryKey: ["workspace-audit", owner] });
    },
  });
  const validAmount =
    /^[1-9]\d{0,6}$/.test(amount) && Number(amount) <= 10000000;
  return (
    <View style={[ui.panel, { gap: 12 }]}>
      <Text style={ui.heading}>{row.subject}</Text>
      <Text style={ui.body}>
        {row.kind.replaceAll("_", " ")} · {row.status}
      </Text>
      <Text style={ui.body}>{row.details}</Text>
      {row.staff_response ? (
        <Text style={ui.body}>Last reply: {row.staff_response}</Text>
      ) : null}
      {row.quote_minor !== null ? (
        <Text style={ui.heading}>
          KES {(row.quote_minor / 100).toLocaleString("en-KE")}
        </Text>
      ) : null}
      {canReply &&
      !["accepted", "resolved", "declined"].includes(row.status) ? (
        <>
          <Input
            label="Reply to customer"
            multiline
            maxLength={4000}
            value={response}
            editable={!reply.isPending}
            onChangeText={(v) => {
              setResponse(v);
              setConfirm(null);
            }}
          />
          {row.kind !== "support" ? (
            <Input
              label="Quotation amount in KES (whole shillings)"
              keyboardType="number-pad"
              value={amount}
              onChangeText={(v) => {
                setAmount(v);
                setConfirm(null);
              }}
              editable={!reply.isPending}
            />
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["reviewing", "quoted", "resolved", "declined"] as const)
              .filter((value) => value !== "quoted" || row.kind !== "support")
              .map((value) => (
                <Button
                  key={value}
                  label={value === "quoted" ? "Prepare quotation" : value}
                  variant="outline"
                  disabled={
                    reply.isPending ||
                    response.trim().length < 3 ||
                    (value === "quoted" && !validAmount)
                  }
                  onPress={() => setConfirm(value)}
                />
              ))}
          </View>
          {confirm ? (
            <>
              <Notice
                message={`Confirm ${confirm}${confirm === "quoted" ? ` at KES ${Number(amount).toLocaleString("en-KE")}, valid for 48 hours` : ""}. This reply will be visible to the customer.`}
              />
              <Button
                label="Confirm and save reply"
                loading={reply.isPending}
                onPress={() => reply.mutate()}
              />
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setConfirm(null)}
              />
            </>
          ) : null}
        </>
      ) : null}
      {reply.isError ? <Notice error message={reply.error.message} /> : null}
    </View>
  );
}
function ContentHistory({
  owner,
  canRestore,
}: {
  owner: string;
  canRestore: boolean;
}) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const summary = z.object({
    id: z.string(),
    revision: z.number().int(),
    title: z.string().optional(),
    kind: z.string(),
  });
  const [selected, setSelected] = useState<z.infer<typeof summary> | null>(
    null,
  );
  const [pending, setPending] = useState<number | null>(null);
  const content = useQuery({
    queryKey: ["workspace-content", owner],
    queryFn: async ({ signal }) =>
      summary
        .array()
        .parse(await api.get("/v1/admin/content", { auth: true, signal })),
    retry: false,
  });
  const versions = useQuery({
    queryKey: ["workspace-content-history", owner, selected?.id],
    queryFn: async ({ signal }) =>
      z
        .object({ revision: z.number().int(), created_at: z.string() })
        .array()
        .parse(
          await api.get(`/v1/admin/content/${selected!.id}/history`, {
            auth: true,
            signal,
          }),
        ),
    enabled: !!selected,
    retry: false,
  });
  const restore = useMutation({
    mutationFn: async () => {
      if (!selected || pending === null) throw new Error("Select a revision");
      return summary.parse(
        await api.post(
          `/v1/admin/content/${selected.id}/restore`,
          { revision: selected.revision, restore_revision: pending },
          { auth: true },
        ),
      );
    },
    onSuccess: async (data) => {
      setSelected(data);
      setPending(null);
      await cache.invalidateQueries({ queryKey: ["workspace-content", owner] });
      await cache.invalidateQueries({
        queryKey: ["workspace-content-history", owner],
      });
      await cache.invalidateQueries({ queryKey: ["workspace-audit", owner] });
    },
  });
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.heading}>Content revisions</Text>
      <Button
        label="Refresh content"
        variant="outline"
        onPress={() => {
          setSelected(null);
          setPending(null);
          void content.refetch();
        }}
      />
      {content.isError ? (
        <Notice error message={content.error.message} />
      ) : null}
      {content.data?.length === 0 ? (
        <Notice message="Create your first campaign in Campaign Studio." />
      ) : null}
      {content.data?.map((row) => (
        <Button
          key={row.id}
          label={
            (row.title ?? "Product details") + ` · version ${row.revision}`
          }
          variant="outline"
          onPress={() => {
            setSelected(row);
            setPending(null);
          }}
        />
      ))}
      {versions.isError ? (
        <Notice error message={versions.error.message} />
      ) : null}
      {selected
        ? versions.data?.map((version) => (
            <View key={version.revision} style={ui.panel}>
              <Text style={ui.body}>
                Version {version.revision} ·{" "}
                {new Date(version.created_at).toLocaleString()}
              </Text>
              {canRestore && version.revision !== selected.revision ? (
                <Button
                  label="Restore as draft"
                  variant="outline"
                  disabled={restore.isPending}
                  onPress={() => setPending(version.revision)}
                />
              ) : null}
            </View>
          ))
        : null}
      {pending !== null ? (
        <>
          <Notice
            message={`Restore version ${pending} as a new draft? Existing revision history will be preserved.`}
          />
          <Button
            label="Confirm draft restoration"
            loading={restore.isPending}
            onPress={() => restore.mutate()}
          />
          <Button
            label="Cancel"
            variant="outline"
            onPress={() => setPending(null)}
          />
        </>
      ) : null}
      {restore.isError ? (
        <Notice error message={restore.error.message} />
      ) : null}
    </View>
  );
}

function Audit({ owner }: { owner: string }) {
  const ui = useThemedStyles(baseUi);
  const schema = z.object({
    id: z.string(),
    action: z.string(),
    created_at: z.string(),
    resource_id: z.string(),
  });
  const query = useQuery({
    queryKey: ["workspace-audit", owner],
    queryFn: async ({ signal }) =>
      schema
        .array()
        .parse(await api.get("/v1/admin/audit", { auth: true, signal })),
    retry: false,
  });
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.heading}>Recent audit events</Text>
      <Button
        label="Refresh audit"
        variant="outline"
        onPress={() => void query.refetch()}
      />
      {query.isError ? <Notice error message={query.error.message} /> : null}
      {query.data?.length === 0 ? (
        <Notice message="No administrative events recorded yet." />
      ) : null}
      {query.data?.map((event) => (
        <View key={event.id} style={ui.panel}>
          <Text style={ui.body}>{event.action.replaceAll(".", " · ")}</Text>
          <Text style={ui.body}>
            {new Date(event.created_at).toLocaleString()}
          </Text>
        </View>
      ))}
    </View>
  );
}
