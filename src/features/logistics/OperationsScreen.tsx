import { useState } from "react";
import { View } from "react-native";
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
import { useThemedStyles } from "@/theme/ThemeProvider";
import { logisticsApi, type WorkOrder, type Trip } from "./api";

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
  const query = useQuery({
    queryKey: ["logistics-orders", owner, kitchen],
    queryFn: ({ signal }) => logisticsApi.orders(kitchen, signal),
    refetchInterval: 15_000,
  });
  const tasks = useQuery({
    queryKey: ["dispatch-tasks", owner],
    queryFn: ({ signal }) => logisticsApi.tasks(signal),
    enabled: !kitchen,
    refetchInterval: 15_000,
  });
  return (
    <>
      <Button
        label="Refresh work"
        variant="outline"
        onPress={() => {
          void query.refetch();
          if (!kitchen) void tasks.refetch();
        }}
      />
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
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
          {tasks.data.map((task) => (
            <DispatchTask key={task.id} task={task} />
          ))}
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
  });
  return (
    <View style={ui.panel} testID={`work-${order.reference}`}>
      <Text style={ui.heading}>{order.reference}</Text>
      <Text style={ui.eyebrow}>{order.status.replaceAll("_", " ")}</Text>
      {order.payment_test ? (
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
            <Notice error message={riders.error.message} />
          ) : !riders.isPending && !riders.data?.length ? (
            <Notice message="Provision a rider account before assigning a trip." />
          ) : null}
          <Input
            label="Destination override (optional)"
            hint="Leave empty to use the order’s delivery address."
            value={destination}
            onChangeText={setDestination}
            maxLength={500}
          />
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
  });
  return (
    <View style={ui.panel} testID={`dispatch-${task.id}`}>
      <Text style={ui.heading}>{task.reference}</Text>
      <Text style={ui.eyebrow}>{task.status.replaceAll("_", " ")}</Text>
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
