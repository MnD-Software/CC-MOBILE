import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { z } from "zod";
import { api } from "@/api/client";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Disclosure } from "@/components/ui/Disclosure";
import { useTheme } from "@/theme/ThemeProvider";
import { useCouponWallet } from "./coupon-wallet";
import { money } from "./contracts";

const offersSchema = z.object({
  coupons: z.array(
    z.object({
      code: z.string(),
      amount_minor: z.number(),
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
  const coupons = offers.data?.coupons ?? [];
  const eligible = coupons.filter((coupon) => coupon.eligible);
  const selected = coupons.find((coupon) => coupon.code === code);
  const recommended = selected?.eligible ? selected : eligible[0];
  const restoredSelection = useRef(false);
  useEffect(() => {
    if (!wallet.ready || !offers.isSuccess || restoredSelection.current) return;
    restoredSelection.current = true;
    if (!code && wallet.selected && eligible.some(c => c.code === wallet.selected)) onChange(wallet.selected);
  }, [wallet.ready, wallet.selected, offers.isSuccess, code, eligible, onChange]);
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
      onPress={() => onChange(code === coupon.code ? "" : coupon.code)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
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
            ? "Use my coupon"
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
      {offers.isPending ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Checking your saved rewards…
        </Text>
      ) : null}
      {recommended
        ? checkbox(recommended)
        : coupons[0]
          ? checkbox(coupons[0])
          : null}
      {coupons.length > 1 ? (
        <Disclosure title="Choose another coupon">
          {coupons.filter((coupon) => coupon !== recommended).map(checkbox)}
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            One coupon per order.
          </Text>
        </Disclosure>
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
