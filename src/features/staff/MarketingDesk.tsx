import { MarketingSegments } from "./MarketingSegments";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Commerce";
import { Skeleton } from "@/components/ui/Skeleton";
import { NativeStaffModule } from "./NativeStaffModule";
type Campaign = {
  id: string;
  kind: string;
  title: string;
  published: boolean;
  starts_at: string;
  ends_at: string;
};
type Offer = {
  code: string;
  enabled: boolean;
  uses: number;
  reserved: number;
  starts_at?: string;
  expires_at?: string;
};
export function MarketingDesk() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState("overview");
  const query = useQuery({
    queryKey: ["marketing-desk", customer?.id],
    queryFn: async ({ signal }) => {
      const [campaigns, offers] = await Promise.all([
        api.get<Campaign[]>("/v1/admin/content", { auth: true, signal }),
        api.get<Offer[]>("/v1/admin/dashboard/promotions", {
          auth: true,
          signal,
        }),
      ]);
      return {
        campaigns: campaigns.filter((c) => c.kind === "campaign"),
        offers,
      };
    },
    refetchInterval: 30000,
  });
  const now = Date.now();
  const live =
    query.data?.campaigns.filter(
      (c) =>
        c.published &&
        Date.parse(c.starts_at) <= now &&
        Date.parse(c.ends_at) > now,
    ) || [];
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["overview", "discounts", "audiences"].map((v) => (
          <Pressable
            key={v}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === v }}
            onPress={() => setTab(v)}
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 16,
              backgroundColor:
                tab === v ? colors.brandLight : colors.surfaceRaised,
            }}
          >
            <Text
              style={{
                color: colors.ink,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {v === "overview"
                ? "Overview"
                : v === "discounts"
                  ? "Discounts"
                  : "Audiences"}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "audiences" ? (
        <MarketingSegments />
      ) : tab === "discounts" ? (
        <NativeStaffModule module="promotions" />
      ) : query.isPending ? (
        <>
          <Skeleton height={100} radius={20} />
          <Skeleton height={160} radius={20} />
        </>
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              ["Live campaigns", live.length],
              [
                "Scheduled",
                query.data?.campaigns.filter(
                  (c) => c.published && Date.parse(c.starts_at) > now,
                ).length || 0,
              ],
              [
                "Redeemed",
                query.data?.offers.reduce((n, c) => n + c.uses, 0) || 0,
              ],
            ].map(([label, value]) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceRaised,
                  gap: 5,
                }}
              >
                <Text
                  style={{
                    color: colors.brandStrong,
                    fontSize: 25,
                    fontWeight: "800",
                  }}
                >
                  {value}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 10 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            Publish product stories on a schedule. Create offers in Discount
            studio and enable discovery so clients see them on Home, Club and
            checkout. Redemption counts include local review use; they are not
            sales revenue.
          </Text>
          <Button
            label="Create or manage campaigns"
            onPress={() => router.push("/campaign-studio")}
          />
          {query.data?.campaigns.map((c) => (
            <View
              key={c.id}
              style={{
                padding: 17,
                borderRadius: 19,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 6,
              }}
            >
              <Text style={{ color: colors.ink, fontWeight: "800" }}>
                {c.title}
              </Text>
              <Text style={{ color: colors.brandStrong, fontSize: 12 }}>
                {!c.published
                  ? "Draft"
                  : Date.parse(c.ends_at) <= now
                    ? "Ended"
                    : Date.parse(c.starts_at) > now
                      ? "Scheduled"
                      : "Live"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {new Date(c.starts_at).toLocaleString()} →{" "}
                {new Date(c.ends_at).toLocaleString()}
              </Text>
            </View>
          ))}
          {!query.data?.campaigns.length ? (
            <Text style={{ color: colors.muted }}>
              Your first campaign starts here. No campaigns have been created
              yet.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}
