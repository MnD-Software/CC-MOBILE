import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { z } from "zod";
import { api } from "@/api/client";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { useTheme } from "@/theme/ThemeProvider";
import { useCouponWallet, selectCouponCode } from "./coupon-wallet";
import { money } from "./contracts";
import { Skeleton } from "@/components/ui/Skeleton";

const offersSchema = z.object({
  coupons: z.array(
    z.object({
      code: z.string(),
      amount_minor: z.number(),
      saving_minor: z.number().optional(),
      title: z.string().optional(),
      discount_type: z.string().optional(),
      percentage_bps: z.number().optional(),
      scope: z.string().optional(),
      minimum_minor: z.number(),
      eligible: z.boolean(),
      remaining_to_minimum_minor: z.number(),
    }),
  ),
});

export function CheckoutCoupons({
  owner,
  subtotalMinor,
  code,
  onChange,
  disabled = false,
}: {
  owner: string;
  subtotalMinor: number;
  code: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const wallet = useCouponWallet(owner);
  const [showAll, setShowAll] = useState(false);
  const [walletError, setWalletError] = useState("");
  const offers = useQuery({
    queryKey: ["checkout-coupons", owner, wallet.codes, subtotalMinor],
    enabled: wallet.ready,
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      offersSchema.parse(
        await api.post(
          "/v1/account/coupons/available",
          {
            saved_codes: wallet.codes,
            subtotal_minor: subtotalMinor,
          },
          { auth: true, signal },
        ),
      ),
  });
  const coupons = [...(offers.data?.coupons ?? [])].sort(
    (a, b) =>
      Number(b.code === code) - Number(a.code === code) ||
      Number(b.eligible) - Number(a.eligible) ||
      (b.saving_minor ?? b.amount_minor) - (a.saving_minor ?? a.amount_minor),
  );
  const eligible = coupons.filter((coupon) => coupon.eligible);
  const selected = coupons.find((coupon) => coupon.code === code);
  const restoredSelection = useRef(false);
  useEffect(() => {
    if (!wallet.ready || !offers.isSuccess || restoredSelection.current) return;
    restoredSelection.current = true;
    if (
      !code &&
      wallet.selected &&
      eligible.some((c) => c.code === wallet.selected)
    )
      onChange(wallet.selected);
  }, [
    wallet.ready,
    wallet.selected,
    offers.isSuccess,
    code,
    eligible,
    onChange,
  ]);
  const checkbox = (coupon: (typeof coupons)[number]) => (
    <Pressable
      key={coupon.code}
      accessibilityRole="checkbox"
      accessibilityLabel={`Use coupon ${coupon.code}`}
      accessibilityState={{
        checked: code === coupon.code,
        disabled: disabled || !coupon.eligible,
      }}
      disabled={disabled || !coupon.eligible}
      onPress={() => {
        const next = code === coupon.code ? "" : coupon.code;
        setWalletError("");
        onChange(next);
        void selectCouponCode(wallet.scope, next || null).catch(() =>
          setWalletError(
            "Your checkout selection is updated, but could not be saved for next time.",
          ),
        );
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 17,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: code === coupon.code ? colors.brandStrong : colors.border,
        backgroundColor:
          code === coupon.code ? colors.brandLight : colors.surface,
        minHeight: 48,
      }}
    >
      <Ionicons
        name={code === coupon.code ? "checkbox" : "square-outline"}
        size={24}
        color={coupon.eligible ? colors.brandStrong : colors.muted}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 15 }}>
          {code === coupon.code
            ? `${coupon.discount_type === "percentage" ? `${(coupon.percentage_bps || 0) / 100}% off` : coupon.scope === "delivery" ? "Delivery offer" : money((coupon.saving_minor ?? Math.min(coupon.amount_minor, subtotalMinor)) / 100) + " savings"} selected`
            : coupon.discount_type === "percentage"
              ? `${(coupon.percentage_bps || 0) / 100}% off ${coupon.scope === "delivery" ? "delivery" : "your order"}`
              : `Save up to ${money(coupon.amount_minor / 100)}`}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          {coupon.eligible
            ? `Minimum spend ${money(coupon.minimum_minor / 100)} · savings confirmed in your total`
            : `Add ${money(coupon.remaining_to_minimum_minor / 100)} to meet the minimum spend`}
        </Text>
      </View>
    </Pressable>
  );
  return (
    <View
      testID="checkout-coupons"
      style={{
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="ticket-outline" size={20} color={colors.brandStrong} />
        <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}>
          {eligible.length
            ? "You have a coupon for this order"
            : coupons.length
              ? "Your coupons"
              : "Offers & rewards"}
        </Text>
      </View>
      {offers.isPending ? <Skeleton height={64} radius={17} /> : null}
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
        Tap a coupon to select it. Tap it again to remove it. Your confirmed
        total updates when your checkout details are complete.
      </Text>
      {(showAll ? coupons : coupons.slice(0, 3)).map(checkbox)}
      {coupons.length > 3 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showAll ? "Show fewer coupons" : "Show all available coupons"
          }
          onPress={() => setShowAll((value) => !value)}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text
            style={{
              color: colors.brandStrong,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {showAll ? "Show fewer" : `See all ${coupons.length} coupons`}
          </Text>
        </Pressable>
      ) : null}
      {walletError ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>{walletError}</Text>
      ) : null}
      {offers.isError ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Saved rewards could not be checked. You can still enter a code below.
        </Text>
      ) : null}
      <Disclosure
        title={code && !selected ? "Your promotion code" : "Have another code?"}
      >
        <Input
          label="App coupon"
          value={code}
          onChangeText={onChange}
          editable={!disabled}
          autoCapitalize="none"
        />
      </Disclosure>
    </View>
  );
}
