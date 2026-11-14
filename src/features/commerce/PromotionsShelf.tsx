import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenActive } from "@/design/useScreenActive";
import { tokens } from "@/theme/tokens";
import { PromotionPreview } from "./PromotionPreview";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast, Feedback } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import {
  saveCouponCode,
  selectCouponCode,
  useCouponWallet,
} from "./coupon-wallet";

const offer = z.object({
  code: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  banner_url: z.string().optional(),
  amount_minor: z.number(),
  minimum_minor: z.number(),
  discount_type: z.string().optional(),
  percentage_bps: z.number().optional(),
  scope: z.string().optional(),
  maximum_minor: z.number().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  first_order_only: z.boolean().optional(),
});
export function PromotionsShelf({ floating = false }: { floating?: boolean }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const wallet = useCouponWallet(customer?.id);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"available" | "selected">("available");
  const [busy, setBusy] = useState(false);
  const active = useScreenActive();
  const query = useQuery({
    queryKey: ["discoverable-promotions", customer?.id, wallet.codes],
    enabled: active && wallet.ready,
    staleTime: 30000,
    refetchInterval: active ? 60000 : false,
    queryFn: async ({ signal }) => {
      if (!customer)
        return z
          .array(offer)
          .parse(await api.get("/v1/promotions", { signal }));
      const result = await api.post<{ coupons: unknown[] }>(
        "/v1/account/coupons/available",
        { saved_codes: wallet.codes, subtotal_minor: 0 },
        { auth: true, signal },
      );
      return z.array(offer).parse(result.coupons);
    },
  });
  const offers = (query.data || []).filter(
    (o) => !o.expires_at || Date.parse(o.expires_at) > Date.now(),
  );
  const selected = offers.find((o) => o.code === wallet.selected);
  const displayed =
    tab === "selected"
      ? offers.filter((o) => o.code === wallet.selected)
      : offers;
  const openWallet = () => {
    setTab("available");
    setOpen(true);
  };
  const choose = async (item: z.infer<typeof offer>) => {
    if (!customer) {
      setOpen(false);
      router.push("/sign-in");
      return;
    }
    setBusy(true);
    try {
      if (wallet.selected === item.code)
        await selectCouponCode(wallet.scope, null);
      else await saveCouponCode(wallet.scope, item.code, true);
      toast(
        wallet.selected === item.code
          ? "Offer unselected."
          : "Saved for checkout. Your total will confirm the savings.",
      );
    } catch {
      toast("Your offer could not be saved. Please retry.");
    } finally {
      setBusy(false);
    }
  };
  if (!open && (query.isPending || query.isError || !offers.length))
    return null;
  return (
    <>
      <View
        pointerEvents="box-none"
        testID={floating ? "floating-rewards" : "club-rewards-entry"}
        style={
          floating
            ? {
                position: "absolute",
                right: 16,
                bottom: Math.max(112, insets.bottom + 96),
                zIndex: 12,
                alignItems: "flex-end",
                maxWidth: "75%",
              }
            : undefined
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your rewards, ${offers.length} available offers${selected ? ", one selected for checkout" : ""}`}
          onPress={openWallet}
          style={({ pressed }) => ({
            borderRadius: floating ? 28 : 22,
            overflow: "hidden",
            opacity: pressed ? 0.9 : 1,
            ...tokens.shadow.floating,
          })}
        >
          <LinearGradient
            colors={["#5A1743", "#AC0066"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: floating ? 12 : 15,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#FFFFFF20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={selected ? "checkmark-circle" : "gift-outline"}
                color="#FFE1A8"
                size={20}
              />
            </View>
            <View style={{ gap: 2 }}>
              <Text
                style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}
              >
                Your rewards
              </Text>
              <Text style={{ color: "#F9D7E9", fontSize: 10 }}>
                {selected
                  ? "Offer selected"
                  : `${offers.length} ${offers.length === 1 ? "offer" : "offers"} to explore`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" color="#FFFFFF" size={16} />
          </LinearGradient>
        </Pressable>
      </View>
      <BottomSheet
        visible={open}
        title="Your rewards & offers"
        onClose={() => setOpen(false)}
      >
        <View style={{ gap: 16 }}>
          <View
            style={{
              padding: 16,
              borderRadius: 21,
              backgroundColor: colors.surfaceRaised,
              gap: 9,
            }}
          >
            <Text
              style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}
            >
              A little extra, just for you.
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
              Choose one offer for checkout. Your Club card keeps the points and
              milestones you earn with each celebration.
            </Text>
            <Button
              size="sm"
              label="View my Club card"
              variant="outline"
              onPress={() => {
                setOpen(false);
                router.push("/loyalty");
              }}
            />
          </View>
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              padding: 4,
              gap: 6,
              borderRadius: 18,
              backgroundColor: colors.surfaceRaised,
            }}
          >
            {(["available", "selected"] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === v }}
                onPress={() => setTab(v)}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor:
                    tab === v ? colors.brandLight : "transparent",
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: tab === v ? colors.brandStrong : colors.muted,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {v === "available"
                    ? `Available (${offers.length})`
                    : `Selected (${selected ? 1 : 0})`}
                </Text>
              </Pressable>
            ))}
          </View>
          {query.isError ? (
            <Feedback
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : query.isPending ? (
            <Skeleton height={150} radius={22} />
          ) : displayed.length ? (
            displayed.map((item) => (
              <View
                key={item.code}
                style={{
                  borderRadius: 23,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor:
                    wallet.selected === item.code
                      ? colors.brandStrong
                      : colors.border,
                }}
              >
                <PromotionPreview
                  offer={item}
                  selected={wallet.selected === item.code}
                />
                <View
                  style={{
                    padding: 12,
                    paddingTop: 0,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Use coupon ${item.title || item.code}`}
                    accessibilityState={{
                      checked: wallet.selected === item.code,
                      disabled: busy,
                    }}
                    disabled={busy}
                    onPress={() => void choose(item)}
                    style={{
                      minHeight: 48,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderRadius: 15,
                      backgroundColor:
                        wallet.selected === item.code
                          ? colors.brandLight
                          : colors.surfaceRaised,
                    }}
                  >
                    <Ionicons
                      name={
                        wallet.selected === item.code
                          ? "checkbox"
                          : "square-outline"
                      }
                      size={23}
                      color={colors.brandStrong}
                    />
                    <Text
                      style={{
                        color: colors.ink,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {wallet.selected === item.code
                        ? "Selected for checkout"
                        : "Use at checkout"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View style={{ padding: 24, gap: 8, alignItems: "center" }}>
              <Ionicons
                name="ticket-outline"
                size={28}
                color={colors.brandStrong}
              />
              <Text style={{ color: colors.ink, fontWeight: "700" }}>
                {tab === "selected"
                  ? "Your next saving starts here"
                  : "More treats will be here soon"}
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  textAlign: "center",
                  fontSize: 12,
                }}
              >
                Choose an available offer when you are ready. Nothing is
                redeemed until your order is confirmed.
              </Text>
            </View>
          )}
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
            One coupon per order. Product, delivery and minimum-spend rules are
            confirmed against your bag at checkout. An offer is separate from
            your Club points balance.
          </Text>
        </View>
      </BottomSheet>
    </>
  );
}
