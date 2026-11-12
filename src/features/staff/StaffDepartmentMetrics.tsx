import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";
import { getStaffOverview, staffDateRange } from "./contracts";

export function StaffDepartmentMetrics() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const active = useScreenActive();
  const range = staffDateRange(7);
  const query = useQuery({
    queryKey: ["staff-overview", customer?.id, range, "live"],
    queryFn: ({ signal }) =>
      getStaffOverview(range.from, range.to, "live", signal),
    enabled: !!customer && active,
    staleTime: 15_000,
    refetchInterval: active ? 30_000 : false,
  });
  if (!query.data) return null;
  const items =
    query.data.role === "rider" || query.data.role === "driver"
      ? query.data.kpis.map((k) => ({ label: k.label, count: k.value }))
      : query.data.workload;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        LIVE WORKLOAD / your permitted scope. Simulated tasks remain labelled in
        the queue.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        {items.map((item) => (
          <View
            key={item.label}
            style={{
              padding: 18,
              minWidth: 138,
              borderRadius: 20,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: colors.brandStrong,
                fontSize: 25,
                fontWeight: "800",
              }}
            >
              {item.count}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 11 }}>
              {item.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
