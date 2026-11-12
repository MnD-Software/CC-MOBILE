import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Feedback, Notice } from "@/components/ui/Commerce";

const recordSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  plants: z.array(z.string()).optional(),
  action: z.string().optional(),
  resource_id: z.string().optional(),
  created_at: z.string().optional(),
  subject: z.string().optional(),
  details: z.string().optional(),
  status: z.string().optional(),
  staff_response: z.string().optional(),
  revision: z.number().optional(),
});
type RecordRow = z.infer<typeof recordSchema>;
export function StaffRecords({
  section,
}: {
  section: "team" | "audit" | "enquiries";
}) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ["staff-records", customer?.id, section],
    queryFn: async () =>
      recordSchema
        .array()
        .parse(
          await api.get(
            section === "team" ? "/v1/staff/team" : `/v1/admin/${section}`,
            { auth: true },
          ),
        ),
    retry: false,
  });
  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 20 }}>
        {section === "team"
          ? "Team directory"
          : section === "audit"
            ? "Audit trail"
            : "Customer enquiries"}
      </Text>
      {section === "team" ? (
        <Notice message="Role assignments are controlled by your administrator through the private server management command. No shared staff password is created." />
      ) : null}
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.length ? (
        <Notice message="No records to display." />
      ) : (
        query.data.map((item) => (
          <View
            key={item.id}
            style={{
              padding: 18,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              gap: 8,
            }}
          >
            <Text
              style={{ color: colors.ink, fontWeight: "800", fontSize: 14 }}
            >
              {item.name ||
                item.subject ||
                item.action?.replaceAll("_", " ") ||
                item.id}
            </Text>
            {[
              item.email,
              item.role?.replaceAll("_", " "),
              item.plants?.join(" / "),
              item.resource_id,
              item.status,
              item.details,
              item.staff_response,
            ]
              .filter(Boolean)
              .map((text, i) => (
                <Text
                  key={i}
                  style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}
                >
                  {text}
                </Text>
              ))}
            {item.created_at ? (
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {new Date(item.created_at).toLocaleString("en-KE", {
                  timeZone: "Africa/Nairobi",
                })}
              </Text>
            ) : null}
            {section === "enquiries" &&
            !["accepted", "resolved", "declined"].includes(
              item.status ?? "",
            ) ? (
              <EnquiryReply item={item} />
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}
function EnquiryReply({ item }: { item: RecordRow }) {
  const [response, setResponse] = useState("");
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: "reviewing" | "resolved") =>
      api.patch(
        `/v1/admin/enquiries/${encodeURIComponent(item.id)}`,
        { revision: item.revision, response, status },
        { auth: true },
      ),
    onSuccess: async () => {
      setResponse("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["staff-records"] }),
        cache.invalidateQueries({ queryKey: ["staff-overview"] }),
      ]);
    },
  });
  return (
    <View style={{ gap: 10 }}>
      <Input
        label="Reply to customer"
        value={response}
        onChangeText={setResponse}
        multiline
        maxLength={4000}
      />
      {mutation.isError ? (
        <Notice error message={mutation.error.message} />
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          label="Send update"
          size="sm"
          disabled={mutation.isPending || response.trim().length < 3}
          onPress={() => mutation.mutate("reviewing")}
        />
        <Button
          label="Resolve request"
          size="sm"
          variant="outline"
          disabled={mutation.isPending || response.trim().length < 3}
          onPress={() => mutation.mutate("resolved")}
        />
      </View>
    </View>
  );
}
