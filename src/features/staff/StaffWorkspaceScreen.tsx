import { useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { isStaffRole, staffGreeting } from "@/auth/staff-routing";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { Feedback, Notice, Screen } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { useScreenActive } from "@/design/useScreenActive";
import {
  getStaffOverview,
  staffDateRange,
  type StaffOverview,
} from "./contracts";
import { StaffRecords } from "./StaffRecords";
import { env } from "@/config/env";
import { NativeStaffModule } from "./NativeStaffModule";
import { EarningsPanel } from "@/features/logistics/EarningsPanel";
import { BusinessPortal } from "@/features/workspace/BusinessPortal";

const cash = (minor: number) =>
  `KES ${(minor / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  kitchen: "restaurant-outline",
  dispatch: "navigate-outline",
  rider: "bicycle-outline",
  sales: "stats-chart-outline",
  team: "people-outline",
  audit: "shield-checkmark-outline",
  campaigns: "sparkles-outline",
  enquiries: "chatbubbles-outline",
  products: "cube-outline",
};
export function StaffWorkspaceScreen() {
  const { customer, restoring, logout } = useAuth();
  const { colors } = useTheme();
  const active = useScreenActive();
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<"live" | "simulation">(
    env.reviewCheckout ? "simulation" : "live",
  );
  const [section, setSection] = useState("overview");
  const params = useLocalSearchParams<{ module?: string }>();
  useEffect(() => {
    if (params.module) {
      setSection(params.module);
      router.setParams({ module: undefined });
    }
  }, [params.module]);
  useEffect(() => {
    if (section === "overview") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      setSection("overview");
      return true;
    });
    return () => listener.remove();
  }, [section]);
  const range = staffDateRange(days);
  const query = useQuery({
    queryKey: ["staff-overview", customer?.id, range, mode],
    enabled: !!customer && isStaffRole(customer.role) && active,
    queryFn: ({ signal }) =>
      getStaffOverview(range.from, range.to, mode, signal),
    staleTime: 15_000,
    refetchInterval: active ? 30_000 : false,
  });
  if (!restoring && !customer) return <Redirect href="/sign-in" />;
  if (customer && !isStaffRole(customer.role))
    return <Redirect href="/(tabs)" />;
  const data = query.data;
  const open = (id: string) => {
    if (["kitchen", "dispatch", "rider"].includes(id)) {
      router.push(
        id === "kitchen"
          ? "/kitchen"
          : id === "dispatch"
            ? "/dispatch"
            : "/rider",
      );
    } else if (
      id === "campaigns" &&
      [
        "admin",
        "staff",
        "ecommerce_manager",
        "marketing_manager",
        "content_manager",
      ].includes(customer?.role ?? "")
    ) {
      router.push("/campaign-studio");
    } else if (
      ["overview", "sales", "team", "audit", "enquiries"].includes(id)
    ) {
      setSection(id);
    } else {
      setSection(id);
    }
  };
  if (section !== "overview" && section !== "sales")
    return (
      <Screen
        title={
          data?.modules.find((m) => m.id === section)?.label ?? "Workspace"
        }
        right={
          <Button
            label="Overview"
            size="sm"
            variant="ghost"
            onPress={() => setSection("overview")}
          />
        }
      >
        {section === "earnings" ? (
          <EarningsPanel />
        ) : section === "corporate" ? (
          <BusinessPortal />
        ) : (
          <NativeStaffModule
            key={`${customer?.id}-${section}`}
            module={section}
          />
        )}
      </Screen>
    );
  return (
    <Screen
      title="Cake City workspace"
      subtitle="Your department. Your next move."
      right={
        <Button
          label="Sign out"
          size="sm"
          variant="ghost"
          onPress={() => void logout().then(() => router.replace("/sign-in"))}
        />
      }
    >
      <LinearGradient
        colors={["#261523", "#632447", "#A32467"]}
        style={{ padding: 24, borderRadius: 28, gap: 12 }}
      >
        <Text
          style={{
            color: "#F7C9E3",
            fontSize: 10,
            fontWeight: "800",
            letterSpacing: 1.5,
          }}
        >
          CAKE CITY / OPERATIONS
        </Text>
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: 27,
            fontWeight: "800",
            lineHeight: 35,
          }}
        >
          {staffGreeting((new Date().getUTCHours() + 3) % 24)},{" "}
          {customer?.first_name || "team"}.
        </Text>
        <Text style={{ color: "#F9DBEB", fontSize: 14, lineHeight: 22 }}>
          {data?.department ?? "Opening your department"}
        </Text>
        {data ? (
          <Text style={{ color: "#E8C4D9", fontSize: 11 }}>
            Updated{" "}
            {new Date(data.generated_at).toLocaleTimeString("en-KE", {
              timeZone: "Africa/Nairobi",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
          </Text>
        ) : null}
      </LinearGradient>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[7, 30, 90].map((value) => (
          <Button
            key={value}
            label={`${value} days`}
            size="sm"
            variant={days === value ? "primary" : "outline"}
            onPress={() => setDays(value)}
          />
        ))}
        <Button
          label="Refresh"
          size="sm"
          variant="ghost"
          loading={query.isFetching}
          onPress={() => void query.refetch()}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          label="Live operations"
          size="sm"
          variant={mode === "live" ? "secondary" : "ghost"}
          onPress={() => setMode("live")}
        />
        <Button
          label="Review orders"
          size="sm"
          variant={mode === "simulation" ? "secondary" : "ghost"}
          onPress={() => setMode("simulation")}
        />
      </View>
      {mode === "simulation" ? (
        <Notice message="Orders in review / KES 0 collected. These are separate from live sales." />
      ) : null}
      {query.isPending || restoring ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {data.kpis.map((item) => (
              <View
                key={item.key}
                style={{
                  flexGrow: 1,
                  flexBasis: "44%",
                  minWidth: 130,
                  padding: 18,
                  borderRadius: 22,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{
                    color:
                      item.key === "delivered" ? colors.success : colors.ink,
                    fontSize: 23,
                    fontWeight: "800",
                  }}
                >
                  {item.format === "money"
                    ? cash(item.value)
                    : item.value.toLocaleString("en-KE")}
                </Text>
                {item.change_percent !== null ? (
                  <Text
                    style={{
                      color:
                        item.change_percent >= 0
                          ? colors.success
                          : colors.error,
                      fontSize: 11,
                    }}
                  >
                    {item.change_percent > 0 ? "+" : ""}
                    {item.change_percent}% vs previous period
                  </Text>
                ) : null}
                <Text
                  style={{ color: colors.muted, fontSize: 10, lineHeight: 16 }}
                >
                  {item.hint}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
            Your workspace
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {data.modules
              .filter((m) => m.id !== "overview")
              .map((module) => (
                <Pressable
                  key={module.id}
                  accessibilityRole="button"
                  onPress={() => open(module.id)}
                  style={{
                    flexBasis: "45%",
                    flexGrow: 1,
                    minWidth: 130,
                    minHeight: 90,
                    padding: 16,
                    gap: 12,
                    borderRadius: 20,
                    backgroundColor: colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Ionicons
                    name={icons[module.id] ?? "grid-outline"}
                    size={23}
                    color={colors.brandStrong}
                  />
                  <Text
                    style={{
                      color: colors.ink,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {module.label}
                  </Text>
                </Pressable>
              ))}
          </View>
          {section !== "overview" ? (
            <Button
              label="Back to overview"
              variant="ghost"
              onPress={() => setSection("overview")}
            />
          ) : null}
          {["team", "audit", "enquiries"].includes(section) ? (
            <StaffRecords section={section as "team" | "audit" | "enquiries"} />
          ) : (
            <>
              {data.sales ? <SalesPanels sales={data.sales} /> : null}
              {data.workload.length ? (
                <View
                  style={{
                    padding: 20,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 16,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 19,
                      fontWeight: "800",
                    }}
                  >
                    Work in motion
                  </Text>
                  {data.workload.map((item) => (
                    <View
                      key={item.key}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 16,
                      }}
                    >
                      <Text style={{ color: colors.muted, flex: 1 }}>
                        {item.label}
                      </Text>
                      <Text
                        style={{
                          color: ["completed", "delivered"].includes(item.key)
                            ? colors.success
                            : colors.ink,
                          fontWeight: "800",
                        }}
                      >
                        {item.count}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {data.alerts.map((alert) => (
                <Pressable
                  key={alert.label}
                  accessibilityRole="button"
                  onPress={() => open(alert.tab)}
                  style={{
                    padding: 18,
                    flexDirection: "row",
                    gap: 16,
                    borderRadius: 18,
                    backgroundColor: colors.surfaceRaised,
                  }}
                >
                  <Text
                    style={{
                      color: colors.brandStrong,
                      fontSize: 20,
                      fontWeight: "800",
                    }}
                  >
                    {alert.count}
                  </Text>
                  <Text style={{ color: colors.ink, flex: 1, lineHeight: 21 }}>
                    {alert.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
              {data.activity.length ? (
                <View style={{ gap: 14 }}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 19,
                      fontWeight: "800",
                    }}
                  >
                    Recent activity
                  </Text>
                  {data.activity.map((item, index) => (
                    <View
                      key={index}
                      style={{
                        gap: 4,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.ink,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {item.action
                          .replaceAll("_", " ")
                          .replaceAll(".", " / ")}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        {item.reference} /{" "}
                        {new Date(item.at).toLocaleString("en-KE", {
                          timeZone: "Africa/Nairobi",
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
        All department tools open here in the app. queues show your current
        workload.
      </Text>
    </Screen>
  );
}

function SalesPanels({
  sales,
}: {
  sales: NonNullable<StaffOverview["sales"]>;
}) {
  const { colors } = useTheme();
  const max = Math.max(
    1,
    ...sales.trend.map((point) => Math.abs(point.net_minor)),
  );
  return (
    <>
      <View
        style={{
          backgroundColor: colors.surface,
          padding: 20,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 16,
        }}
      >
        <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 20 }}>
          Sales rhythm
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Daily net sales / {sales.trend[0]?.date} to {sales.trend.at(-1)?.date}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 8,
              minHeight: 145,
            }}
          >
            {sales.trend.map((point) => (
              <View
                key={point.date}
                accessible
                accessibilityLabel={`${point.date}. Net sales ${cash(point.net_minor)}. ${point.orders} paid orders.`}
                style={{
                  width: 28,
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: Math.max(
                      3,
                      (Math.abs(point.net_minor) / max) * 110,
                    ),
                    backgroundColor:
                      point.net_minor < 0
                        ? colors.error
                        : point.net_minor > 0
                          ? colors.brandStrong
                          : colors.border,
                    borderRadius: 6,
                  }}
                />
                <Text style={{ fontSize: 9, color: colors.muted }}>
                  {point.date.slice(8)}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
          {sales.definition}
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
          Most celebrated cakes
        </Text>
        {sales.top_products.length ? (
          sales.top_products.map((product, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.brandStrong, fontWeight: "800" }}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{ color: colors.ink, fontWeight: "700", fontSize: 13 }}
                >
                  {product.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {product.quantity} items / before discounts & reversals
                </Text>
              </View>
              <Text
                style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}
              >
                {cash(product.subtotal_minor)}
              </Text>
            </View>
          ))
        ) : (
          <Notice message="Top cakes appear when the live sales ledger contains item-linked purchases in this period." />
        )}
      </View>
    </>
  );
}
