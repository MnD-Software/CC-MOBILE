import { useState } from "react";
import { Switch, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback, Notice } from "@/components/ui/Commerce";
export function CategoryVisibility() {
  const { customer } = useAuth(),
    { colors } = useTheme();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const allowed = ["admin", "staff", "ecommerce_manager"].includes(
    customer?.role || "",
  );
  const query = useQuery({
    queryKey: ["admin-categories", customer?.id],
    enabled: allowed,
    queryFn: () =>
      api.get<
        { id: number; name: string; enabled: boolean; revision: number }[]
      >("/v1/admin/app-categories", { auth: true }),
  });
  if (!allowed) return null;
  return (
    <Disclosure title="Category visibility">
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Enable or hide categories and their products. Existing orders remain
        available.
      </Text>
      {error ? <Notice error message={error} /> : null}
      {query.isPending || query.isError ? (
        <Feedback
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        query.data?.map((category) => (
          <View
            key={category.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              minHeight: 52,
            }}
          >
            <Text style={{ flex: 1, color: colors.ink }}>{category.name}</Text>
            <Switch
              accessibilityLabel={`Enable ${category.name} category`}
              value={category.enabled}
              disabled={busy}
              onValueChange={async (enabled) => {
                setBusy(true);
                setError("");
                try {
                  await api.put(
                    `/v1/admin/app-categories/${category.id}`,
                    { enabled, revision: category.revision },
                    { auth: true },
                  );
                  await query.refetch();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Category could not be updated.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        ))
      )}
    </Disclosure>
  );
}
