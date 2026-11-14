import { useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import {
  Feedback,
  Notice,
  Screen,
  ui as baseUi,
} from "@/components/ui/Commerce";
import { deliveryQualityNotes } from "./delivery-feedback";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { logisticsApi, type WorkOrder, type Trip } from "./api";
import { useScreenActive } from "@/design/useScreenActive";
import { Disclosure } from "@/components/ui/Disclosure";
import { StaffDepartmentMetrics } from "@/features/staff/StaffDepartmentMetrics";
import { EarningsPanel } from "./EarningsPanel";
import { OrderAgentNotes } from "@/features/staff/ServiceDesk";
import { api } from "@/api/client";
import { Pressable } from "react-native";

export function OperationsScreen({ kitchen }: { kitchen: boolean }) {
  const { customer, logout } = useAuth();
  const roles = kitchen
    ? ["admin", "staff", "ecommerce_manager", "production", "head_chef"]
    : [
        "admin",
        "staff",
        "ecommerce_manager",
        "dispatch",
        "branch_dispatch",
        "branch_manager",
      ];
  return (
    <Screen
      title={kitchen ? "Kitchen" : "Dispatch"}
      subtitle={
        kitchen
          ? "Paid orders and production readiness"
          : "Order-linked rider assignments"
      }
      back
      right={
        <Button
          label="Overview"
          size="sm"
          variant="ghost"
          onPress={() => router.replace("/workspace")}
        />
      }
    >
      {customer ? (
        <Button
          label="Sign out of team workspace"
          variant="ghost"
          onPress={() => void logout().then(() => router.replace("/sign-in"))}
        />
      ) : null}
      {!customer ? (
        <Button label="Team sign in" onPress={() => router.push("/sign-in")} />
      ) : !roles.includes(customer.role) ? (
        <Notice message="This account does not have access to this workspace." />
      ) : (
        <Queue key={customer.id} owner={customer.id} kitchen={kitchen} />
      )}
    </Screen>
  );
}
function Queue({ owner, kitchen }: { owner: string; kitchen: boolean }) {
  const active = useScreenActive();
  const [selected, setSelected] = useState<string[]>([]),
    [bulkRider, setBulkRider] = useState(""),
    [bulkMessage, setBulkMessage] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false);
  const bulkRiders = useQuery({
    queryKey: ["bulk-riders", owner],
    enabled: !kitchen && active,
    queryFn: ({ signal }) => logisticsApi.riders(signal),
  });
  const bulk = async (action: string) => {
    setBulkBusy(true);
    try {
      const result = await api.post<{
        results: { reference: string; ok: boolean; message?: string }[];
      }>(
        "/v1/logistics/bulk-work",
        { references: selected, action, rider_id: bulkRider || null },
        { auth: true },
      );
      const failed = result.results.filter((r) => !r.ok);
      setSelected(failed.map((r) => r.reference));
      setBulkMessage(
        `${result.results.length - failed.length} updated.${failed.length ? " " + failed.map((r) => `${r.reference}: ${r.message}`).join(" ") : ""}`,
      );
      await Promise.all([
        query.refetch(),
        ...(!kitchen ? [tasks.refetch()] : []),
      ]);
    } catch (e) {
      setBulkMessage(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBulkBusy(false);
    }
  };
  const query = useQuery({
    queryKey: ["logistics-orders", owner, kitchen],
    queryFn: ({ signal }) => logisticsApi.orders(kitchen, signal),
    refetchInterval: active ? 15_000 : false,
    enabled: active,
  });
  const tasks = useQuery({
    queryKey: ["dispatch-tasks", owner],
    queryFn: ({ signal }) => logisticsApi.tasks(signal),
    enabled: !kitchen && active,
    refetchInterval: active ? 15_000 : false,
  });
  return (
    <>
      <StaffDepartmentMetrics />
      <Disclosure
        title={`Batch workspace${selected.length ? " · " + selected.length + " selected" : ""}`}
      >
        <Text>
          Select up to 20 orders. Each order is checked separately; blocked
          orders stay selected.
        </Text>
        {(query.data || []).map((order) => (
          <Pressable
            key={order.reference}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected.includes(order.reference) }}
            disabled={bulkBusy}
            onPress={() =>
              setSelected((v) =>
                v.includes(order.reference)
                  ? v.filter((r) => r !== order.reference)
                  : v.length < 20
                    ? [...v, order.reference]
                    : v,
              )
            }
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#E8DFE4",
              flexDirection: "row",
              gap: 10,
            }}
          >
            <Text>{selected.includes(order.reference) ? "✓" : "○"}</Text>
            <Text>
              {order.reference} · {order.status}
            </Text>
          </Pressable>
        ))}
        {kitchen ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="Start selected"
              disabled={!selected.length || bulkBusy}
              onPress={() => void bulk("preparing")}
            />
            <Button
              label="Mark selected ready"
              disabled={!selected.length || bulkBusy}
              onPress={() => void bulk("ready")}
            />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {bulkRiders.data?.map((r) => (
                <Button
                  key={r.id}
                  label={r.name}
                  size="sm"
                  variant={bulkRider === r.id ? "primary" : "outline"}
                  onPress={() => setBulkRider(r.id)}
                />
              ))}
            </View>
            <Button
              label="Assign selected orders"
              disabled={!selected.length || !bulkRider || bulkBusy}
              onPress={() => void bulk("assign_rider")}
            />
          </>
        )}
        {bulkMessage ? <Notice message={bulkMessage} /> : null}
      </Disclosure>
      {!kitchen ? (
        <Disclosure title="Rider earnings & payments">
          <EarningsPanel />
        </Disclosure>
      ) : null}
      {!kitchen ? (
        <Button
          label="Rider accounts / create rider"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/workspace",
              params: { module: "riders" },
            })
          }
        />
      ) : null}
      <Button
        label="Refresh work"
        variant="outline"
        onPress={() => {
          void query.refetch();
          if (!kitchen) void tasks.refetch();
        }}
      />
      {query.isPending || (!kitchen && tasks.isPending) ? (
        <Feedback loading />
      ) : query.isError || (!kitchen && tasks.isError) ? (
        <Feedback
          error={query.error || tasks.error}
          onRetry={() => {
            void query.refetch();
            if (!kitchen) void tasks.refetch();
          }}
        />
      ) : !query.data.length ? (
        <Notice message="No active paid orders are waiting in this workspace." />
      ) : (
        query.data.map((order) => (
          <WorkCard
            key={order.reference}
            owner={owner}
            kitchen={kitchen}
            order={order}
            allocated={
              (tasks.data ?? [])
                .filter(
                  (task) =>
                    task.reference === order.reference &&
                    task.status !== "cancelled",
                )
                .reduce(
                  (sum, task) =>
                    sum +
                    task.items.reduce(
                      (count, item) => count + item.quantity,
                      0,
                    ),
                  0,
                ) >= order.items.reduce((sum, item) => sum + item.quantity, 0)
            }
          />
        ))
      )}
      {!kitchen && tasks.data?.length ? (
        <>
          <Text>Dispatch activity</Text>
          {tasks.data
            .filter((task) => !["delivered", "cancelled"].includes(task.status))
            .map((task) => (
              <DispatchTask key={task.id} task={task} />
            ))}
          <Disclosure title="Completed dispatch activity">
            {tasks.data
              .filter((task) =>
                ["delivered", "cancelled"].includes(task.status),
              )
              .map((task) => (
                <DispatchTask key={task.id} task={task} />
              ))}
          </Disclosure>
        </>
      ) : null}
      {tasks.isError && !kitchen ? (
        <Notice error message={tasks.error.message} />
      ) : null}
    </>
  );
}
function WorkCard({
  owner,
  kitchen,
  order,
  allocated,
}: {
  owner: string;
  kitchen: boolean;
  order: WorkOrder;
  allocated: boolean;
}) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const [plant, setPlant] = useState(order.plant ?? "");
  const [rider, setRider] = useState("");
  const [destination, setDestination] = useState("");
  const riders = useQuery({
    queryKey: ["logistics-riders", owner],
    queryFn: ({ signal }) => logisticsApi.riders(signal),
    enabled: !kitchen,
  });
  const locations = useQuery({
    queryKey: ["kitchen-locations", owner],
    queryFn: ({ signal }) => logisticsApi.locations(signal),
    enabled: kitchen,
  });
  const mutation = useMutation({
    mutationFn: (action: string) =>
      action === "assign"
        ? logisticsApi.assignKitchen(order.reference, plant, owner)
        : action === "trip"
          ? logisticsApi.assignTrip(order.reference, rider, destination)
          : action === "collection"
            ? logisticsApi.collect(order.reference)
            : logisticsApi.kitchenProgress(order.reference, action),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["logistics-orders"] });
      await cache.invalidateQueries({ queryKey: ["dispatch-tasks"] });
      await cache.invalidateQueries({ queryKey: ["app-orders"] });
      await cache.invalidateQueries({ queryKey: ["app-order"] });
      await cache.invalidateQueries({ queryKey: ["order-updates"] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ["logistics-orders"] });
      void cache.invalidateQueries({ queryKey: ["dispatch-tasks"] });
    },
  });
  return (
    <View style={ui.panel} testID={`work-${order.reference}`}>
      <Text style={ui.heading}>{order.reference}</Text>
      <OrderAgentNotes reference={order.reference} />
      <Text style={ui.eyebrow}>{order.status.replaceAll("_", " ")}</Text>
      {order.payment_test && !order.review_checkout ? (
        <Notice message="SIMULATED TEST — no payment or physical fulfilment is required." />
      ) : null}
      {order.items.map((item, index) => (
        <View key={index}>
          <Text>
            {item.quantity} × {item.name}
          </Text>
          {typeof item.selection?.message === "string" &&
          item.selection.message ? (
            <Text style={ui.body}>Cake message: {item.selection.message}</Text>
          ) : null}
        </View>
      ))}
      <Text style={ui.body}>
        {order.fulfilment === "delivery" ? "Delivery" : "Pickup"} ·{" "}
        {order.plant === "hq"
          ? "Head Office"
          : (order.plant?.replace("branch:", "") ??
            "Production location unassigned")}
      </Text>
      {kitchen ? (
        <>
          {!order.assigned_to ? (
            <>
              <Notice message="Action required: assign the production location and responsible kitchen worker." />
              <Text style={ui.label}>Production location</Text>
              {locations.data?.map((location) => (
                <Button
                  key={location.id}
                  label={`${plant === location.id ? "Selected: " : ""}${location.name}`}
                  variant={plant === location.id ? "primary" : "outline"}
                  onPress={() => setPlant(location.id)}
                />
              ))}
              {locations.isError ? (
                <Notice error message={locations.error.message} />
              ) : null}
              <Button
                label="Assign production to me"
                disabled={!plant}
                loading={mutation.isPending}
                onPress={() => mutation.mutate("assign")}
              />
            </>
          ) : order.assigned_to !== owner ? (
            <Text style={ui.body}>
              Assigned to another kitchen team member.
            </Text>
          ) : null}
          {order.assigned_to && order.status === "paid" ? (
            <Button
              label="Start preparing"
              loading={mutation.isPending}
              onPress={() => mutation.mutate("preparing")}
            />
          ) : null}
          {order.assigned_to && order.status === "preparing" ? (
            <Button
              label={
                order.fulfilment === "delivery"
                  ? "Kitchen complete — ready for dispatch"
                  : "Kitchen complete — ready for pickup"
              }
              loading={mutation.isPending}
              onPress={() => mutation.mutate("ready")}
            />
          ) : null}
        </>
      ) : order.fulfilment !== "delivery" ? (
        <>
          <Notice
            message={
              order.status === "ready"
                ? "Ready for customer collection. Confirm only after handing over the order."
                : "The kitchen is still preparing this pickup order."
            }
          />
          {order.status === "ready" ? (
            <Button
              label="Confirm customer collected"
              loading={mutation.isPending}
              onPress={() => mutation.mutate("collection")}
            />
          ) : null}
        </>
      ) : !order.plant ? (
        <>
          <Notice message="Kitchen must confirm the production location before rider allocation." />
          <Button
            variant="outline"
            label="Open kitchen assignment"
            onPress={() => router.push("/kitchen")}
          />
        </>
      ) : allocated ? (
        <Notice message="All items have a rider assignment. Continue through Dispatch activity below, or the assigned rider's workspace." />
      ) : (
        <>
          <Text style={ui.label}>Assign a rider or driver</Text>
          {riders.data?.map((person) => (
            <Button
              key={person.id}
              label={`${rider === person.id ? "Selected: " : ""}${person.name}`}
              variant={rider === person.id ? "primary" : "outline"}
              onPress={() => setRider(person.id)}
            />
          ))}
          {riders.isError ? (
            <>
              <Notice error message={riders.error.message} />
              <Button
                variant="outline"
                label="Reload riders"
                onPress={() => void riders.refetch()}
              />
            </>
          ) : !riders.isPending && !riders.data?.length ? (
            <Notice message="Provision a rider account before assigning a trip." />
          ) : null}
          <Disclosure title="Change delivery destination">
            <Input
              label="Destination override (optional)"
              hint="Leave empty to use the order’s delivery address."
              value={destination}
              onChangeText={setDestination}
              maxLength={500}
            />
          </Disclosure>
          <Button
            label="Assign remaining order items"
            loading={mutation.isPending}
            disabled={!rider}
            onPress={() => mutation.mutate("trip")}
          />
        </>
      )}
      {mutation.isError ? (
        <Notice error message={mutation.error.message} />
      ) : null}
    </View>
  );
}

function DispatchTask({ task }: { task: Trip }) {
  const { colors, isDark } = useTheme();
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const [proof, setProof] = useState("");
  const [note, setNote] = useState("");
  const next: Record<string, [string, string]> = {
    assigned: ["accepted", "Confirm rider accepted"],
    accepted: ["collected", "Confirm handover to rider"],
    collected: ["in_transit", "Mark out for delivery"],
    in_transit: ["delivered", "Confirm delivered"],
    rescheduled: ["accepted", "Confirm rider accepted"],
  };
  const action = next[task.status];
  const mutation = useMutation({
    mutationFn: (status: string) =>
      logisticsApi.manage(task, status, note, proof),
    onSuccess: async () => {
      for (const queryKey of [
        ["dispatch-tasks"],
        ["logistics-orders"],
        ["app-orders"],
        ["app-order"],
        ["order-updates"],
      ])
        await cache.invalidateQueries({ queryKey });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ["dispatch-tasks"] });
      void cache.invalidateQueries({ queryKey: ["logistics-orders"] });
    },
  });
  return (
    <View
      style={[
        ui.panel,
        task.status === "delivered" && {
          borderColor: colors.success,
          backgroundColor: colors.successLight,
          borderRadius: 26,
          overflow: "hidden",
          shadowColor: "#14543C",
          shadowOpacity: 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 7 },
        },
      ]}
      testID={`dispatch-${task.id}`}
    >
      {task.status === "delivered" ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? ["#173D32", "#173126", "#213B31"]
                : ["#F3FCF6", "#DDF2E5", "#F5FCF8"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.24)", "rgba(255,255,255,0)"]}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 80,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.6)",
            }}
          />
          <LinearGradient
            colors={["#267451", "#12533B", "#226647"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#5AAB81",
            }}
          >
            <Ionicons name="checkmark-circle" size={19} color="#CBF5DC" />
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
              DELIVERY COMPLETED
            </Text>
          </LinearGradient>
        </>
      ) : null}
      <Text style={ui.heading}>{task.reference}</Text>
      {task.status !== "delivered" ? (
        <Text style={ui.eyebrow}>{task.status.replaceAll("_", " ")}</Text>
      ) : null}
      {task.status === "delivered" ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {deliveryQualityNotes(task.feedback).map((note) => (
              <Text
                key={note.label}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  fontWeight: "700",
                  fontSize: 12,
                  color:
                    note.tone === "good"
                      ? colors.success
                      : note.tone === "warning"
                        ? colors.warning
                        : note.tone === "issue"
                          ? colors.error
                          : colors.muted,
                  backgroundColor: colors.surface,
                }}
              >
                {note.label}
              </Text>
            ))}
          </View>
          <Text style={{ color: colors.ink, fontWeight: "700" }}>
            {task.feedback
              ? `${task.feedback.rating} / 5 stars / Customer rating`
              : "Ride not yet rated"}
          </Text>
          {task.feedback?.comment ? (
            <Text style={{ color: colors.ink, lineHeight: 22 }}>
              {task.feedback.comment}
            </Text>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Arrival time and condition are reported by the customer.
          </Text>
        </View>
      ) : null}
      <Text>{task.rider_name || "Rider unassigned"}</Text>
      <Text style={ui.body}>{task.destination}</Text>
      {task.status === "in_transit" ? (
        <Input
          label="Delivery confirmation"
          hint="Recipient name and delivery confirmation"
          value={proof}
          onChangeText={setProof}
          maxLength={1000}
        />
      ) : null}
      {action ? (
        <Button
          label={action[1]}
          disabled={
            mutation.isPending ||
            (task.status === "in_transit" && proof.trim().length < 3)
          }
          loading={mutation.isPending}
          onPress={() => mutation.mutate(action[0])}
        />
      ) : null}
      {["assigned", "accepted", "failed", "rescheduled"].includes(
        task.status,
      ) ? (
        <>
          <Input
            label="Exception reason"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
          {task.status === "failed" ? (
            <Button
              variant="outline"
              label="Reopen assignment"
              disabled={note.trim().length < 5 || mutation.isPending}
              onPress={() => mutation.mutate("rescheduled")}
            />
          ) : null}
          <Button
            variant="ghost"
            label="Cancel this assignment"
            disabled={note.trim().length < 5 || mutation.isPending}
            onPress={() => mutation.mutate("cancelled")}
          />
        </>
      ) : null}
      {mutation.isError ? (
        <Notice error message={mutation.error.message} />
      ) : null}
    </View>
  );
}
