import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Screen,
  AccountRequired,
  Feedback,
  Chip,
  Section,
  Notice,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/auth/AuthProvider";
import { customerApi } from "@/features/commerce/api";
import { money } from "@/features/commerce/contracts";
import { useBag } from "@/features/commerce/store";
import { tokens } from "@/theme/tokens";
const terminal = [
  "delivered",
  "completed",
  "cancelled",
  "refunded",
  "payment_failed",
];
const date = (v: string) =>
  new Date(v).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function OrdersScreen() {
  return (
    <Screen title="Happy memories." subtitle="And celebrations on their way.">
      <AccountRequired>
        <OrderList />
      </AccountRequired>
    </Screen>
  );
}
function OrderList() {
  const { customer } = useAuth();
  const [past, setPast] = useState(false);
  const query = useQuery({
    queryKey: ["orders", customer?.id],
    queryFn: customerApi.orders,
  });
  const orders =
    query.data?.filter((o) => terminal.includes(o.state) === past) ?? [];
  return (
    <>
      <View style={ui.row}>
        <Chip
          label="In progress"
          selected={!past}
          onPress={() => setPast(false)}
        />
        <Chip
          label="Past celebrations"
          selected={past}
          onPress={() => setPast(true)}
        />
      </View>
      <Feedback
        loading={query.isPending}
        error={query.error}
        empty={
          query.isSuccess && !orders.length
            ? "No celebrations here yet."
            : undefined
        }
        onRetry={() => void query.refetch()}
      />
      {orders.map((o) => (
        <Pressable
          accessibilityRole="button"
          key={o.reference}
          onPress={() =>
            router.push({
              pathname: "/order/[reference]",
              params: { reference: o.reference },
            })
          }
          style={ui.panel}
        >
          <View style={ui.spread}>
            <Text style={ui.label}>{o.reference}</Text>
            <Ionicons
              name="arrow-forward"
              size={21}
              color={tokens.color.brandStrong}
            />
          </View>
          <Text style={ui.eyebrow}>{o.state.replace(/_/g, " ")}</Text>
          <Text style={ui.body}>
            {date(o.created_at)} · {o.fulfilment}
          </Text>
          <Text style={ui.heading}>{money(o.total)}</Text>
        </Pressable>
      ))}
    </>
  );
}
export function OrderScreen() {
  return (
    <Screen title="Your celebration." back>
      <AccountRequired>
        <OrderDetail />
      </AccountRequired>
    </Screen>
  );
}
function OrderDetail() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { customer } = useAuth();
  const add = useBag((s) => s.add);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reorderNotice, setReorderNotice] = useState("");
  const query = useQuery({
    queryKey: ["order", reference, customer?.id],
    queryFn: () => customerApi.order(reference),
    refetchInterval: (q) =>
      terminal.includes(q.state.data?.state ?? "") ? false : 15000,
  });
  const order = query.data;
  const messages = useQuery({
    queryKey: ["delivery-messages", reference, customer?.id],
    queryFn: () => customerApi.messages(reference),
    enabled: !!order?.driver_tracking,
    refetchInterval:
      order?.driver_tracking && !terminal.includes(order.state) ? 20000 : false,
  });
  async function reorder() {
    setBusy(true);
    try {
      const result = await customerApi.reorder(reference);
      for (const p of result.available)
        add({
          key: "",
          slug: p.slug,
          name: p.name,
          image: p.image_url,
          price: p.price_kes,
          quantity: p.quantity,
          selection: p.configuration,
        });
      setReorderNotice(
        result.unavailable.length
          ? result.unavailable
              .map((p) => p.product_name + ": " + p.reason)
              .join("\n")
          : result.message,
      );
      if (result.available.length)
        toast(result.available.length + " item(s) added with current prices.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reorder could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  if (!order)
    return (
      <Feedback
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <>
      <View
        style={[
          ui.panel,
          { backgroundColor: tokens.color.accentLight, borderWidth: 0 },
        ]}
      >
        <Text style={ui.eyebrow}>{order.reference}</Text>
        <Text style={ui.title}>{order.state.replace(/_/g, " ")}</Text>
        <Text style={ui.body}>
          {order.fulfilment === "pickup"
            ? "Collection from Cake City"
            : "Delivered with care"}
        </Text>
        {order.branch_name ? (
          <Text style={ui.label}>{order.branch_name}</Text>
        ) : null}
        {order.driver_tracking?.estimated_arrival_at ? (
          <Text style={ui.label}>
            Estimated arrival ·{" "}
            {date(order.driver_tracking.estimated_arrival_at)}
          </Text>
        ) : order.delivery_slot ? (
          <Text style={ui.body}>Scheduled · {order.delivery_slot}</Text>
        ) : (
          <Text style={ui.body}>
            Your next update will appear here as the team prepares your order.
          </Text>
        )}
      </View>
      <Section title="Every step, in the know" />
      {order.timeline.length ? (
        order.timeline.map((event, i) => (
          <View key={event.id} style={[ui.row, { alignItems: "flex-start" }]}>
            <View style={{ width: 30, alignItems: "center" }}>
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={tokens.color.brandStrong}
              />
              {i < order.timeline.length - 1 ? (
                <View
                  style={{
                    height: 44,
                    width: 2,
                    backgroundColor: tokens.color.border,
                  }}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 20 }}>
              <Text style={ui.label}>{event.title}</Text>
              {event.detail ? (
                <Text style={ui.body}>{event.detail}</Text>
              ) : null}
              <Text style={[ui.body, { fontSize: 12, marginTop: 4 }]}>
                {date(event.occurred_at)}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Notice message="Tracking updates will appear when Cake City confirms the next step." />
      )}
      {order.driver_tracking ? (
        <View style={ui.panel}>
          <Section title="Your delivery partner" />
          <Text style={ui.label}>{order.driver_tracking.driver_name}</Text>
          {order.driver_tracking.vehicle ? (
            <Text style={ui.body}>{order.driver_tracking.vehicle}</Text>
          ) : null}
          <Text style={ui.body}>
            {order.driver_tracking.state.replace(/_/g, " ")}
          </Text>
          {order.driver_tracking.location ? (
            <>
              <Text style={[ui.body, { fontSize: 12 }]}>
                Location last updated{" "}
                {date(order.driver_tracking.location.recorded_at)}
              </Text>
              <Button
                variant="outline"
                label="View courier location on map"
                onPress={() => {
                  const l = order.driver_tracking!.location!;
                  void Linking.openURL(
                    "https://www.google.com/maps/search/?api=1&query=" +
                      l.latitude +
                      "," +
                      l.longitude,
                  ).catch(() => toast("Maps could not be opened."));
                }}
              />
            </>
          ) : null}
          {messages.data?.map((m) => (
            <View key={m.id}>
              <Text style={ui.eyebrow}>{m.sender_role}</Text>
              <Text style={ui.body}>{m.body}</Text>
            </View>
          ))}
          {!terminal.includes(order.state) ? (
            <>
              <Input
                label="Message your delivery partner"
                value={message}
                onChangeText={setMessage}
                maxLength={500}
              />
              <Button
                variant="outline"
                label="Send message"
                disabled={!message.trim() || busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await customerApi.sendMessage(reference, message.trim());
                    setMessage("");
                    await messages.refetch();
                  } catch (e) {
                    toast(
                      e instanceof Error
                        ? e.message
                        : "Message could not be sent.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : null}
        </View>
      ) : null}
      <Section title="Made for you" />
      {order.lines.map((l) => (
        <View key={l.id} style={ui.spread}>
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>
              {l.quantity} × {l.product_name}
            </Text>
            {typeof l.configuration.message === "string" &&
            l.configuration.message ? (
              <Text style={ui.body}>“{l.configuration.message}”</Text>
            ) : null}
          </View>
          <Text style={ui.label}>{money(l.line_total)}</Text>
        </View>
      ))}
      <View style={ui.spread}>
        <Text style={ui.heading}>Order total</Text>
        <Text style={ui.heading}>{money(order.total)}</Text>
      </View>
      {reorderNotice ? <Notice message={reorderNotice} /> : null}
      <Button
        label="Order these favourites again"
        loading={busy}
        onPress={() => void reorder()}
      />
      {reorderNotice ? (
        <Button
          variant="outline"
          label="Review bag"
          onPress={() => router.push("/cart")}
        />
      ) : null}
      <Button
        variant="ghost"
        label="Refresh order"
        onPress={() => void query.refetch()}
      />
    </>
  );
}
