import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice, Screen } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { money } from "@/features/commerce/contracts";

const stockSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    allocation: z.number(),
    reserved: z.number(),
    sold: z.number(),
    price_minor: z.number().nullable(),
    enabled: z.boolean(),
    revision: z.number(),
  }),
);
export default function CommerceOperations() {
  const { customer } = useAuth();
  const allowed =
    !!customer &&
    [
      "admin",
      "staff",
      "ecommerce_manager",
      "finance",
      "executive",
      "analyst",
    ].includes(customer.role);
  return (
    <Screen title="App commerce & channel reporting" back>
      {allowed ? (
        <Operations key={customer.id} role={customer.role} />
      ) : (
        <Notice message="Sign in with an authorized commerce or reporting role." />
      )}
    </Screen>
  );
}
function Operations({ role }: { role: string }) {
  const canEdit = ["admin", "staff", "ecommerce_manager"].includes(role);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [allocation, setAllocation] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [zoneFee, setZoneFee] = useState("");
  const [pickup, setPickup] = useState(false);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [taxPercent, setTaxPercent] = useState("");
  const [pickupInstructions, setPickupInstructions] = useState("");
  const policySchema = z.object({
    enabled: z.boolean(),
    pricing_confirmed: z.boolean(),
    pickup_enabled: z.boolean(),
    prices_include_tax: z.boolean(),
    tax_bps: z.number(),
    pickup_instructions: z.string(),
  });
  const policy = useQuery({
    queryKey: ["app-commerce-policy"],
    enabled: canEdit,
    queryFn: async () =>
      policySchema
        .nullable()
        .parse(await api.get("/v1/admin/app-policy", { auth: true })),
  });
  useEffect(() => {
    if (policy.data) {
      setPickup(policy.data.pickup_enabled);
      setTaxInclusive(policy.data.prices_include_tax);
      setTaxPercent(String(policy.data.tax_bps / 100));
      setPickupInstructions(policy.data.pickup_instructions);
    }
  }, [policy.data]);
  async function savePolicy(enabled: boolean) {
    try {
      if (!taxPercent.trim() || !pickupInstructions.trim())
        throw new Error(
          "Confirm the actual tax rate and pickup instructions first.",
        );
      await api.put(
        "/v1/admin/app-policy",
        {
          enabled,
          pricing_confirmed: true,
          pickup_enabled: pickup,
          prices_include_tax: taxInclusive,
          tax_bps: Math.round(Number(taxPercent) * 100),
          pickup_instructions: pickupInstructions,
        },
        { auth: true },
      );
      await policy.refetch();
      setNotice(
        enabled
          ? "App ordering enabled with these confirmed rules."
          : "App ordering disabled.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Policy save failed");
    }
  }
  const sales = useQuery({
    queryKey: ["channel-sales"],
    queryFn: async () =>
      z
        .object({
          channels: z.array(
            z.object({
              channel: z.string(),
              orders: z.number(),
              gross_minor: z.number(),
              net_minor: z.number(),
            }),
          ),
        })
        .parse(await api.get("/v1/admin/channel-sales", { auth: true })),
  });
  const stock = useQuery({
    queryKey: ["app-operations-stock"],
    queryFn: async () =>
      stockSchema.parse(
        await api.get("/v1/admin/app-products", { auth: true }),
      ),
    enabled: canEdit,
  });
  const issues = useQuery({
    queryKey: ["commerce-issues"],
    queryFn: async () =>
      z
        .array(
          z.object({
            id: z.string(),
            channel: z.string(),
            reference: z.string(),
            kind: z.string(),
            status: z.string(),
          }),
        )
        .parse(await api.get("/v1/admin/commerce-issues", { auth: true })),
  });
  const orders = useQuery({
    queryKey: ["app-operations-orders"],
    queryFn: async () =>
      z
        .array(
          z.object({
            reference: z.string(),
            status: z.string(),
            payment_state: z.string(),
            total_minor: z.number(),
          }),
        )
        .parse(await api.get("/v1/admin/app-orders", { auth: true })),
    enabled: canEdit,
  });
  async function saveStock(enabled: boolean) {
    try {
      const row = stock.data?.find((r) => r.id === Number(sku));
      if (!row) throw new Error("Choose a listed product ID.");
      await api.put(
        `/v1/admin/app-products/${row.id}`,
        {
          revision: row.revision,
          allocation: Number(allocation),
          price_minor: Math.round(Number(price) * 100),
          enabled,
        },
        { auth: true },
      );
      setNotice("App stock and price saved.");
      await stock.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Save failed");
    }
  }
  return (
    <View style={{ gap: 14 }}>
      <Text>Live sales by channel</Text>
      {sales.data?.channels.map((c) => (
        <Text key={c.channel}>
          {c.channel}: {c.orders} orders · {money(c.net_minor / 100)} net
        </Text>
      ))}
      {!sales.data?.channels.length ? (
        <Notice message="No verified sales recorded. Website totals appear only after signed reporting events are imported." />
      ) : null}
      {sales.isError ? (
        <Notice error message="Channel reporting could not be loaded." />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
      {canEdit ? (
        <>
          <Text>App stock allocation and prices</Text>
          <Input
            label="Find a product"
            value={filter}
            onChangeText={setFilter}
          />
          {stock.data
            ?.filter(
              (r) =>
                !filter ||
                r.name.toLowerCase().includes(filter.toLowerCase()) ||
                String(r.id) === filter,
            )
            .slice(0, 20)
            .map((r) => (
              <Button
                key={r.id}
                variant="outline"
                label={`${r.id} ${r.name} · ${r.allocation - r.reserved - r.sold} available`}
                onPress={() => {
                  setSku(String(r.id));
                  setPrice(String((r.price_minor || 0) / 100));
                  setAllocation(String(r.allocation));
                }}
              />
            ))}
          <Input
            label="Product / variation ID"
            value={sku}
            onChangeText={setSku}
          />
          <Input
            label="Price in KES"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <Input
            label="Total allocated units (includes sold and reserved)"
            value={allocation}
            onChangeText={setAllocation}
            keyboardType="number-pad"
          />
          <Button
            label="Save and enable for app orders"
            onPress={() => void saveStock(true)}
          />
          <Button
            variant="outline"
            label="Save and disable"
            onPress={() => void saveStock(false)}
          />
          <Text>App delivery area</Text>
          <Input label="Area ID" value={zoneId} onChangeText={setZoneId} />
          <Input
            label="Area name"
            value={zoneName}
            onChangeText={setZoneName}
          />
          <Input
            label="Delivery charge KES"
            value={zoneFee}
            onChangeText={setZoneFee}
            keyboardType="decimal-pad"
          />
          <Button
            label="Save delivery area"
            onPress={() =>
              void api
                .put(
                  `/v1/admin/app-delivery-zones/${encodeURIComponent(zoneId)}`,
                  {
                    name: zoneName,
                    fee_minor: Math.round(Number(zoneFee) * 100),
                    enabled: true,
                  },
                  { auth: true },
                )
                .then(() => setNotice("Delivery area saved."))
                .catch((e) => setNotice(e.message))
            }
          />
          <Text>App checkout rules</Text>
          <Notice message="Only enable ordering after confirming app stock allocations, delivery charges and the actual tax treatment." />
          <Input
            label="Tax rate (%)"
            value={taxPercent}
            onChangeText={setTaxPercent}
            keyboardType="decimal-pad"
          />
          <Input
            label="Pickup location and instructions"
            value={pickupInstructions}
            onChangeText={setPickupInstructions}
            multiline
          />
          <Button
            variant="outline"
            label={
              pickup
                ? "Pickup enabled — tap to disable"
                : "Pickup disabled — tap to enable"
            }
            onPress={() => setPickup(!pickup)}
          />
          <Button
            variant="outline"
            label={
              taxInclusive
                ? "Prices include tax — tap to change"
                : "Tax added to prices — tap to change"
            }
            onPress={() => setTaxInclusive(!taxInclusive)}
          />
          <Button
            label="Confirm these rules and enable app ordering"
            onPress={() => void savePolicy(true)}
          />
          <Button
            variant="outline"
            label="Disable app ordering"
            onPress={() => void savePolicy(false)}
          />
          <Text>App fulfilment queue</Text>
          {orders.data?.map((o) => (
            <View key={o.reference} style={{ gap: 6 }}>
              <Text>
                {o.reference} · {o.status} · {money(o.total_minor / 100)}
              </Text>
              {o.payment_state === "completed"
                ? ["preparing", "ready", "out_for_delivery", "completed"].map(
                    (status) => (
                      <Button
                        key={status}
                        variant="outline"
                        label={status.replaceAll("_", " ")}
                        onPress={() =>
                          void api
                            .patch(
                              `/v1/admin/app-orders/${o.reference}`,
                              { status },
                              { auth: true },
                            )
                            .then(() => orders.refetch())
                            .catch((e) => setNotice(e.message))
                        }
                      />
                    ),
                  )
                : null}
            </View>
          ))}
        </>
      ) : null}
      <Text>Issues by channel</Text>
      {issues.data?.map((i) => (
        <View key={i.id} style={{ gap: 6 }}>
          <Text>
            {i.channel} · {i.reference} · {i.kind} · {i.status}
          </Text>
          {canEdit ? (
            <Button
              variant="outline"
              label={
                i.status === "open"
                  ? "Mark reviewed and resolved"
                  : "Reopen issue"
              }
              onPress={() =>
                void api
                  .patch(
                    `/v1/admin/commerce-issues/${i.id}`,
                    { status: i.status === "open" ? "resolved" : "open" },
                    { auth: true },
                  )
                  .then(() => issues.refetch())
                  .catch((e) => setNotice(e.message))
              }
            />
          ) : null}
        </View>
      ))}
      <Button
        variant="outline"
        label="Refresh reports"
        onPress={() => {
          void sales.refetch();
          void issues.refetch();
          if (canEdit) {
            void stock.refetch();
            void orders.refetch();
          }
        }}
      />
    </View>
  );
}
