import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback, Notice } from "@/components/ui/Commerce";
type Member = {
  id: string;
  name: string;
  role: string;
  approval_limit_minor: number | null;
};
export function CompanyPurchasing({ company }: { company: string }) {
  const { customer } = useAuth(),
    { colors } = useTheme();
  const query = useQuery({
    queryKey: ["company-purchasing", customer?.id, company],
    queryFn: () =>
      api.get<{ manage: boolean; revision: number; members: Member[] }>(
        `/v1/business/companies/${company}/purchasing`,
        { auth: true },
      ),
    staleTime: 30000,
  });
  const [editing, setEditing] = useState<Member | null>(null),
    [role, setRole] = useState("buyer"),
    [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Disclosure title="Purchasing & approvals">
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Text style={{ color: colors.muted, lineHeight: 20 }}>
            Buyers prepare quotations. Approvers accept within their limit.
            Company owners retain final approval.
          </Text>
          {query.data?.members.map((m) => (
            <View
              key={m.id}
              style={{
                gap: 8,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: "700" }}>
                {m.name}
              </Text>
              <Text style={{ color: colors.muted }}>
                {m.role === "buyer" ? "Purchaser" : m.role} ·{" "}
                {m.role === "owner"
                  ? "Company approval authority"
                  : m.approval_limit_minor === null
                    ? "No additional approval limit"
                    : `Approval up to KES ${(m.approval_limit_minor / 100).toLocaleString()}`}
              </Text>
              {query.data?.manage && m.role !== "owner" ? (
                <Button
                  size="sm"
                  variant="outline"
                  label="Manage access"
                  onPress={() => {
                    setEditing(m);
                    setRole(m.role);
                    setLimit(
                      m.approval_limit_minor === null
                        ? ""
                        : String(m.approval_limit_minor / 100),
                    );
                    setError("");
                  }}
                />
              ) : null}
            </View>
          ))}
        </>
      )}
      <BottomSheet
        visible={!!editing}
        title={editing?.name || "Purchasing access"}
        onClose={() => !busy && setEditing(null)}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["buyer", "approver", "viewer"].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={role === value ? "primary" : "outline"}
              label={
                value === "buyer"
                  ? "Purchaser"
                  : value === "approver"
                    ? "Approver"
                    : "View only"
              }
              disabled={busy}
              onPress={() => setRole(value)}
            />
          ))}
        </View>
        {role === "approver" ? (
          <Input
            label="Approval limit in KES"
            hint="Leave empty for no additional limit. Zero blocks approvals."
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
            editable={!busy}
          />
        ) : null}
        {error ? <Notice error message={error} /> : null}
        <Button
          label="Save access"
          disabled={busy}
          loading={busy}
          onPress={() => {
            if (!editing || !query.data || busy) return;
            if (
              limit &&
              (!Number.isFinite(Number(limit)) || Number(limit) < 0)
            ) {
              setError("Enter a valid amount.");
              return;
            }
            setBusy(true);
            setError("");
            void api
              .put(
                `/v1/business/companies/${company}/purchasing`,
                {
                  revision: query.data.revision,
                  customer_id: editing.id,
                  role,
                  approval_limit_minor:
                    role === "approver" && limit !== ""
                      ? Math.round(Number(limit) * 100)
                      : null,
                },
                { auth: true },
              )
              .then(() => query.refetch())
              .then(() => setEditing(null))
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        />
      </BottomSheet>
    </Disclosure>
  );
}
