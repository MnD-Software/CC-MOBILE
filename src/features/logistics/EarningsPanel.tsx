import { useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Typography";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Disclosure } from "@/components/ui/Disclosure";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { exportExcel } from "@/features/staff/report-export";

const tripSchema = z.object({
  task_id: z.string(),
  reference: z.string(),
  rider_name: z.string(),
  trip_status: z.string(),
  service_type: z.string(),
  status: z.string(),
  distance_meters: z.number().nullable(),
  amount_minor: z.number().nullable(),
  balance_minor: z.number(),
  paid_minor: z.number(),
  payments: z.array(
    z.object({
      id: z.string(),
      reference: z.string(),
      amount_minor: z.number(),
      paid_at: z.string(),
    }),
  ),
});
const schema = z.object({
  trips: z.array(tripSchema),
  totals: z.object({
    earned_minor: z.number(),
    approved_minor: z.number(),
    paid_minor: z.number(),
    balance_minor: z.number(),
  }),
});
const cash = (n: number) =>
  `KES ${(n / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
type Trip = z.infer<typeof tripSchema>;
export function EarningsPanel() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const cache = useQueryClient();
  const [days, setDays] = useState(30),
    [selected, setSelected] = useState<Trip | null>(null),
    [mode, setMode] = useState<"fare" | "payment">("fare"),
    [value, setValue] = useState(""),
    [reference, setReference] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(randomUUID());
  const from = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  const params = `?from_date=${from}`;
  const query = useQuery({
    queryKey: ["rider-earnings", customer?.id, days],
    queryFn: async () =>
      schema.parse(
        await api.get("/v1/rider-earnings" + params, { auth: true }),
      ),
    enabled: !!customer,
    refetchInterval: 30000,
  });
  const manager = !["rider", "driver", "finance"].includes(
    customer?.role || "",
  );
  async function work(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setSelected(null);
      await cache.invalidateQueries({ queryKey: ["rider-earnings"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const open = (trip: Trip, kind: "fare" | "payment") => {
    setSelected(trip);
    setMode(kind);
    setValue(
      kind === "fare" && trip.distance_meters
        ? String(trip.distance_meters / 1000)
        : kind === "payment"
          ? String(trip.balance_minor / 100)
          : "",
    );
    setReference("");
    setRequestKey(randomUUID());
    setError("");
  };
  return (
    <View style={{ gap: 16 }}>
      <LinearGradient
        colors={["#123F36", "#17694E", "#409574"]}
        style={{ borderRadius: 28, padding: 24, gap: 12 }}
      >
        <Text
          style={{
            color: "#D5F4DF",
            letterSpacing: 2,
            fontSize: 10,
            fontWeight: "800",
          }}
        >
          EVERY MILE, ACCOUNTED FOR
        </Text>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "800" }}>
          {manager ? "Rider payments" : "Your earnings"}
        </Text>
        <Text style={{ color: "#E5F8ED", lineHeight: 21 }}>
          Delivery: KES 85 + KES 15/km. Every completed trip has a clear payment
          trail.
        </Text>
        <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
          {query.data &&
            [
              ["Earned", query.data.totals.earned_minor],
              ["Paid", query.data.totals.paid_minor],
              ["Approved balance", query.data.totals.balance_minor],
            ].map(([label, amount]) => (
              <View key={String(label)} style={{ gap: 5 }}>
                <Text style={{ color: "#D5F4DF", fontSize: 11 }}>{label}</Text>
                <Text
                  style={{ color: "white", fontWeight: "800", fontSize: 19 }}
                >
                  {cash(Number(amount))}
                </Text>
              </View>
            ))}
        </View>
      </LinearGradient>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {[7, 30, 90].map((n) => (
          <Button
            key={n}
            size="sm"
            label={`${n} days`}
            variant={days === n ? "primary" : "outline"}
            onPress={() => setDays(n)}
          />
        ))}
        <Button
          label="Excel report"
          size="sm"
          variant="outline"
          loading={busy}
          onPress={() =>
            void work(() =>
              exportExcel(
                "/v1/rider-earnings/report.xlsx" + params,
                "rider-payments",
              ),
            )
          }
        />
      </View>
      {error ? <Notice error message={error} /> : null}
      {query.isPending ? (
        <Feedback loading />
      ) : query.isError ? (
        <Feedback error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data.trips.length ? (
        <Notice message="Your assigned trips and their payment history will appear here." />
      ) : (
        query.data.trips.map((t) => (
          <View
            key={t.task_id}
            style={{
              borderRadius: 24,
              padding: 20,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: t.status === "paid" ? colors.success : colors.border,
              gap: 10,
            }}
          >
            <Text
              style={{ fontWeight: "800", color: colors.ink, fontSize: 17 }}
            >
              {t.reference}
            </Text>
            <Text style={{ color: colors.muted }}>
              {t.rider_name} · {t.trip_status.replaceAll("_", " ")}
            </Text>
            <Text
              style={{ fontSize: 23, fontWeight: "800", color: colors.success }}
            >
              {t.amount_minor === null
                ? "Fare awaiting confirmation"
                : cash(t.amount_minor)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {t.status.replaceAll("_", " ")}
              {t.distance_meters ? ` · ${t.distance_meters / 1000} km` : ""} ·
              Paid {cash(t.paid_minor)}
            </Text>
            {manager ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {["tariff_pending", "estimated", "earned"].includes(t.status) &&
                t.service_type === "delivery" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    label="Confirm distance & fare"
                    onPress={() => open(t, "fare")}
                  />
                ) : null}
                {t.status === "earned" ? (
                  <Button
                    size="sm"
                    label="Approve earnings"
                    onPress={() =>
                      void work(() =>
                        api.post(
                          `/v1/rider-earnings/${t.task_id}/approve`,
                          {},
                          { auth: true },
                        ),
                      )
                    }
                  />
                ) : null}
                {["approved", "part_paid"].includes(t.status) ? (
                  <Button
                    size="sm"
                    label="Record payment"
                    onPress={() => open(t, "payment")}
                  />
                ) : null}
              </View>
            ) : null}
            {t.payments.length ? (
              <Disclosure title={`Payment history · ${t.payments.length}`}>
                {t.payments.map((p) => (
                  <View key={p.id} style={{ paddingVertical: 10, gap: 5 }}>
                    <Text style={{ color: colors.ink, fontWeight: "700" }}>
                      {cash(p.amount_minor)} · {p.reference}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {new Date(p.paid_at).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </Disclosure>
            ) : null}
          </View>
        ))
      )}
      <BottomSheet
        visible={!!selected}
        title={
          mode === "fare" ? "Confirm rider fare" : "Record completed payment"
        }
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        {selected ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: colors.muted }}>
              {selected.reference} · {selected.rider_name}
            </Text>
            <Input
              label={
                mode === "fare"
                  ? "Confirmed road distance (km)"
                  : "Amount paid (KES)"
              }
              keyboardType="decimal-pad"
              value={value}
              onChangeText={setValue}
            />
            {mode === "payment" ? (
              <>
                <Input
                  label="Payment transaction reference"
                  value={reference}
                  onChangeText={setReference}
                />
                <Notice message="Record a payment already made. This does not send money to the rider." />
              </>
            ) : (
              <Notice message="Use the actual road distance. Pickup and special-resource tariffs require separate approval." />
            )}
            {error ? <Notice error message={error} /> : null}
            <Button
              label={
                mode === "fare" ? "Save confirmed fare" : "Save payment record"
              }
              loading={busy}
              onPress={() =>
                void work(async () => {
                  const amount = Number(value);
                  if (!Number.isFinite(amount) || amount <= 0)
                    throw Error("Enter a valid positive amount.");
                  if (mode === "fare")
                    await api.put(
                      `/v1/rider-earnings/${selected.task_id}/estimate`,
                      { distance_meters: Math.round(amount * 1000) },
                      { auth: true },
                    );
                  else
                    await api.post(
                      `/v1/rider-earnings/${selected.task_id}/payments`,
                      {
                        request_key: requestKey,
                        amount_minor: Math.round(amount * 100),
                        reference,
                        paid_at: new Date().toISOString(),
                      },
                      { auth: true },
                    );
                })
              }
            />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
