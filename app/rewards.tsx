import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { accountCommerceApi } from "@/api/account-commerce";
import { customerApi } from "@/features/commerce/api";
import { money } from "@/features/commerce/contracts";
import {
  Screen,
  AccountRequired,
  Feedback,
  Section,
  Notice,
  ui,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { tokens } from "@/theme/tokens";
export default function Rewards() {
  return <RewardsScreen back />;
}

export function RewardsScreen({ back = false }: { back?: boolean }) {
  return (
    <Screen title="Good taste. Rewarded." back={back}>
      <AccountRequired>
        <RewardsContent />
      </AccountRequired>
    </Screen>
  );
}
function RewardsContent() {
  const { customer } = useAuth();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ["rewards", customer?.id],
    queryFn: () => accountCommerceApi.getRewards(),
  });
  const activity = useQuery({
    queryKey: ["reward-activity", customer?.id],
    queryFn: () => accountCommerceApi.getRewardsActivity(),
  });
  const [points, setPoints] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<{ points: number; id: string } | null>(null);
  const a = q.data;
  async function redeem() {
    if (busy) return;
    setBusy(true);
    try {
      const n = Number(points);
      if (!Number.isInteger(n) || n < 1 || n > (a?.points_balance ?? 0))
        throw new Error(
          "Enter a positive number of points, up to your available balance.",
        );
      if (key.current?.points !== n)
        key.current = { points: n, id: Crypto.randomUUID() };
      const result = await customerApi.redeem(n, key.current.id);
      setMessage(
        money(result.wallet_credit) + " was added to your Cake City credit.",
      );
      key.current = null;
      setPoints("");
      await cache.invalidateQueries({ queryKey: ["rewards"] });
      await activity.refetch();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Redemption could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Feedback
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
      />
      {a ? (
        <>
          <View
            style={[
              ui.panel,
              {
                backgroundColor: tokens.color.cocoa,
                borderWidth: 0,
                padding: 28,
              },
            ]}
          >
            <View style={ui.spread}>
              <Text style={[ui.eyebrow, { color: "#FFB4E1" }]}>
                CAKE CITY REWARDS
              </Text>
              <Text style={[ui.label, { color: "white" }]}>
                {a.tier.toUpperCase()}
              </Text>
            </View>
            <Text
              style={{
                color: "white",
                fontSize: 56,
                lineHeight: 66,
                fontWeight: "800",
                letterSpacing: -2,
              }}
            >
              {a.points_balance.toLocaleString()}
            </Text>
            <Text style={{ color: "#F5E8E0", fontSize: 15 }}>
              points of pure possibility
            </Text>
            {a.next_tier ? (
              <>
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: 100,
                    now: Math.round(
                      (Number(a.lifetime_spend) /
                        (Number(a.lifetime_spend) +
                          Number(a.next_tier.spend_required))) *
                        100,
                    ),
                  }}
                  style={{
                    height: 6,
                    borderRadius: 4,
                    backgroundColor: "#795E51",
                    marginTop: 15,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 4,
                      backgroundColor: "#FFB4E1",
                      width: ((Number(a.lifetime_spend) /
                        (Number(a.lifetime_spend) +
                          Number(a.next_tier.spend_required))) *
                        100 +
                        "%") as `${number}%`,
                    }}
                  />
                </View>
                <Text style={{ color: "white", fontSize: 13 }}>
                  {money(Number(a.next_tier.spend_required))} to{" "}
                  {a.next_tier.name}
                </Text>
              </>
            ) : null}
          </View>
          <View style={ui.spread}>
            <Text style={ui.heading}>Cake City credit</Text>
            <Text style={ui.heading}>{money(Number(a.wallet.balance))}</Text>
          </View>
          {a.benefits.map((b) => (
            <Text key={b} style={ui.body}>
              ✓ {b}
            </Text>
          ))}
          <Section title="Turn points into something sweet" />
          <Input
            label="Points to redeem"
            value={points}
            onChangeText={setPoints}
            keyboardType="number-pad"
            hint="Cake City confirms redemption limits and the credit available for your points."
          />
          <Button
            label="Redeem to Cake City credit"
            loading={busy}
            disabled={!points}
            onPress={() => void redeem()}
          />
          {message ? <Notice message={message} /> : null}
          <View style={ui.panel}>
            <Text style={ui.heading}>Good things are better shared.</Text>
            <Text style={ui.body}>Your referral code</Text>
            <Text selectable style={ui.title}>
              {a.referral.code}
            </Text>
            <Text style={ui.body}>
              {a.referral.completed} completed referrals
            </Text>
          </View>
        </>
      ) : null}
      <Section title="Your reward story" />
      <Feedback
        loading={activity.isPending}
        error={activity.error}
        empty={
          activity.data?.points.length === 0
            ? "Your points history starts with your next celebration."
            : undefined
        }
        onRetry={() => void activity.refetch()}
      />
      {activity.data?.points.map((p) => (
        <View key={p.id} style={ui.spread}>
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>{p.description}</Text>
            <Text style={[ui.body, { fontSize: 12 }]}>
              {new Date(p.created_at).toLocaleDateString("en-KE")}
            </Text>
          </View>
          <Text style={ui.heading}>
            {p.points > 0 ? "+" : ""}
            {p.points}
          </Text>
        </View>
      ))}
    </>
  );
}
