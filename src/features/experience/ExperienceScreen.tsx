import { useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  Screen,
  Feedback,
  Notice,
  ProductTile,
} from "@/components/ui/Commerce";
import {
  storeProductSchema,
  bagLineSchema,
  type BagLine,
} from "@/features/commerce/contracts";
import { useBag } from "@/features/commerce/store";
import { CelebrationDashboard } from "@/features/celebrations/CelebrationDashboard";

export async function repeatOrder(reference: string): Promise<BagLine[]> {
  const result = await api.post<{ lines: unknown[] }>(
    `/v1/experience/orders/${encodeURIComponent(reference)}/reorder`,
    {},
    { auth: true },
  );
  return bagLineSchema.array().min(1).max(30).parse(result.lines);
}

/** A compact Home doorway; the larger collections stay on their own screen. */
export function ExperienceShortcut() {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/for-you")}
      style={{
        marginHorizontal: 16,
        marginBottom: 14,
        padding: 16,
        borderRadius: 22,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: colors.brandLight,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Ionicons name="sparkles" size={25} color={colors.brandStrong} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
          Your kind of celebration
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Order your usual. Plan their day. Find your flavour.
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={20} color={colors.brandStrong} />
    </Pressable>
  );
}

type Prefs = {
  flavours: string[];
  budget_minor: number | null;
  personalised: boolean;
};
type Home = {
  preferences: Prefs;
  usual: { reference: string; title: string; created_at: string }[];
  products: unknown[];
  reason: string;
};
export function ExperienceScreen() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [tab, setTab] = useState("discover"),
    [editing, setEditing] = useState(false),
    [flavours, setFlavours] = useState<string[]>([]),
    [budget, setBudget] = useState(""),
    [personalised, setPersonalised] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["experience", customer?.id],
    queryFn: () => api.get<Home>("/v1/experience/home", { auth: true }),
    enabled: !!customer,
  });
  const care = useQuery({
    queryKey: ["experience-care", customer?.id],
    queryFn: () =>
      api.get<
        {
          id: string;
          reference: string;
          state: string;
          reply: string;
          due_at: string;
        }[]
      >("/v1/experience/care", { auth: true }),
    enabled: !!customer && tab === "care",
    refetchInterval: tab === "care" ? 30000 : false,
  });
  const panel = {
    padding: 18,
    borderRadius: 24,
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;
  async function again(reference: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const lines = await repeatOrder(reference);
      if (!useBag.getState().addBundle(lines))
        throw Error("Your bag is full. Review it before adding this order.");
      router.push("/cart");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Made for you"
      subtitle="Less searching. More celebrating."
      back
    >
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row", gap: 6 }}
      >
        {["discover", "usual", "plan", "care"].map((v) => (
          <Pressable
            key={v}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === v }}
            onPress={() => setTab(v)}
            style={{
              flex: 1,
              minHeight: 46,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              backgroundColor:
                tab === v ? colors.brandStrong : colors.surfaceRaised,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: tab === v ? "#FFFFFF" : colors.ink,
              }}
            >
              {
                {
                  discover: "For you",
                  usual: "My usual",
                  plan: "Plan",
                  care: "Care",
                }[v as "plan"]
              }
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Notice error message={error} /> : null}
      {tab === "discover" ? (
        <>
          <View style={panel}>
            <Text
              style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}
            >
              A taste that's yours
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {query.data?.reason ||
                "Choose what you love and make discovery yours."}
            </Text>
            <Button
              size="sm"
              variant="outline"
              label="My flavours & budget"
              onPress={() => {
                const p = query.data?.preferences;
                setFlavours(p?.flavours || []);
                setBudget(p?.budget_minor ? String(p.budget_minor / 100) : "");
                setPersonalised(p?.personalised ?? true);
                setEditing(true);
              }}
            />
          </View>
          {query.isPending ? (
            <Feedback loading />
          ) : query.isError ? (
            <Feedback
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {query.data?.products.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
                >
                  {query.data.products
                    .map((p) => storeProductSchema.safeParse(p))
                    .filter((p) => p.success)
                    .map((p) =>
                      p.success ? (
                        <View key={p.data.id} style={{ width: 220 }}>
                          <ProductTile product={p.data} />
                        </View>
                      ) : null,
                    )}
                </ScrollView>
              ) : (
                <Notice message="No cakes match these preferences right now. Try another flavour or budget." />
              )}
            </View>
          )}
        </>
      ) : null}
      {tab === "usual" ? (
        <>
          <Notice message="We use current prices and stock. Add a fresh message and check delivery before placing your order." />
          {query.isPending ? (
            <Feedback loading />
          ) : query.isError ? (
            <Feedback
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : query.data?.usual.length ? (
            query.data.usual.map((o) => (
              <View key={o.reference} style={panel}>
                <Ionicons name="repeat" size={24} color={colors.brandStrong} />
                <Text
                  style={{ color: colors.ink, fontSize: 17, fontWeight: "800" }}
                >
                  {o.title}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(o.created_at).toLocaleDateString()} · {o.reference}
                </Text>
                <Button
                  disabled={busy}
                  label="Add my usual to bag"
                  onPress={() => void again(o.reference)}
                />
              </View>
            ))
          ) : (
            <Notice message="Your first completed purchase will appear here for easy reordering." />
          )}
        </>
      ) : null}
      {tab === "plan" ? <CelebrationDashboard /> : null}
      {tab === "care" ? (
        <>
          {care.isPending ? (
            <Feedback loading />
          ) : care.isError ? (
            <Feedback error={care.error} onRetry={() => void care.refetch()} />
          ) : care.data?.length ? (
            care.data.map((c) => (
              <View key={c.id} style={panel}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: c.state === "resolved" ? colors.success : colors.ink,
                  }}
                >
                  {c.state === "resolved"
                    ? "Taken care of"
                    : c.state === "contacted"
                      ? "We're in touch"
                      : "We're following up"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {c.reference}
                </Text>
                <Text style={{ color: colors.ink, lineHeight: 21 }}>
                  {c.reply ||
                    "Our team is reviewing your delivery feedback. Your update will appear here."}
                </Text>
                {c.state !== "resolved" ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Response target: {new Date(c.due_at).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Notice message="No delivery follow-ups. Your feedback after each order helps us care for your next celebration." />
          )}
        </>
      ) : null}
      <BottomSheet
        visible={editing}
        title="Your flavour profile"
        onClose={() => setEditing(false)}
      >
        <View style={{ gap: 18 }}>
          <Text style={{ color: colors.muted }}>
            Choose up to six favourites. You can change these any time.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[
              "chocolate",
              "vanilla",
              "caramel",
              "strawberry",
              "red velvet",
              "black forest",
              "lemon",
              "blueberry",
            ].map((f) => (
              <Pressable
                key={f}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: flavours.includes(f) }}
                onPress={() =>
                  setFlavours((old) =>
                    old.includes(f)
                      ? old.filter((x) => x !== f)
                      : old.length < 6
                        ? [...old, f]
                        : old,
                  )
                }
                style={{
                  padding: 14,
                  borderRadius: 18,
                  backgroundColor: flavours.includes(f)
                    ? colors.brandLight
                    : colors.surfaceRaised,
                  borderWidth: 1,
                  borderColor: flavours.includes(f)
                    ? colors.brandStrong
                    : colors.border,
                }}
              >
                <Text style={{ color: colors.ink }}>{f}</Text>
              </Pressable>
            ))}
          </View>
          <Input
            label="Cake budget in KES (optional)"
            keyboardType="numeric"
            value={budget}
            onChangeText={setBudget}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.ink }}>
              Personalise my suggestions
            </Text>
            <Switch
              value={personalised}
              onValueChange={setPersonalised}
              accessibilityLabel="Personalise cake suggestions"
            />
          </View>
          <Button
            loading={busy}
            label="Save my preferences"
            onPress={() => {
              if (busy) return;
              setBusy(true);
              setError("");
              void api
                .put(
                  "/v1/experience/preferences",
                  {
                    flavours,
                    budget_minor: budget
                      ? Math.round(Number(budget) * 100)
                      : null,
                    personalised,
                  },
                  { auth: true },
                )
                .then(() =>
                  cache.invalidateQueries({
                    queryKey: ["experience", customer?.id],
                  }),
                )
                .then(() => setEditing(false))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
          {error ? <Notice error message={error} /> : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}
