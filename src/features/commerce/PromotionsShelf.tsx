import { PromotionPreview } from "./PromotionPreview";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Text } from "@/components/ui/Typography";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Commerce";
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
export function PromotionsShelf() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const wallet = useCouponWallet(customer?.id);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["discoverable-promotions", customer?.id],
    staleTime: 30000,
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
  if (query.isError || (!query.isPending && !query.data?.length)) return null;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Ionicons name="ticket-outline" color={colors.brandStrong} size={19} />
        <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 18 }}>
          A sweeter deal
        </Text>
      </View>
      {query.isPending ? (
        <Skeleton height={150} radius={22} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {query.data?.map((item) => {
            const selected = wallet.selected === item.code;
            const value =
              item.discount_type === "percentage"
                ? `${(item.percentage_bps || 0) / 100}%`
                : `KES ${(item.amount_minor / 100).toLocaleString("en-KE")}`;
            return (
              <Pressable
                key={item.code}
                accessibilityRole="checkbox"
                accessibilityLabel={`${selected ? "Remove" : "Save"} offer ${item.title || item.code}`}
                accessibilityState={{ checked: selected, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  if (!customer) {
                    router.push("/sign-in");
                    return;
                  }
                  setBusy(true);
                  void (
                    selected
                      ? selectCouponCode(wallet.scope, null)
                      : saveCouponCode(wallet.scope, item.code, true)
                  )
                    .then(() =>
                      toast(
                        selected
                          ? "Offer unselected."
                          : "Offer selected. Eligible savings will appear in your checkout total.",
                      ),
                    )
                    .catch(() =>
                      toast("Your offer could not be saved. Please retry."),
                    )
                    .finally(() => setBusy(false));
                }}
                style={{
                  width: 290,
                  borderRadius: 23,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: selected ? colors.brandStrong : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <PromotionPreview offer={item} selected={selected} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
