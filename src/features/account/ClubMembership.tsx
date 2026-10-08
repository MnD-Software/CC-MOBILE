import {
  scheduleCelebrationReminder,
  cancelCelebrationReminder,
} from "@/native/celebration-reminders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useRef, useState } from "react";
import { Share, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Typography";
import { api } from "@/api/client";
import { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { Notice, Section } from "@/components/ui/Commerce";
import { money } from "@/features/commerce/contracts";
import {
  saveCouponCode,
  useCouponWallet,
} from "@/features/commerce/coupon-wallet";
import { useTheme } from "@/theme/ThemeProvider";
import { clubApi } from "./club-api";
import { MembershipCard } from "./MembershipCard";

export function ClubMembership({ walletScope }: { walletScope: string }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const key = ["club", customer?.id];
  const identity = useRef({ scope: customer?.id, key: randomUUID() });
  if (identity.current.scope !== customer?.id)
    identity.current = { scope: customer?.id, key: randomUUID() };
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<
    "rewards" | "perks" | "celebrations" | null
  >(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer,
    retry: false,
  });
  const redeem = useMutation({
    mutationFn: ({
      points,
      requestKey,
    }: {
      points: number;
      requestKey: string;
    }) => clubApi.redeem(points, requestKey),
    onSuccess: async (result) => {
      // Never put another member's code into the current wallet after a switch.
      if (identity.current.scope !== customer?.id) return;
      if (result.code) await saveCouponCode(walletScope, result.code);
      setNotice(
        result.code
          ? "Reward saved to your coupon wallet. Checkout verifies eligibility."
          : "Points reserved. Retry this pending reward to finish issuing your coupon.",
      );
      identity.current.key = randomUUID();
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const data = query.data;
  const text = { color: colors.ink, fontSize: 15, lineHeight: 22 };
  if (!customer)
    return (
      <Notice message="Sign in to see your Club membership and save celebrations across devices." />
    );
  return (
    <View style={{ gap: 12 }}>
      {query.isPending ? (
        <Notice message="Loading your verified membership…" />
      ) : null}
      {query.isError ? (
        <>
          <Notice
            error
            message={
              query.error instanceof Error
                ? query.error.message
                : "Membership could not be loaded. Please retry."
            }
          />
          <Button
            variant="outline"
            label="Retry membership"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {data ? (
        <>
          <MembershipCard
            id={data.member_id}
            name={[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Club member"}
            tier={data.tier}
            points={data.points}
            pointValue={data.rules.point_value_kes}
            rewards={data.coupons.filter((coupon) => coupon.status === "issued").length}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(
              [
                {
                  id: "rewards",
                  title: "My rewards",
                  copy: "Saved codes",
                  icon: "ticket-outline",
                },
                {
                  id: "perks",
                  title: "Member perks",
                  copy: "Birthdays & friends",
                  icon: "gift-outline",
                },
                {
                  id: "celebrations",
                  title: "My celebrations",
                  copy: "Dates to remember",
                  icon: "calendar-outline",
                },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ expanded: panel === item.id }}
                onPress={() => setPanel(panel === item.id ? null : item.id)}
                style={{
                  flexGrow: 1,
                  flexBasis: 100,
                  padding: 14,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor:
                    panel === item.id ? colors.brandStrong : colors.border,
                  backgroundColor:
                    panel === item.id ? colors.brandLight : colors.surface,
                  gap: 7,
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={24}
                  color={colors.brandStrong}
                />
                <Text
                  style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{ fontSize: 10, lineHeight: 14, color: colors.muted }}
                >
                  {item.copy}
                </Text>
              </Pressable>
            ))}
          </View>
          {panel ? (
            <View
              style={{
                padding: 18,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: 12,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Club panel"
                onPress={() => setPanel(null)}
                style={{ alignSelf: "flex-end", padding: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
              {panel === "rewards" ? (
                <CloudCoupons walletScope={walletScope} />
              ) : panel === "perks" ? (
                <MembershipBenefits />
              ) : (
                <Celebrations />
              )}
            </View>
          ) : null}
          <Disclosure title="How points work">
            <Text selectable style={text}>
              Member {data.member_id}
            </Text>
            <Text style={text}>
              Earn 1 point per {money(data.rules.earn_spend_kes)} of qualifying
              spend. Each point is worth {money(data.rules.point_value_kes)}.
              Points expire after {data.rules.expiry_days} days.
            </Text>
            {data.next_tier ? (
              <Text style={text}>
                {money(data.next_tier.spend_required_kes)} more qualifying spend
                to {data.next_tier.name}.
              </Text>
            ) : null}
          </Disclosure>
          {data.debt > 0 ? (
            <Notice
              message={`${data.debt} points from refunded purchases will be recovered from future earnings.`}
            />
          ) : null}
          {!data.redemption_available ? (
            <Notice
              message={
                data.review_required
                  ? "Redemption is paused while staff reconcile a refunded order. Contact support for help."
                  : "Reward issuing is not connected yet. Your verified points and history remain available."
              }
            />
          ) : (
            <>
              <Disclosure title="Reward details">
                <Text style={text}>
                  Exchange 100 points for a{" "}
                  {money(100 * data.rules.point_value_kes)} coupon. Minimum
                  order:{" "}
                  {money(
                    100 *
                      data.rules.point_value_kes *
                      data.rules.minimum_order_multiple,
                  )}
                  . Reward coupons expire after 90 days and cannot be combined
                  with other coupons.
                </Text>
              </Disclosure>
              <Button
                label="Redeem 100 points"
                loading={redeem.isPending}
                disabled={
                  data.points < 100 ||
                  data.debt > 0 ||
                  redeem.isPending ||
                  data.coupons.some((c) => c.status === "pending")
                }
                onPress={() =>
                  redeem.mutate({
                    points: 100,
                    requestKey: identity.current.key,
                  })
                }
              />
            </>
          )}
          {data.coupons
            .filter((c) => c.status === "pending")
            .map((c) => (
              <Button
                key={c.id}
                variant="outline"
                label={`Finish pending ${c.points}-point reward`}
                disabled={redeem.isPending}
                onPress={() =>
                  redeem.mutate({ points: c.points, requestKey: c.request_key })
                }
              />
            ))}
          <Disclosure title="Reward coupons">
            {data.coupons
              .filter((c) => c.code)
              .map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  label={`Save reward ${c.code}`}
                  onPress={() => void saveCouponCode(walletScope, c.code!)}
                />
              ))}
          </Disclosure>
          <Disclosure title="Points history">
            {data.activity.length ? (
              <Section title="Points activity" />
            ) : (
              <Text style={text}>
                Your qualifying purchases and rewards will appear here.
              </Text>
            )}
            {data.activity.map((entry) => (
              <View key={entry.id}>
                <Text style={text}>
                  {entry.points > 0 ? "+" : ""}
                  {entry.points} · {entry.description}
                </Text>
                <Text style={text}>
                  {new Date(entry.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </Disclosure>
        </>
      ) : null}
      {redeem.isError ? (
        <Notice
          error
          message="Reward could not be confirmed. Retry with the same request; points will not be spent twice."
        />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
    </View>
  );
}

export function Celebrations() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const [reminderNotice, setReminderNotice] = useState("");
  const key = ["celebrations", customer?.id];
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [occasion, setOccasion] = useState<
    "birthday" | "anniversary" | "other"
  >("birthday");
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => clubApi.celebrations(signal),
    enabled: !!customer,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () =>
      clubApi.saveCelebration({
        name: name.trim(),
        month: Number(month),
        day: Number(day),
        occasion,
        notes: "",
      }),
    onSuccess: async () => {
      setName("");
      setMonth("");
      setDay("");
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await clubApi.deleteCelebration(id);
      if (customer) await cancelCelebrationReminder(customer.id, id);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return (
    <View style={{ gap: 12 }}>
      <Section title="Your celebration calendar" />
      <Text style={{ color: colors.ink }}>
        Save important dates across devices. Set an optional reminder for the
        next occurrence on this device. Your device notification settings
        control delivery.
      </Text>
      {query.isError ? (
        <>
          <Notice error message="Celebrations could not load." />
          <Button
            variant="outline"
            label="Retry calendar"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {query.data?.map((item) => (
        <View key={item.id} style={{ gap: 8 }}>
          <Text style={{ color: colors.ink }}>
            {item.name} · {item.occasion} · {item.day}/{item.month}
          </Text>
          <Button
            variant="outline"
            label="Remind me next time"
            onPress={() => {
              if (!customer) return;
              void scheduleCelebrationReminder(customer.id, item)
                .then((date) =>
                  setReminderNotice(
                    `Reminder scheduled for ${date.toLocaleString()} on this device.`,
                  ),
                )
                .catch((reason) =>
                  setReminderNotice(
                    reason instanceof Error
                      ? reason.message
                      : "Reminder could not be scheduled.",
                  ),
                );
            }}
          />
          <Button
            variant="outline"
            label="Cancel device reminder"
            onPress={() => {
              if (customer)
                void cancelCelebrationReminder(customer.id, item.id)
                  .then(() => setReminderNotice("Device reminder cancelled."))
                  .catch(() =>
                    setReminderNotice(
                      "Reminder could not be cancelled. Please try again.",
                    ),
                  );
            }}
          />
          <Button
            variant="ghost"
            label={`Remove ${item.name}`}
            disabled={remove.isPending}
            onPress={() => remove.mutate(item.id)}
          />
        </View>
      ))}
      {reminderNotice ? <Notice message={reminderNotice} /> : null}
      <Input
        label="Who are we celebrating?"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["birthday", "anniversary", "other"] as const).map((value) => (
          <Button
            key={value}
            label={value}
            variant={occasion === value ? "secondary" : "outline"}
            onPress={() => setOccasion(value)}
          />
        ))}
      </View>
      <Input
        label="Month (1–12)"
        value={month}
        onChangeText={setMonth}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Input
        label="Day (1–31)"
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        maxLength={2}
      />
      <Button
        label="Save celebration"
        loading={save.isPending}
        disabled={!name.trim() || !month || !day || save.isPending}
        onPress={() => save.mutate()}
      />
      {save.isError ? (
        <Notice
          error
          message="Could not save. Check the date and your connection, then try again."
        />
      ) : null}
      {remove.isError ? (
        <Notice
          error
          message="Could not remove this celebration. Please try again."
        />
      ) : null}
    </View>
  );
}

function CloudCoupons({ walletScope }: { walletScope: string }) {
  const { customer } = useAuth();
  const wallet = useCouponWallet(customer?.id);
  const client = useQueryClient();
  const { colors } = useTheme();
  const key = ["club-coupons", customer?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      z
        .array(z.string())
        .parse(await api.get("/v1/club/coupons", { auth: true, signal })),
    enabled: !!customer,
    retry: false,
  });
  const sync = useMutation({
    mutationFn: () =>
      api.post("/v1/club/coupons", { codes: wallet.codes }, { auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (code: string) =>
      api.post("/v1/club/coupons/remove", { code }, { auth: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 12 }}>
      <Section title="Coupons across your devices" />
      <Text style={{ color: colors.ink }}>
        Sync your saved codes to this account. A saved code is verified for
        eligibility only at checkout.
      </Text>
      <Button
        variant="outline"
        label="Sync saved codes from this device"
        loading={sync.isPending}
        disabled={sync.isPending || !wallet.codes.length}
        onPress={() => sync.mutate()}
      />
      {query.isError ? (
        <Button
          variant="outline"
          label="Retry cloud wallet"
          onPress={() => void query.refetch()}
        />
      ) : null}
      {query.data?.map((code) => (
        <View key={code} style={{ gap: 6 }}>
          <Text selectable style={{ color: colors.ink }}>
            {code}
          </Text>
          <Button
            variant="outline"
            label="Save on this device"
            onPress={() => {
              setError("");
              void saveCouponCode(walletScope, code).catch(() =>
                setError(
                  "Your wallet could not save the code. Remove an unused code and try again.",
                ),
              );
            }}
          />
          <Button
            variant="ghost"
            label="Remove from cloud"
            disabled={remove.isPending}
            onPress={() => remove.mutate(code)}
          />
        </View>
      ))}
      {sync.isError || remove.isError ? (
        <Notice
          error
          message="Cloud wallet could not be updated. It holds up to 20 codes; remove an unused cloud code if it is full."
        />
      ) : null}
      {error ? <Notice error message={error} /> : null}
    </View>
  );
}

function MembershipBenefits() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const key = ["club-benefits", customer?.id];
  const [code, setCode] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [notice, setNotice] = useState("");
  const schema = z.object({
    referral_code: z.string(),
    referral_status: z.string().nullable(),
    referrals_completed: z.number().int(),
    referral_points: z.number().int(),
    referral_minimum_kes: z.number(),
    referral_annual_limit: z.number().int(),
    birthday: z
      .object({ month: z.number().int(), day: z.number().int() })
      .nullable(),
    birthday_claimed: z.boolean(),
  });
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      schema.parse(await api.get("/v1/club/benefits", { auth: true, signal })),
    enabled: !!customer,
    retry: false,
  });
  const change = useMutation({
    mutationFn: ({
      path,
      body,
      method = "post",
    }: {
      path: string;
      body: unknown;
      method?: "post" | "put";
    }) => api[method](path, body, { auth: true }),
    onSuccess: async () => {
      setNotice(
        "Membership updated. Your latest balance and benefits have been refreshed.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ["club", customer?.id] }),
      ]);
    },
  });
  const data = query.data;
  return (
    <View style={{ gap: 12 }}>
      <Section title="Birthday & friend benefits" />
      {query.isError ? (
        <Button
          label="Retry membership benefits"
          variant="outline"
          onPress={() => void query.refetch()}
        />
      ) : null}
      {data ? (
        <>
          <Text style={{ color: colors.ink }}>
            Receive {data.referral_points} points when a friend's first verified
            order of at least {money(data.referral_minimum_kes)} is completed.
            Apply codes before the first qualifying order. Refunded orders
            reverse the reward. Up to {data.referral_annual_limit} qualifying
            referrals per year.
          </Text>
          <Text selectable style={{ color: colors.ink }}>
            Your code: {data.referral_code}
          </Text>
          <Button
            variant="outline"
            label="Share my referral code"
            onPress={() => {
              void Share.share({
                message: `Join Cake City Club and enter my referral code before your first qualifying purchase: ${data.referral_code}`,
              }).catch(() =>
                setNotice("Sharing is unavailable on this device."),
              );
            }}
          />
          <Text style={{ color: colors.ink }}>
            {data.referrals_completed} completed referrals
          </Text>
          {!data.referral_status ? (
            <>
              <Input
                label="Referral code from a friend"
                value={code}
                onChangeText={setCode}
                maxLength={80}
              />
              <Button
                label="Apply referral code"
                disabled={!code.trim() || change.isPending}
                onPress={() =>
                  change.mutate({ path: "/v1/club/referrals", body: { code } })
                }
              />
            </>
          ) : (
            <Text style={{ color: colors.ink }}>
              Your referral: {data.referral_status}
            </Text>
          )}
          <Text style={{ color: colors.ink }}>
            Birthday points: Silver 50, Gold 75, Diamond 100, Platinum 150.
            Claim once per year on your saved birthday after 30 days of
            membership and {money(2000)} qualifying spend. Contact support to
            correct a saved birthday.
          </Text>
          {data.birthday ? (
            <>
              <Text style={{ color: colors.ink }}>
                Your birthday: {data.birthday.day}/{data.birthday.month}
              </Text>
              <Button
                label={
                  data.birthday_claimed
                    ? "Birthday benefit claimed this year"
                    : "Claim birthday points"
                }
                disabled={data.birthday_claimed || change.isPending}
                onPress={() =>
                  change.mutate({ path: "/v1/club/birthday/claim", body: {} })
                }
              />
            </>
          ) : (
            <>
              <Input
                label="Birthday month (1 to 12)"
                value={month}
                onChangeText={setMonth}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Input
                label="Birthday day (1 to 31)"
                value={day}
                onChangeText={setDay}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Button
                label="Save my birthday"
                disabled={!month || !day || change.isPending}
                onPress={() =>
                  change.mutate({
                    path: "/v1/club/birthday",
                    method: "put",
                    body: { month: Number(month), day: Number(day) },
                  })
                }
              />
            </>
          )}
        </>
      ) : null}
      {change.isError ? (
        <Notice
          error
          message={
            change.error instanceof Error
              ? change.error.message
              : "Could not update your membership."
          }
        />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
    </View>
  );
}
