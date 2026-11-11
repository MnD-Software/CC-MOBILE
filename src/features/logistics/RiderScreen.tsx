import { useState } from "react";
import { Linking, View } from "react-native";
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
import { logisticsApi, type Trip } from "./api";
import { RiderLocationSharing } from "./RiderLocationSharing";
import { useScreenActive } from "@/design/useScreenActive";
import { Disclosure } from "@/components/ui/Disclosure";

export function RiderScreen() {
  const { customer, logout } = useAuth();
  return (
    <Screen
      title="Your deliveries"
      subtitle="Collection, route and delivery updates"
      back
    >
      {customer ? (
        <Button
          label="Sign out of rider workspace"
          variant="ghost"
          onPress={() =>
            void logout().then(() => router.replace("/rider-login"))
          }
        />
      ) : null}
      {!customer ? (
        <Button
          label="Rider sign in"
          onPress={() => router.push("/rider-login")}
        />
      ) : !["rider", "driver"].includes(customer.role) ? (
        <Notice message="This account has no rider access. Ask Dispatch to provision your rider account." />
      ) : (
        <RiderQueue key={customer.id} owner={customer.id} />
      )}
    </Screen>
  );
}
function RiderQueue({ owner }: { owner: string }) {
  const active = useScreenActive();
  const query = useQuery({
    queryKey: ["rider-tasks", owner],
    queryFn: ({ signal }) => logisticsApi.riderTasks(signal),
    refetchInterval: active ? 15_000 : false,
    enabled: active,
  });
  return (
    <>
      <Notice message="Assigned work refreshes every 15 seconds while this screen is open. Collection is available after Kitchen confirms readiness." />
      <Button
        label="Refresh assignments"
        variant="outline"
        onPress={() => void query.refetch()}
      />
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.length ? (
        <Notice message="No deliveries have been assigned to you yet." />
      ) : (
        <>
          {query.data
            .filter((task) => !["delivered", "cancelled"].includes(task.status))
            .map((task) => (
              <TripCard key={task.id} task={task} />
            ))}
          <Disclosure title="Completed deliveries">
            {query.data
              .filter((task) =>
                ["delivered", "cancelled"].includes(task.status),
              )
              .map((task) => (
                <TripCard key={task.id} task={task} />
              ))}
          </Disclosure>
        </>
      )}
    </>
  );
}
function TripCard({ task }: { task: Trip }) {
  const ui = useThemedStyles(baseUi);
  const cache = useQueryClient();
  const [proof, setProof] = useState("");
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: (status: string) =>
      logisticsApi.progress(task, status, note, proof),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["rider-tasks"] });
      await cache.invalidateQueries({ queryKey: ["app-order"] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ["rider-tasks"] });
    },
  });
  const next: Record<string, [string, string]> = {
    assigned: ["accepted", "Accept assignment"],
    rescheduled: ["accepted", "Accept rescheduled assignment"],
    accepted: ["collected", "Confirm collection"],
    collected: ["in_transit", "Start delivery"],
    in_transit: ["delivered", "Confirm delivery"],
  };
  const action = next[task.status];
  return (
    <View style={ui.panel} testID={`trip-${task.id}`}>
      <Text style={ui.heading}>{task.reference}</Text>
      <Text style={ui.eyebrow}>{task.status.replaceAll("_", " ")}</Text>
      {task.payment_test ? (
        <Notice message="SIMULATED TEST — no physical delivery or payment is required." />
      ) : null}
      <Text style={ui.body}>
        {task.service_type === "branch_transfer"
          ? "Branch transfer"
          : "Customer delivery"}{" "}
        ·{" "}
        {task.plant === "hq"
          ? "Head Office"
          : task.plant.replace("branch:", "")}
      </Text>
      <Text>{task.recipient}</Text>
      <Text>{task.destination}</Text>
      <RiderLocationSharing taskId={task.id} status={task.status} />
      <Text style={ui.body}>
        {task.items.reduce((total, item) => total + item.quantity, 0)} item(s)
      </Text>
      {task.scheduled_at ? (
        <Text>
          Scheduled: {new Date(task.scheduled_at).toLocaleString()}
          {task.slot ? ` · ${task.slot}` : ""}
        </Text>
      ) : null}
      <Button
        variant="outline"
        label="Open directions"
        onPress={() =>
          void Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.destination)}`,
          )
        }
      />
      {task.phone ? (
        <Button
          variant="ghost"
          label="Call recipient"
          onPress={() =>
            void Linking.openURL(`tel:${task.phone.replace(/[^+0-9]/g, "")}`)
          }
        />
      ) : null}
      {task.status === "in_transit" ? (
        <Input
          label="Delivery confirmation"
          placeholder="Recipient name and confirmation"
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
      {!["delivered", "cancelled", "failed"].includes(task.status) ? (
        <>
          <Input
            label="Delivery issue"
            placeholder="Describe any issue for Dispatch"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
          <Button
            variant="outline"
            label="Report unsuccessful trip"
            disabled={note.trim().length < 5 || mutation.isPending}
            onPress={() => mutation.mutate("failed")}
          />
        </>
      ) : null}
      {mutation.isError ? (
        <Notice error message={mutation.error.message} />
      ) : null}
    </View>
  );
}
