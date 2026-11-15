import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenActive } from "@/design/useScreenActive";
import { tokens } from "@/theme/tokens";
import { PromotionPreview } from "./PromotionPreview";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { GlossSheen } from "@/components/ui/GlossSheen";
import { useReducedMotion } from "@/design/useReducedMotion";
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
  const reduceMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
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
  const showPulse = floating && active && !reduceMotion && offers.length > 0;
  useEffect(() => {
    if (!showPulse) {
      pulse.setValue(0);
      return;
    }
    // A calm "you have a coupon" breath: two soft beats, then a long rest.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.delay(2600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showPulse, pulse]);
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
        {showPulse ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              borderRadius: 28,
              borderWidth: 2,
              borderColor: "#EC008C",
              opacity: pulse.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.55, 0],
              }),
              transform: [
                {
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.35],
                  }),
                },
              ],
            }}
          />
        ) : null}
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
              gap: 7,
              minHeight: 44,
              paddingHorizontal: floating ? 12 : 14,
              paddingVertical: floating ? 6 : 10,
            }}
          >
            <GlossSheen />
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 16,
                backgroundColor: "#FFFFFF20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={selected ? "checkmark-circle" : "gift-outline"}
                color="#FFE1A8"
                size={18}
              />
              {floating && !selected ? (
                <View
                  accessible={false}
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -7,
                    minWidth: 17,
                    height: 17,
                    paddingHorizontal: 4,
                    borderRadius: 9,
                    backgroundColor: "#FFC53D",
                    borderWidth: 1.5,
                    borderColor: "#AC0066",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ color: "#4A1236", fontSize: 10, fontWeight: "900" }}
                  >
                    {offers.length > 9 ? "9+" : offers.length}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 2 }}>
              <Text
                style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 13 }}
              >
                Your rewards
              </Text>
              {!floating ? (
                <Text style={{ color: "#F9D7E9", fontSize: 10 }}>
                  {selected
                    ? "Offer selected"
                    : `${offers.length} ${offers.length === 1 ? "offer" : "offers"} to explore`}
                </Text>
              ) : null}
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
