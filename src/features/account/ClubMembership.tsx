import {
  scheduleCelebrationReminder,
  cancelCelebrationReminder,
} from "@/native/celebration-reminders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { clubApi, type Celebration } from "./club-api";
import { MembershipCard } from "./MembershipCard";
import { ClubTransactions } from "./ClubTransactions";
import { OccasionDateField } from "@/components/ui/OccasionDateField";
import { SuccessBurst } from "@/components/ui/Delight";
import { router, useFocusEffect } from "expo-router";
import { milestoneProgress } from "./milestones";
import { MilestoneProgressBar } from "./MilestoneProgressBar";
import { ClubJourney } from "./ClubJourney";
import { BottomSheet } from "@/components/ui/BottomSheet";

export function ClubMembership({
  walletScope,
  revealToken,
}: {
  walletScope: string;
  revealToken?: string;
}) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const client = useQueryClient();
  const key = ["club", customer?.id, null];
  const identity = useRef({ scope: customer?.id, key: randomUUID() });
  if (identity.current.scope !== customer?.id)
    identity.current = { scope: customer?.id, key: randomUUID() };
  const [notice, setNotice] = useState("");
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);
  const previousPoints = useRef<{ owner: string; points: number } | null>(null);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [reviewReward, setReviewReward] = useState(false);
  const [panel, setPanel] = useState<
    "rewards" | "perks" | "celebrations" | null
  >(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer,
    retry: false,
    staleTime: 60_000,
  });
  useFocusEffect(
    useCallback(() => {
      if (customer && query.isStale) void query.refetch();
    }, [customer?.id, query.refetch]),
  );
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
      if (result.code) setCelebrationTrigger((value) => value + 1);
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
  const progress = milestoneProgress(data?.purchase_progress);
  useEffect(() => {
    if (!customer || !data) return;
    const previous = previousPoints.current;
    if (previous?.owner === customer.id && data.points > previous.points) {
      setCelebrationTrigger((value) => value + 1);
      setNotice(
        `You've earned ${data.points - previous.points} Club points. A little closer to your next treat!`,
      );
    }
    previousPoints.current = { owner: customer.id, points: data.points };
  }, [customer?.id, data?.points]);
  const text = { color: colors.ink, fontSize: 15, lineHeight: 22 };
  if (!customer)
    return (
      <Notice message="Sign in to see your Club membership and save celebrations across devices." />
    );
  return (
    <View testID="club-membership" style={{ gap: 22 }}>
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
            progress={progress}
            revealToken={revealToken}
            id={data.member_id}
            name={
              [customer.first_name, customer.last_name]
                .filter(Boolean)
                .join(" ") || "Club member"
            }
            tier={data.tier}
            points={data.points}
            minimumRedemption={data.rules.minimum_redemption}
            pointValue={data.rules.point_value_kes}
            rewards={
              data.coupons.filter((coupon) => coupon.status === "issued").length
            }
          />
          <SuccessBurst trigger={celebrationTrigger} />
          <View
            style={{
              gap: 12,
              padding: 20,
              borderRadius: 24,
              backgroundColor: colors.surfaceRaised,
            }}
            testID="club-next-reward"
          >
            <Text
              style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}
            >
              Your next treat
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
              {data.points >= data.rules.minimum_redemption
                ? `${money(data.rules.minimum_redemption * data.rules.point_value_kes)} reward available with ${data.rules.minimum_redemption} points`
                : `${Math.max(0, data.rules.minimum_redemption - data.points)} points to a ${money(data.rules.minimum_redemption * data.rules.point_value_kes)} reward`}
            </Text>
            <MilestoneProgressBar
              current={Math.min(data.points, data.rules.minimum_redemption)}
              total={data.rules.minimum_redemption}
              color={colors.brandStrong}
              trackColor={colors.brandLight}
              label="Points to next reward"
              height={6}
            />
            <Button
              label={
                data.points >= data.rules.minimum_redemption
                  ? "Review my reward"
                  : "Explore my rewards"
              }
              variant="outline"
              onPress={() =>
                data.points >= data.rules.minimum_redemption
                  ? setReviewReward(true)
                  : setPanel("rewards")
              }
            />
          </View>
          {reviewReward ? (
            <BottomSheet
              visible
              title="Your Club reward"
              onClose={() => !redeem.isPending && setReviewReward(false)}
              footer={
                <Button
                  label={`Use ${data.rules.minimum_redemption} points`}
                  loading={redeem.isPending}
                  disabled={
                    !data.redemption_available ||
                    data.review_required ||
                    data.debt > 0 ||
                    data.points < data.rules.minimum_redemption ||
                    data.coupons.some((c) => c.status === "pending")
                  }
                  onPress={() =>
                    redeem.mutate(
                      {
                        points: data.rules.minimum_redemption,
                        requestKey: identity.current.key,
                      },
                      { onSuccess: () => setReviewReward(false) },
                    )
                  }
                />
              }
            >
              <Text style={text}>
                Exchange {data.rules.minimum_redemption} points for a{" "}
                {money(
                  data.rules.minimum_redemption * data.rules.point_value_kes,
                )}{" "}
                coupon. Minimum order:{" "}
                {money(
                  data.rules.minimum_redemption *
                    data.rules.point_value_kes *
                    data.rules.minimum_order_multiple,
                )}
                .
              </Text>
              <Text style={text}>
                The coupon is saved to your wallet. Checkout confirms
                eligibility before payment. Issued coupons expire after 90 days
                and cannot be combined.
              </Text>
              {!data.redemption_available ||
              data.review_required ||
              data.debt > 0 ? (
                <Notice message="Reward redemption is currently unavailable. Your points remain visible; contact our team for help." />
              ) : null}
              {redeem.isError ? (
                <Notice error message={redeem.error.message} />
              ) : null}
            </BottomSheet>
          ) : null}
          {data.journey ? (
            <ClubJourney
              points={data.points}
              minimum={data.rules.minimum_redemption}
              journey={data.journey}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View Club transactions"
            onPress={() => setTransactionsOpen(true)}
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Ionicons
              name="receipt-outline"
              size={18}
              color={colors.brandStrong}
            />
            <Text
              style={{
                color: colors.brandStrong,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              View transactions
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.brandStrong}
            />
          </Pressable>
          {transactionsOpen ? (
            <ClubTransactions
              key={customer.id}
              onClose={() => setTransactionsOpen(false)}
            />
          ) : null}
          {!data.journey ? (
            <View
              style={{
                padding: 16,
                borderRadius: 22,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons
                  name={
                    progress
                      ? progress.current >= progress.total
                        ? "trophy-outline"
                        : "sparkles-outline"
                      : data.points >= data.rules.minimum_redemption
                        ? "gift-outline"
                        : "sparkles-outline"
                  }
                  size={22}
                  color={colors.brandStrong}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {progress
                      ? progress.current >= progress.total
                        ? `${progress.target} unlocked!`
                        : `${progress.total - progress.current} more purchase${progress.total - progress.current === 1 ? "" : "s"} to ${progress.target}`
                      : data.points >= data.rules.minimum_redemption
                        ? "You've reached your next reward"
                        : `${data.rules.minimum_redemption - data.points} points to your next reward`}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {progress
                      ? progress.next
                      : data.purchase_progress?.next_tier
                        ? `${data.purchase_progress.next_tier.purchases_remaining} more purchase${data.purchase_progress.next_tier.purchases_remaining === 1 ? "" : "s"} to ${data.purchase_progress.next_tier.name}`
                        : data.next_tier
                          ? `${money(data.next_tier.spend_required_kes)} qualifying spend to ${data.next_tier.name}`
                          : "Enjoy your highest Club tier"}
                  </Text>
                </View>
              </View>
              <MilestoneProgressBar
                current={
                  progress?.current ??
                  Math.min(data.rules.minimum_redemption, data.points)
                }
                total={progress?.total ?? data.rules.minimum_redemption}
                color={colors.brandStrong}
                trackColor={colors.brandLight}
                label={
                  progress
                    ? `Overall progress to ${progress.target}`
                    : "Progress to your next reward"
                }
                height={5}
              />
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {(
              [
                {
                  id: "rewards",
                  title: "My rewards",
                  short: "Rewards",
                  icon: "ticket-outline",
                },
                {
                  id: "perks",
                  title: "Member perks",
                  short: "Perks",
                  icon: "gift-outline",
                },
                {
                  id: "celebrations",
                  title: "My celebrations",
                  short: "Dates",
                  icon: "calendar-outline",
                },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityState={{ expanded: panel === item.id }}
                aria-expanded={panel === item.id}
                onPress={() => setPanel(panel === item.id ? null : item.id)}
                style={{
                  flexGrow: 1,
                  flexBasis: 0,
                  minWidth: 0,
                  padding: 12,
                  borderRadius: 16,
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
                  size={20}
                  color={colors.brandStrong}
                />
                <Text
                  style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}
                >
                  {item.short}
                </Text>
              </Pressable>
            ))}
          </View>
          <BottomSheet
            visible={!!panel}
            title={
              panel === "rewards"
                ? "My rewards"
                : panel === "perks"
                  ? "Member perks"
                  : "My celebrations"
            }
            onClose={() => setPanel(null)}
          >
            {panel === "rewards" ? (
              <CloudCoupons walletScope={walletScope} />
            ) : panel === "perks" ? (
              <MembershipBenefits />
            ) : panel === "celebrations" ? (
              <Celebrations />
            ) : null}
          </BottomSheet>
          <Disclosure title="Points & reward details">
            <Disclosure title="How points work">
              <Text selectable style={text}>
                Member {data.member_id}
              </Text>
              <Text style={text}>
                {data.purchase_progress ? (
                  <>
                    Earn 25 test points with each verified KES 1 test payment.{" "}
                    {data.purchase_progress.milestones
                      ?.filter((milestone) => milestone.purchases > 0)
                      .map(
                        (milestone) =>
                          `${milestone.name} after ${milestone.purchases} purchases`,
                      )
                      .join("; ")}
                    .
                  </>
                ) : (
                  <>
                    Earn 1 point per {money(data.rules.earn_spend_kes)} of
                    qualifying spend. Each point is worth{" "}
                    {money(data.rules.point_value_kes)}. Points expire after{" "}
                    {data.rules.expiry_days} days.
                  </>
                )}
              </Text>
              {data.next_tier && !data.purchase_progress ? (
                <Text style={text}>
                  {money(data.next_tier.spend_required_kes)} more qualifying
                  spend to {data.next_tier.name}.
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
                  onPress={() => setReviewReward(true)}
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
                    redeem.mutate({
                      points: c.points,
                      requestKey: c.request_key,
                    })
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
  const key = ["celebrations", customer?.id];
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Celebration | null>(null);
  const [managed, setManaged] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [occasion, setOccasion] = useState<Celebration["occasion"]>("birthday");
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => clubApi.celebrations(signal),
    enabled: !!customer,
    retry: false,
  });
  const reset = () => {
    setFormOpen(false);
    setEditing(null);
    setName("");
    setDate(null);
    setOccasion("birthday");
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!date || !name.trim())
        throw Error("Add a name and celebration date.");
      const body = {
        name: name.trim(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        occasion,
        notes: editing?.notes ?? "",
      };
      const result = editing
        ? await clubApi.updateCelebration(editing.id, body)
        : await clubApi.saveCelebration(body);
      let reminderCancelled = true;
      if (editing && customer) {
        await cancelCelebrationReminder(customer.id, editing.id).catch(() => {
          reminderCancelled = false;
        });
      }
      return { record: result, reminderCancelled };
    },
    onSuccess: async (result) => {
      setNotice(
        !result.reminderCancelled
          ? "Date saved, but the old reminder could not be cancelled. Check your phone's reminders before setting a new one."
          : editing
            ? "Celebration updated. Set a fresh reminder for the new date."
            : "A lovely date to look forward to. Celebration saved.",
      );
      reset();
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (customer) await cancelCelebrationReminder(customer.id, id);
      await clubApi.deleteCelebration(id);
    },
    onSuccess: async () => {
      setManaged(null);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const next = (item: Celebration) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const build = (year: number) =>
      new Date(
        year,
        item.month - 1,
        Math.min(item.day, new Date(year, item.month, 0).getDate()),
      );
    let result = build(today.getFullYear());
    if (result < today) result = build(today.getFullYear() + 1);
    return result;
  };
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          padding: 22,
          borderRadius: 24,
          backgroundColor: colors.brandLight,
          gap: 10,
        }}
      >
        <Ionicons
          name="calendar-outline"
          color={colors.brandStrong}
          size={28}
        />
        <Text style={{ color: colors.ink, fontSize: 23, fontWeight: "800" }}>
          Make room for happy dates.
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          Birthdays, anniversaries and your favourite people. Saved to your
          account, ready for the next celebration.
        </Text>
      </View>
      {query.isPending ? (
        <Notice message="Opening your celebration calendar?" />
      ) : query.isError ? (
        <>
          <Notice error message="Your dates could not load." />
          <Button
            variant="outline"
            label="Retry calendar"
            onPress={() => void query.refetch()}
          />
        </>
      ) : !query.data?.length && !formOpen ? (
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          Your first special date starts here. Add someone worth celebrating.
        </Text>
      ) : null}
      {!formOpen
        ? [...(query.data ?? [])]
            .sort((a, b) => next(a).getTime() - next(b).getTime())
            .map((item) => (
              <View
                key={item.id}
                style={{
                  padding: 18,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 58,
                      paddingVertical: 10,
                      borderRadius: 18,
                      backgroundColor: colors.brandLight,
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.brandStrong,
                        fontSize: 10,
                        fontWeight: "800",
                      }}
                    >
                      {new Date(2000, item.month - 1, item.day)
                        .toLocaleDateString("en-KE", { month: "short" })
                        .toUpperCase()}
                    </Text>
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 25,
                        fontWeight: "800",
                      }}
                    >
                      {item.day}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 17,
                        fontWeight: "800",
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {item.occasion} ?{" "}
                      {next(item).toLocaleDateString("en-KE", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </View>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  <Button
                    label="Remind me"
                    size="sm"
                    variant="outline"
                    style={{ flex: 1, minWidth: 110 }}
                    onPress={() => {
                      if (customer)
                        void scheduleCelebrationReminder(customer.id, item)
                          .then((day) =>
                            setNotice(
                              `Reminder set for ${day.toLocaleDateString("en-KE", { month: "short", day: "numeric" })} on this phone.`,
                            ),
                          )
                          .catch((e) =>
                            setNotice(
                              e instanceof Error
                                ? e.message
                                : "Could not set a reminder.",
                            ),
                          );
                    }}
                  />
                  <Button
                    label="Manage"
                    size="sm"
                    variant="ghost"
                    onPress={() =>
                      setManaged(managed === item.id ? null : item.id)
                    }
                  />
                </View>
                {managed === item.id ? (
                  <View
                    style={{
                      gap: 10,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      <Button
                        label="Edit date"
                        variant="outline"
                        size="sm"
                        onPress={() => {
                          setEditing(item);
                          setName(item.name);
                          setOccasion(item.occasion);
                          setDate(new Date(2000, item.month - 1, item.day));
                          setFormOpen(true);
                        }}
                      />
                      <Button
                        label="Cancel reminder"
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                          if (customer)
                            void cancelCelebrationReminder(customer.id, item.id)
                              .then(() =>
                                setNotice("Reminder cancelled on this phone."),
                              )
                              .catch(() =>
                                setNotice(
                                  "Could not cancel the reminder. Please try again.",
                                ),
                              );
                        }}
                      />
                    </View>
                    <Button
                      label={`Remove ${item.name}`}
                      variant="ghost"
                      disabled={remove.isPending}
                      onPress={() => remove.mutate(item.id)}
                    />
                  </View>
                ) : null}
              </View>
            ))
        : null}
      {notice ? <Notice message={notice} /> : null}
      {!formOpen ? (
        <Button
          label="Add a celebration"
          icon={<Ionicons name="add" color={colors.onAction} size={20} />}
          onPress={() => {
            reset();
            setFormOpen(true);
          }}
        />
      ) : (
        <View
          style={{
            padding: 18,
            borderRadius: 24,
            backgroundColor: colors.surfaceRaised,
            gap: 16,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
            {editing ? "A little change of date" : "Who are we celebrating?"}
          </Text>
          <Input
            label="Their name"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["birthday", "anniversary", "other"] as const).map((value) => (
              <Button
                key={value}
                label={value[0].toUpperCase() + value.slice(1)}
                size="sm"
                variant={occasion === value ? "primary" : "outline"}
                onPress={() => setOccasion(value)}
              />
            ))}
          </View>
          <OccasionDateField
            label="Month & day"
            value={date}
            onChange={setDate}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Save date"
              loading={save.isPending}
              disabled={!name.trim() || !date || save.isPending}
              style={{ flex: 1 }}
              onPress={() => save.mutate()}
            />
            <Button
              label="Cancel"
              variant="outline"
              disabled={save.isPending}
              onPress={reset}
            />
          </View>
        </View>
      )}
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
        Reminders are optional and use this phone's notification permission.
        Editing a date clears its old device reminder; set a fresh one after
        saving.
      </Text>
      {save.isError ? (
        <Notice
          error
          message={
            save.error instanceof Error
              ? save.error.message
              : "Could not save this date."
          }
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
  const [date, setDate] = useState<Date | null>(null);
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
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const birthdayToday =
    !!data?.birthday &&
    data.birthday.month === today.getUTCMonth() + 1 &&
    Math.min(
      data.birthday.day,
      new Date(
        Date.UTC(today.getUTCFullYear(), data.birthday.month, 0),
      ).getUTCDate(),
    ) === today.getUTCDate();
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "800" }}>
          Little extras. Lovely rewards.
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 22 }}>
          A thank-you for celebrating with us, and sharing the joy.
        </Text>
      </View>
      {query.isPending ? (
        <Notice message="Opening your member perks?" />
      ) : query.isError ? (
        <>
          <Notice error message="Your perks could not load." />
          <Button
            label="Retry perks"
            variant="outline"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {data ? (
        <>
          <View
            style={{
              padding: 22,
              borderRadius: 26,
              backgroundColor: colors.brandLight,
              gap: 16,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Ionicons
                name="people-outline"
                size={28}
                color={colors.brandStrong}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}
                >
                  Bring a friend
                </Text>
                <Text style={{ color: colors.brandStrong, fontWeight: "800" }}>
                  {data.referral_points} points for a qualifying referral
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.muted, lineHeight: 21 }}>
              Share your invite. When their first qualifying order is confirmed,
              you earn a little extra joy.
            </Text>
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
              }}
            >
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                YOUR INVITE CODE
              </Text>
              <Text
                selectable
                style={{
                  color: colors.ink,
                  fontWeight: "700",
                  fontSize: 12,
                  lineHeight: 19,
                }}
              >
                {data.referral_code}
              </Text>
            </View>
            <Button
              label="Share my invite"
              icon={
                <Ionicons
                  name="share-outline"
                  color={colors.onAction}
                  size={18}
                />
              }
              onPress={() => {
                void Share.share({
                  message: `Join Cake City Club and enter my referral code before your first qualifying purchase: ${data.referral_code}`,
                }).catch(() =>
                  setNotice("Sharing is unavailable on this phone."),
                );
              }}
            />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {data.referrals_completed} completed referrals
            </Text>
            <Disclosure title="How referral rewards work">
              <Text style={{ color: colors.ink, lineHeight: 23 }}>
                Your friend's first verified order must be at least{" "}
                {money(data.referral_minimum_kes)}. They need to enter your code
                before their first qualifying order. Up to{" "}
                {data.referral_annual_limit} qualifying referrals per year;
                refunded orders reverse the reward.
              </Text>
            </Disclosure>
          </View>
          <View
            style={{
              padding: 22,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceRaised,
              gap: 16,
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Ionicons
                name="gift-outline"
                size={28}
                color={colors.brandStrong}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{ color: colors.ink, fontSize: 19, fontWeight: "800" }}
                >
                  A birthday treat
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  50?150 points, depending on your Club tier
                </Text>
              </View>
            </View>
            {data.birthday ? (
              <>
                <Text
                  style={{ color: colors.ink, fontSize: 20, fontWeight: "700" }}
                >
                  {new Date(
                    2000,
                    data.birthday.month - 1,
                    data.birthday.day,
                  ).toLocaleDateString("en-KE", {
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
                <Text
                  style={{
                    color: data.birthday_claimed
                      ? colors.success
                      : colors.muted,
                    lineHeight: 21,
                  }}
                >
                  {data.birthday_claimed
                    ? "Birthday treat received. Here's to another lovely year."
                    : birthdayToday
                      ? "It's your day. Check your birthday reward below."
                      : "Your treat opens on your saved birthday."}
                </Text>
                {birthdayToday && !data.birthday_claimed ? (
                  <Button
                    label="Claim birthday points"
                    loading={change.isPending}
                    disabled={change.isPending}
                    onPress={() =>
                      change.mutate({
                        path: "/v1/club/birthday/claim",
                        body: {},
                      })
                    }
                  />
                ) : null}
              </>
            ) : (
              <>
                <Text style={{ color: colors.muted, lineHeight: 21 }}>
                  Save your birthday so we can keep your yearly treat ready.
                </Text>
                <OccasionDateField
                  label="My birthday"
                  value={date}
                  onChange={setDate}
                />
                <Button
                  label="Save my birthday"
                  disabled={!date || change.isPending}
                  loading={change.isPending}
                  onPress={() =>
                    change.mutate({
                      path: "/v1/club/birthday",
                      method: "put",
                      body: {
                        month: date!.getMonth() + 1,
                        day: date!.getDate(),
                      },
                    })
                  }
                />
              </>
            )}
            <Disclosure title="Birthday benefit details">
              <Text style={{ color: colors.ink, lineHeight: 23 }}>
                Silver earns 50 points, Gold 75, Diamond 100 and Platinum 150.
                Claim once a year on your saved birthday after 30 days of
                membership and {money(2000)} qualifying spend. Contact support
                to correct a saved birthday.
              </Text>
            </Disclosure>
          </View>
          {!data.referral_status ? (
            <Disclosure title="Have an invite from a friend?">
              <Input
                label="Their referral code"
                value={code}
                onChangeText={setCode}
                maxLength={80}
              />
              <Button
                label="Apply invite"
                disabled={!code.trim() || change.isPending}
                loading={change.isPending}
                onPress={() =>
                  change.mutate({
                    path: "/v1/club/referrals",
                    body: { code: code.trim() },
                  })
                }
              />
            </Disclosure>
          ) : (
            <Text style={{ color: colors.muted }}>
              Your referral: {data.referral_status}
            </Text>
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
