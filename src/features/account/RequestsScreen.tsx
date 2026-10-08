import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice, Screen, ui as baseUi } from "@/components/ui/Commerce";
import { money } from "@/features/commerce/contracts";
import { useThemedStyles } from "@/theme/ThemeProvider";

const enquiry = z.object({
  id: z.string(),
  kind: z.enum(["custom_cake", "corporate", "support"]),
  subject: z.string(),
  details: z.string(),
  status: z.string(),
  revision: z.number().int(),
  quote_minor: z.number().int().nullable(),
  quote_expires_at: z.string().nullable(),
  staff_response: z.string(),
});

export function RequestsScreen() {
  const { customer } = useAuth();
  return (
    <Screen
      title="Requests & support"
      subtitle="Custom cakes, events and help with orders."
      back
    >
      {customer ? (
        <RequestForm key={customer.id} owner={customer.id} />
      ) : (
        <>
          <Notice message="Sign in to send a request and follow replies from Cake City." />
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        </>
      )}
    </Screen>
  );
}

function RequestForm({ owner }: { owner: string }) {
  const ui = useThemedStyles(baseUi);
  const client = useQueryClient();
  const key = ["enquiries", owner];
  const requestKey = useRef(randomUUID());
  const [kind, setKind] = useState<"custom_cake" | "corporate" | "support">(
    "custom_cake",
  );
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      enquiry
        .array()
        .parse(await api.get("/v1/account/enquiries", { auth: true, signal })),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: async () =>
      enquiry.parse(
        await api.post(
          "/v1/account/enquiries",
          {
            kind,
            subject: subject.trim(),
            details: details.trim(),
            request_key: requestKey.current,
          },
          { auth: true },
        ),
      ),
    onSuccess: async () => {
      requestKey.current = randomUUID();
      setSubject("");
      setDetails("");
      setNotice("Request saved. Open this screen to check for replies.");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const accept = useMutation({
    mutationFn: async (item: z.infer<typeof enquiry>) =>
      enquiry.parse(
        await api.post(
          `/v1/account/enquiries/${item.id}/accept`,
          { revision: item.revision },
          { auth: true },
        ),
      ),
    onSuccess: async () => {
      setNotice(
        "Quote accepted. Cake City will arrange payment and fulfilment with you; this has not created a paid order.",
      );
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <View style={{ gap: 16 }}>
      <Text style={ui.body}>
        For custom or corporate cakes, include your occasion, preferred date,
        servings, flavour and budget. For support, include your order number. Do
        not send passwords or payment credentials.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            ["custom_cake", "Custom cake"],
            ["corporate", "Corporate / event"],
            ["support", "Order support"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={kind === value ? "secondary" : "outline"}
            label={label}
            disabled={submit.isPending}
            onPress={() => {
              setKind(value);
              requestKey.current = randomUUID();
            }}
          />
        ))}
      </View>
      <Input
        label="Subject"
        value={subject}
        onChangeText={(value) => {
          setSubject(value);
          requestKey.current = randomUUID();
        }}
        editable={!submit.isPending}
        maxLength={160}
      />
      <Input
        label="Request details"
        value={details}
        onChangeText={(value) => {
          setDetails(value);
          requestKey.current = randomUUID();
        }}
        editable={!submit.isPending}
        multiline
        maxLength={4000}
      />
      <Button
        label="Send request"
        loading={submit.isPending}
        disabled={
          subject.trim().length < 3 ||
          details.trim().length < 10 ||
          submit.isPending
        }
        onPress={() => submit.mutate()}
      />
      {submit.isError ? (
        <Notice
          error
          message="Could not confirm your request. Retry without editing to recover the same submission."
        />
      ) : null}
      {accept.isError ? (
        <Notice
          error
          message="The quote could not be accepted. Refresh to check whether it changed or expired."
        />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
      <Button
        variant="outline"
        label="Refresh requests"
        onPress={() => void query.refetch()}
      />
      {query.isError ? (
        <Notice error message="Requests could not load. Please try again." />
      ) : null}
      {query.isPending ? <Notice message="Loading your requests…" /> : null}
      {query.data?.length === 0 ? (
        <Notice message="Your requests and staff replies will appear here." />
      ) : null}
      {query.data?.map((item) => (
        <View key={item.id} style={[ui.panel, { gap: 10 }]}>
          <Text style={ui.heading}>{item.subject}</Text>
          <Text style={ui.body}>
            {item.kind.replace("_", " ")} · {item.status}
          </Text>
          <Text style={ui.body}>{item.details}</Text>
          {item.staff_response ? (
            <Text style={ui.body}>Cake City: {item.staff_response}</Text>
          ) : null}
          {item.quote_minor !== null ? (
            <Text style={ui.heading}>
              Quote: {money(item.quote_minor / 100)}
            </Text>
          ) : null}
          {item.quote_expires_at ? (
            <Text style={ui.body}>
              Valid until {new Date(item.quote_expires_at).toLocaleString()}
            </Text>
          ) : null}
          {item.status === "quoted" ? (
            <Button
              label="Accept this quote"
              disabled={
                accept.isPending ||
                !item.quote_expires_at ||
                Date.parse(item.quote_expires_at) <= Date.now()
              }
              onPress={() => accept.mutate(item)}
            />
          ) : null}
          {item.status === "accepted" ? (
            <Notice message="Quote accepted. Payment and fulfilment will be arranged by Cake City." />
          ) : null}
        </View>
      ))}
    </View>
  );
}
