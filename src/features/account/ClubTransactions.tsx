import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { clubApi } from "./club-api";

export function ClubTransactions({ onClose }: { onClose: () => void }) {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const query = useInfiniteQuery({
    queryKey: ["club-transactions", customer?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => clubApi.transactions(pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: !!customer,
    retry: false,
    staleTime: 60_000,
    refetchOnMount: "always",
  });
  const entries = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.data) ?? []).map((entry) => [
        entry.id,
        entry,
      ]),
    ).values(),
  ];
  return (
    <BottomSheet visible title="Your Club transactions" onClose={onClose}>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        {query.data?.pages[0]?.recent_only
          ? "Your recent points earned, rewards used and adjustments."
          : "Your points earned, rewards used and adjustments, all in one place."}
      </Text>
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() =>
          void (query.isFetchNextPageError
            ? query.fetchNextPage()
            : query.refetch())
        }
      />
      {!query.isPending && !query.isError && !entries.length ? (
        <View style={{ alignItems: "center", gap: 12, paddingVertical: 30 }}>
          <Ionicons
            name="receipt-outline"
            size={38}
            color={colors.brandStrong}
          />
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "700" }}>
            Your next celebration starts here
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 13,
              textAlign: "center",
              lineHeight: 19,
            }}
          >
            Qualifying purchases and rewards will appear here once confirmed.
          </Text>
        </View>
      ) : null}
      {entries.map((entry) => (
        <View
          key={entry.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.brandLight,
            }}
          >
            <Ionicons
              name={
                entry.points > 0
                  ? "add"
                  : entry.points < 0
                    ? "remove"
                    : "swap-horizontal-outline"
              }
              size={22}
              color={colors.brandStrong}
            />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{
                color: colors.ink,
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "700",
              }}
            >
              {entry.description}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(entry.created_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text
              style={{
                color: entry.points > 0 ? colors.success : colors.ink,
                fontSize: 18,
                fontWeight: "800",
              }}
            >
              {entry.points > 0 ? "+" : ""}
              {entry.points.toLocaleString()}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>points</Text>
          </View>
        </View>
      ))}
      {query.hasNextPage ? (
        <Button
          label="Load earlier transactions"
          variant="outline"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </BottomSheet>
  );
}
