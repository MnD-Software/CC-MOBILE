import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { api } from "@/api/client";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { Notice } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/auth/AuthProvider";
export function PrivacyRights() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [kind, setKind] = useState("correction");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState(randomUUID);
  const consent = useQuery({
    queryKey: ["marketing-consent", customer?.id],
    queryFn: () =>
      api.get<{ enabled: boolean }>("/v1/account/marketing-consent", {
        auth: true,
      }),
  });
  const rights = useQuery({
    queryKey: ["privacy-rights", customer?.id],
    queryFn: () =>
      api.get<
        {
          id: string;
          kind: string;
          status: string;
          details: string;
          response?: string;
        }[]
      >("/v1/account/privacy/requests", { auth: true }),
  });
  return (
    <View style={{ gap: 12 }}>
      <Disclosure title="Offers & checkout reminders">
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.muted }}>
            Choose whether Cake City may send promotional offers and a reminder
            when you leave checkout. You can change this at any time. Order
            updates remain separate.
          </Text>
          <Button
            label={
              consent.data?.enabled
                ? "Offers & reminders: on"
                : "Offers & reminders: off"
            }
            variant="outline"
            disabled={!consent.data || busy}
            onPress={() => {
              setBusy(true);
              void api
                .put(
                  "/v1/account/marketing-consent",
                  { enabled: !consent.data?.enabled },
                  { auth: true },
                )
                .then(() => consent.refetch())
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </Disclosure>
      <Disclosure title="Your data rights & requests">
        <View style={{ gap: 12 }}>
          <Text style={{ color: colors.muted }}>
            Ask for access, correction, portability or review of how your data
            is used. Some records must be retained for accounting and disputes.
            Our team will review your request.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              "access",
              "correction",
              "objection",
              "restriction",
              "erasure",
              "portability",
              "complaint",
            ].map((k) => (
              <Button
                key={k}
                label={k}
                size="sm"
                variant={k === kind ? "primary" : "outline"}
                onPress={() => {
                  setKind(k);
                  setKey(randomUUID());
                }}
              />
            ))}
          </View>
          <Input
            label="What would you like us to do?"
            multiline
            value={details}
            onChangeText={(s) => {
              setDetails(s);
              setKey(randomUUID());
            }}
          />
          <Button
            label="Send request"
            loading={busy}
            disabled={details.trim().length < 10}
            onPress={() => {
              setBusy(true);
              setError("");
              void api
                .post(
                  "/v1/account/privacy/requests",
                  { request_key: key, kind, details: details.trim() },
                  { auth: true },
                )
                .then(() => {
                  setDetails("");
                  setKey(randomUUID());
                  return rights.refetch();
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
          {rights.data?.map((r) => (
            <View
              key={r.id}
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor: colors.surfaceRaised,
                gap: 6,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: "700" }}>
                {r.kind} - {r.status}
              </Text>
              <Text style={{ color: colors.muted }}>{r.details}</Text>
              {r.response ? (
                <Text style={{ color: colors.ink }}>{r.response}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </Disclosure>
      {error ? <Notice error message={error} /> : null}
    </View>
  );
}
