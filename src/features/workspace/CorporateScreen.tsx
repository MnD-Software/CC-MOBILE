import { useState } from "react";
import { View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { Screen, Notice, ui as baseUi } from "@/components/ui/Commerce";
import { useThemedStyles } from "@/theme/ThemeProvider";
import {
  organizationSchema,
  enquirySchema,
  type Organization,
  type Enquiry,
} from "./contracts";

const errorText = (error: Error | null) => error?.message ?? "Please retry.";
export function CorporateScreen() {
  const { customer } = useAuth();
  return (
    <Screen
      title="Cake City for business"
      subtitle="Bring your team together, one celebration at a time."
      back
    >
      {customer ? (
        <Companies key={customer.id} owner={customer.id} />
      ) : (
        <>
          <Notice message="Sign in to manage your company and request a quotation." />
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        </>
      )}
    </Screen>
  );
}
function Companies({ owner }: { owner: string }) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const key = ["corporate-organizations", owner];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      organizationSchema
        .array()
        .parse(
          await api.get("/v1/corporate/organizations", { auth: true, signal }),
        ),
    retry: false,
  });
  const [selected, setSelected] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [requestKey, setRequestKey] = useState(randomUUID());
  const create = useMutation({
    mutationFn: async () =>
      organizationSchema.parse(
        await api.post(
          "/v1/corporate/organizations",
          { request_key: requestKey, name, billing_address: address },
          { auth: true },
        ),
      ),
    onSuccess: async (org) => {
      setSelected(org);
      setName("");
      setAddress("");
      setRequestKey(randomUUID());
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const join = useMutation({
    mutationFn: () =>
      api.post(
        "/v1/corporate/invitations/accept",
        { token: token.trim() },
        { auth: true },
      ),
    onSuccess: async () => {
      setToken("");
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  if (selected)
    return (
      <>
        <Button
          label="All companies"
          variant="outline"
          onPress={() => setSelected(null)}
        />
        <Company key={selected.id} company={selected} owner={owner} />
      </>
    );
  return (
    <View style={{ gap: 20 }}>
      <Text style={ui.heading}>Your companies</Text>
      {query.isPending ? <Notice message="Loading companies…" /> : null}
      {query.isError ? <Notice error message={errorText(query.error)} /> : null}
      <Button
        variant="outline"
        label="Refresh companies"
        onPress={() => void query.refetch()}
      />
      {query.data?.length === 0 ? (
        <Notice message="Register a company or accept an invitation to get started." />
      ) : null}
      {query.data?.map((org) => (
        <View key={org.id} style={ui.panel}>
          <Text style={ui.heading}>{org.name}</Text>
          <Text style={ui.body}>
            {org.role} · {org.billing_address}
          </Text>
          <Button label="Open company" onPress={() => setSelected(org)} />
        </View>
      ))}
      <View style={[ui.panel, { gap: 12 }]}>
        <Text style={ui.heading}>Register your company</Text>
        <Input
          label="Company name"
          value={name}
          maxLength={160}
          editable={!create.isPending}
          onChangeText={(v) => {
            setName(v);
            setRequestKey(randomUUID());
          }}
        />
        <Input
          label="Billing address"
          value={address}
          maxLength={500}
          editable={!create.isPending}
          onChangeText={(v) => {
            setAddress(v);
            setRequestKey(randomUUID());
          }}
        />
        <Button
          label="Create company"
          loading={create.isPending}
          disabled={name.trim().length < 2 || address.trim().length < 5}
          onPress={() => create.mutate()}
        />
        {create.isError ? (
          <Notice error message={errorText(create.error)} />
        ) : null}
      </View>
      <View style={[ui.panel, { gap: 12 }]}>
        <Text style={ui.heading}>Have an invitation?</Text>
        <Input
          label="Private invitation code"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          secureTextEntry
        />
        <Button
          label="Join company"
          loading={join.isPending}
          disabled={token.trim().length < 32}
          onPress={() => join.mutate()}
        />
        {join.isError ? <Notice error message={errorText(join.error)} /> : null}
      </View>
    </View>
  );
}
function Company({ company, owner }: { company: Organization; owner: string }) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const path = `/v1/corporate/organizations/${company.id}`;
  const key = ["corporate-quotes", owner, company.id];
  const quotes = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      enquirySchema
        .array()
        .parse(await api.get(path + "/quotes", { auth: true, signal })),
    retry: false,
  });
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [requestKey, setRequestKey] = useState(randomUUID());
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"buyer" | "approver" | "viewer">("buyer");
  const [invitation, setInvitation] = useState("");
  const send = useMutation({
    mutationFn: () =>
      api.post(
        path + "/quotes",
        { request_key: requestKey, kind: "corporate", subject, details },
        { auth: true },
      ),
    onSuccess: async () => {
      setSubject("");
      setDetails("");
      setRequestKey(randomUUID());
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const accept = useMutation({
    mutationFn: (quote: Enquiry) =>
      api.post(
        path + `/quotes/${quote.id}/accept`,
        { revision: quote.revision },
        { auth: true },
      ),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  const invite = useMutation({
    mutationFn: async () =>
      z
        .object({ token: z.string() })
        .parse(
          await api.post(
            path + "/invitations",
            { email, role },
            { auth: true },
          ),
        ),
    onSuccess: (data) => setInvitation(data.token),
  });
  return (
    <View style={{ gap: 18 }}>
      <Text style={ui.heading}>{company.name}</Text>
      <Notice message="Quotations are reviewed by Cake City. Accepting a quote does not create a paid order. Credit facilities are unavailable." />
      <Button
        label="Refresh quotations"
        variant="outline"
        onPress={() => void quotes.refetch()}
      />
      {quotes.isPending ? <Notice message="Loading quotations…" /> : null}
      {quotes.isError ? (
        <Notice error message={errorText(quotes.error)} />
      ) : null}
      {quotes.data?.length === 0 ? (
        <Notice message="Your team’s quotation requests will appear here." />
      ) : null}
      {quotes.data?.map((quote) => (
        <View style={[ui.panel, { gap: 10 }]} key={quote.id}>
          <Text style={ui.heading}>{quote.subject}</Text>
          <Text style={ui.body}>
            {quote.status} · {quote.details}
          </Text>
          {quote.staff_response ? (
            <Text style={ui.body}>{quote.staff_response}</Text>
          ) : null}
          {quote.quote_minor !== null ? (
            <Text style={ui.heading}>
              KES {(quote.quote_minor / 100).toLocaleString("en-KE")}
            </Text>
          ) : null}
          {quote.quote_expires_at ? (
            <Text style={ui.body}>
              Valid until {new Date(quote.quote_expires_at).toLocaleString()}
            </Text>
          ) : null}
          {quote.status === "quoted" &&
          ["owner", "approver"].includes(company.role) ? (
            <Button
              label="Accept quotation"
              disabled={
                accept.isPending ||
                !quote.quote_expires_at ||
                Date.parse(quote.quote_expires_at) <= Date.now()
              }
              onPress={() => accept.mutate(quote)}
            />
          ) : null}
        </View>
      ))}
      {accept.isError ? (
        <Notice error message={errorText(accept.error)} />
      ) : null}
      {company.role !== "viewer" ? (
        <View style={[ui.panel, { gap: 12 }]}>
          <Text style={ui.heading}>Plan a team celebration</Text>
          <Input
            label="Occasion or event"
            value={subject}
            maxLength={160}
            editable={!send.isPending}
            onChangeText={(v) => {
              setSubject(v);
              setRequestKey(randomUUID());
            }}
          />
          <Input
            label="Dates, servings, delivery needs and budget"
            multiline
            maxLength={4000}
            value={details}
            editable={!send.isPending}
            onChangeText={(v) => {
              setDetails(v);
              setRequestKey(randomUUID());
            }}
          />
          <Button
            label="Request quotation"
            loading={send.isPending}
            disabled={subject.trim().length < 3 || details.trim().length < 10}
            onPress={() => send.mutate()}
          />
          {send.isError ? (
            <Notice error message={errorText(send.error)} />
          ) : null}
        </View>
      ) : null}
      {company.role === "owner" ? (
        <View style={[ui.panel, { gap: 12 }]}>
          <Text style={ui.heading}>Invite a colleague</Text>
          <Input
            label="Colleague’s account email"
            value={email}
            editable={!invite.isPending}
            onChangeText={(value) => {
              setEmail(value);
              setInvitation("");
            }}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {(["buyer", "approver", "viewer"] as const).map((value) => (
            <Button
              key={value}
              label={value + (role === value ? " · selected" : "")}
              variant={role === value ? "secondary" : "outline"}
              disabled={invite.isPending}
              onPress={() => {
                setRole(value);
                setInvitation("");
              }}
            />
          ))}
          <Button
            label="Create private invitation"
            loading={invite.isPending}
            disabled={!z.email().safeParse(email).success}
            onPress={() => invite.mutate()}
          />
          {invite.isError ? (
            <Notice error message={errorText(invite.error)} />
          ) : null}
          {invitation ? (
            <>
              <Notice message="Share this code privately with the named colleague. It expires in three days. No email has been sent." />
              <Text selectable style={ui.body}>
                {invitation}
              </Text>
              <Button
                label="Hide invitation"
                variant="outline"
                onPress={() => setInvitation("")}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {company.role === "owner" ? (
        <Team company={company} owner={owner} />
      ) : null}
    </View>
  );
}

function Team({ company, owner }: { company: Organization; owner: string }) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const key = ["corporate-team", owner, company.id];
  const [pending, setPending] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const schema = z.object({
    customer_id: z.string(),
    name: z.string(),
    role: z.string(),
  });
  const path = `/v1/corporate/organizations/${company.id}/members`;
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      schema.array().parse(await api.get(path, { auth: true, signal })),
    retry: false,
  });
  const change = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("Select a colleague first");
      return pending.role === "remove"
        ? api.delete(path + "/" + pending.id, { auth: true })
        : api.put(
            path + "/" + pending.id,
            { role: pending.role },
            { auth: true },
          );
    },
    onSuccess: async () => {
      setPending(null);
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  return (
    <View style={[ui.panel, { gap: 12 }]}>
      <Text style={ui.heading}>Your team</Text>
      <Button
        label="Refresh team"
        variant="outline"
        onPress={() => void query.refetch()}
      />
      {query.isError ? <Notice error message={query.error.message} /> : null}
      {query.data?.map((person) => (
        <View key={person.customer_id} style={{ gap: 8 }}>
          <Text style={ui.body}>
            {person.name} · {person.role}
          </Text>
          {person.role !== "owner" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["approver", "buyer", "viewer", "remove"].map((role) => (
                <Button
                  key={role}
                  label={role === "remove" ? "Remove access" : role}
                  variant="outline"
                  disabled={change.isPending || role === person.role}
                  onPress={() =>
                    setPending({
                      id: person.customer_id,
                      name: person.name,
                      role,
                    })
                  }
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {pending ? (
        <>
          <Notice
            message={
              pending.role === "remove"
                ? `Remove ${pending.name} from this company?`
                : `Change ${pending.name} to ${pending.role}?`
            }
          />
          <Button
            label="Confirm access change"
            loading={change.isPending}
            onPress={() => change.mutate()}
          />
          <Button
            label="Cancel"
            variant="outline"
            onPress={() => setPending(null)}
          />
        </>
      ) : null}
      {change.isError ? <Notice error message={change.error.message} /> : null}
    </View>
  );
}
