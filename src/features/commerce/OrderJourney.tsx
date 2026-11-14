import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";
import type { AppOrder } from "./app-orders";
import { orderTracking } from "./order-tracking";
import { orderStageLabel } from "./ActiveOrderCard";
import { useScreenActive } from "@/design/useScreenActive";
import { LiveDeliveryMap } from "./LiveDeliveryMap";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { appMedia } from "./app-media";
import {
  tripStageLabel,
  visibleRiderPoint,
  trackingDestination,
} from "./live-tracking";

export function OrderJourney({
  order,
  refresh,
  refreshing,
}: {
  order: AppOrder;
  refresh: () => void;
  refreshing: boolean;
}) {
  const { colors } = useTheme();
  const active = useScreenActive();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, [active]);
  const steps = orderTracking(order);
  const trips = (order.deliveries ?? []).filter(
    (trip) => trip.status !== "cancelled",
  );
  const moving = trips.find(
    (trip) =>
      trip.position && ["collected", "in_transit"].includes(trip.status),
  );
  const point =
    order.status === "completed"
      ? null
      : visibleRiderPoint(moving?.position, now);
  const delivery = order.snapshot?.checkout.fulfilment !== "pickup";
  const destination = (
    moving
      ? moving.destination_matches_checkout
      : trips.some((trip) => trip.destination_matches_checkout)
  )
    ? trackingDestination(order)
    : null;
  const completed = order.status === "completed";
  const currentStep = completed
    ? -1
    : steps.reduce((latest, step, index) => (step.at ? index : latest), -1);
  const needsHelp = trips.some((trip) =>
    ["failed", "rescheduled"].includes(trip.status),
  );
  const copy = completed
    ? "Your celebration has arrived. Enjoy every slice."
    : needsHelp
      ? "Dispatch is arranging the next step for your cake. Contact our team for help."
      : order.status === "out_for_delivery"
        ? "Your rider is bringing a little happiness your way."
        : order.status === "ready"
          ? delivery
            ? "Freshly finished. Your cake is ready for the rider."
            : "Freshly finished. Your cake is ready to collect."
          : order.status === "preparing"
            ? "A little care, a little craft. Your cake is in the kitchen."
            : "Every great celebration begins with a little anticipation.";
  return (
    <View testID="order-journey" style={{ gap: 24 }}>
      <View style={{ borderRadius: 30, ...tokens.shadow.floating }}>
        <LinearGradient
          colors={
            completed
              ? ["#193F36", "#28634B", "#367552"]
              : ["#32172D", "#672445", "#9E245F"]
          }
          style={styles.hero}
        >
          <View style={styles.top}>
            <Text style={styles.kicker}>MADE FOR YOUR MOMENT</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh order tracking"
              accessibilityState={{ busy: refreshing }}
              disabled={refreshing}
              onPress={refresh}
              hitSlop={8}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              {refreshing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="refresh-outline" size={21} color="#FFFFFF" />
              )}
            </Pressable>
            <View style={styles.mark}>
              <Ionicons
                name={
                  completed
                    ? "checkmark"
                    : delivery
                      ? "bicycle-outline"
                      : "gift-outline"
                }
                size={25}
                color={completed ? "#86EFAC" : "#FFE1A8"}
              />
            </View>
          </View>
          <Text style={styles.title}>
            {!completed && needsHelp
              ? "A delivery update"
              : orderStageLabel(order.status)}
          </Text>
          <Text style={styles.copy}>{copy}</Text>
          {order.snapshot?.lines?.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
            >
              {order.snapshot.lines.map((line, index) => (
                <View
                  key={`${line.sku_id}-${index}`}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.09)",
                    padding: 9,
                    borderRadius: 18,
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                    maxWidth: 250,
                  }}
                >
                  {line.image ? (
                    <LoadingImage
                      source={{ uri: appMedia(line.image) }}
                      contentFit="cover"
                      style={{ width: 48, height: 48, borderRadius: 13 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="gift-outline" color="#FFE1A8" size={24} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: "white",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {line.name}
                    </Text>
                    <Text style={{ color: "#F4DCE9", fontSize: 10 }}>
                      {line.quantity} × {String(line.selection.size || "Cake")}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.pips}>
            {steps.map((step, index) => (
              <View
                key={step.label}
                style={[
                  styles.pip,
                  {
                    backgroundColor:
                      step.at && index !== currentStep
                        ? "#86EFAC"
                        : index === currentStep
                          ? "#FFFFFF"
                          : "rgba(255,255,255,0.18)",
                  },
                ]}
              />
            ))}
          </View>
          <Text selectable style={styles.reference}>
            {order.reference}
          </Text>
        </LinearGradient>
      </View>
      {trips.some((t) => t.rider) ? (
        <View style={{ gap: 12 }}>
          {trips
            .filter((t) => t.rider)
            .map((trip) => (
              <View
                key={trip.id}
                style={{
                  padding: 20,
                  borderRadius: 25,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <LinearGradient
                    colors={["#F8E2F0", "#EEC3DC"]}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "800",
                        color: "#722148",
                      }}
                    >
                      {trip
                        .rider!.name.split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </Text>
                  </LinearGradient>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      style={{
                        color: colors.muted,
                        fontSize: 10,
                        letterSpacing: 1,
                        fontWeight: "700",
                      }}
                    >
                      YOUR {trip.rider!.role === "driver" ? "DRIVER" : "RIDER"}
                    </Text>
                    <Text
                      style={{
                        color: colors.ink,
                        fontWeight: "800",
                        fontSize: 18,
                      }}
                    >
                      {trip.rider!.name}
                    </Text>
                    <Text
                      style={{
                        color:
                          trip.status === "delivered"
                            ? colors.success
                            : colors.brandStrong,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {tripStageLabel(trip.status)}
                      {trips.length > 1
                        ? ` · Delivery ${trips.indexOf(trip) + 1}`
                        : ""}
                    </Text>
                  </View>
                  {trip.rider!.phone ? (
                    <Button
                      size="sm"
                      variant="outline"
                      label="Call rider"
                      onPress={() =>
                        void Linking.openURL(
                          `tel:${trip.rider!.phone.replace(/[^+0-9]/g, "")}`,
                        )
                      }
                    />
                  ) : null}
                </View>
                {trip.rider!.phone ? (
                  <Text
                    selectable
                    style={{ color: colors.muted, fontSize: 13 }}
                  >
                    {trip.rider!.phone}
                  </Text>
                ) : null}
              </View>
            ))}
        </View>
      ) : null}
      {delivery && !completed && trips.length ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  point && !point.stale ? colors.success : colors.muted,
              }}
            />
            <Text
              style={{ fontWeight: "700", color: colors.ink, fontSize: 15 }}
            >
              {point
                ? point.stale
                  ? "Last known rider location"
                  : "Follow your delivery"
                : "Your delivery"}
            </Text>
          </View>
          {point || destination ? (
            <LiveDeliveryMap position={point} destination={destination} />
          ) : null}
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}
          >
            {point
              ? `${point.stale ? "Signal paused. Last update" : "Location updated"} ${new Date(point.recorded_at).toLocaleTimeString()}. GPS accuracy about ${Math.round(point.accuracy)} m.`
              : "Waiting for the rider to collect your cake and share their location. Dispatch stages below update as the team progresses."}
          </Text>
          {point ? (
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
              The pin follows GPS updates. Arrival time is not yet available.
            </Text>
          ) : null}
        </View>
      ) : null}
      {order.dispatch && !trips.some((t) => t.rider) ? (
        <View
          style={[
            styles.rider,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...tokens.shadow.card,
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.brandLight }]}>
            <Ionicons
              name="bicycle-outline"
              size={25}
              color={colors.brandStrong}
            />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{ color: colors.muted, fontSize: 10, letterSpacing: 1 }}
            >
              YOUR DELIVERY PARTNER
            </Text>
            <Text
              style={{ color: colors.ink, fontWeight: "700", fontSize: 16 }}
            >
              {order.dispatch.rider_name}
            </Text>
          </View>
          {order.dispatch.rider_phone ? (
            <Button
              size="sm"
              variant="outline"
              label="Call rider"
              onPress={() =>
                void Linking.openURL(
                  `tel:${order.dispatch!.rider_phone.replace(/[^+0-9]/g, "")}`,
                )
              }
            />
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.panel,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text
          style={{
            color: colors.ink,
            fontSize: 19,
            fontWeight: "700",
            marginBottom: 12,
          }}
        >
          Your cake's journey
        </Text>
        {steps.map((step, index) => (
          <View
            key={step.label}
            style={{ flexDirection: "row", gap: 16, minHeight: 64 }}
          >
            <View style={{ alignItems: "center", width: 24 }}>
              <Ionicons
                name={
                  step.at && index !== currentStep
                    ? "checkmark-circle"
                    : index === currentStep
                      ? "radio-button-on"
                      : "ellipse-outline"
                }
                size={23}
                color={
                  step.at && index !== currentStep
                    ? colors.success
                    : index === currentStep
                      ? colors.brandStrong
                      : colors.borderStrong
                }
              />
              {index < steps.length - 1 ? (
                <View
                  style={{
                    width: 1,
                    flex: 1,
                    backgroundColor:
                      step.at && steps[index + 1]?.at
                        ? colors.success
                        : colors.border,
                    marginVertical: 5,
                  }}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 5, paddingBottom: 22 }}>
              <Text
                style={{
                  color:
                    step.at && index !== currentStep
                      ? colors.success
                      : index === currentStep
                        ? colors.brandStrong
                        : colors.muted,
                  fontWeight: step.at ? "700" : "400",
                  fontSize: 14,
                }}
              >
                {step.label}
              </Text>
              {step.at ? (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {new Date(step.at).toLocaleString()}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {trips.map((trip, index) => (
          <View
            key={trip.id}
            style={{
              paddingVertical: 16,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
              gap: 10,
            }}
          >
            <Text
              style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}
            >
              {trips.length > 1 ? `Delivery ${index + 1} · ` : ""}
              {tripStageLabel(trip.status)}
            </Text>
            {trip.events.map((event, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>
                  {tripStageLabel(event.status)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {new Date(event.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))}
            {trip.scheduled_at ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Scheduled {new Date(trip.scheduled_at).toLocaleString()}
                {trip.slot ? ` · ${trip.slot}` : ""}
              </Text>
            ) : null}
          </View>
        ))}
        {order.snapshot?.route ? (
          <View style={{ gap: 6, paddingBottom: 16 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              From {order.snapshot.route.origin_name}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
              {order.snapshot.route.destination_name}
              {order.snapshot.route.destination_address
                ? ` · ${order.snapshot.route.destination_address}`
                : ""}
            </Text>
          </View>
        ) : null}
        {!delivery &&
        typeof order.snapshot?.pickup_instructions === "string" ? (
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 20,
              marginBottom: 14,
            }}
          >
            {order.snapshot.pickup_instructions}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  hero: { padding: 26, borderRadius: 30, gap: 20, overflow: "hidden" },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  kicker: {
    flex: 1,
    fontSize: 9,
    lineHeight: 16,
    letterSpacing: 1.6,
    color: "#F6C9DC",
    fontWeight: "700",
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 31,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  copy: { color: "#F7DFE8", fontSize: 13, lineHeight: 22, maxWidth: 280 },
  reference: { color: "#F6C9DC", fontSize: 10, letterSpacing: 0.3 },
  pips: { flexDirection: "row", gap: 6, paddingTop: 8 },
  pip: { height: 4, flex: 1, borderRadius: 2 },
  panel: {
    padding: 24,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
