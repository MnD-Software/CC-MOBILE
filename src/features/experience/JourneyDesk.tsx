import { useState } from "react";
import { Switch, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Feedback, Notice } from "@/components/ui/Commerce";
import { CataloguePicker } from "@/features/editorial/CataloguePicker";
import type { Proof } from "./OrderDesign";
import type { Facts } from "./ProductFacts";
import { CategoryVisibility } from "./CategoryVisibility";

const managers = ["admin", "staff", "ecommerce_manager"];
export function JourneyDesk() {
  const { customer } = useAuth(),
    { colors } = useTheme();
  const role = customer?.role || "";
  const [reference, setReference] = useState(""),
    [loaded, setLoaded] = useState(""),
    [proof, setProof] = useState<Proof | null>(null);
  const [description, setDescription] = useState(""),
    [image, setImage] = useState("");
  const [product, setProduct] = useState<{ id: number; name: string } | null>(
      null,
    ),
    [picking, setPicking] = useState(false),
    [facts, setFacts] = useState<Facts | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [environment, setEnvironment] = useState<"live" | "development">(
    "live",
  );
  const canDesign = [
    ...managers,
    "production",
    "head_chef",
    "call_center_manager",
    "call_center_agent",
    "customer_service",
  ].includes(role);
  const canFacts = [...managers, "head_chef", "content_manager"].includes(role);
  const canMeasure = [
    ...managers,
    "marketing_manager",
    "content_manager",
  ].includes(role);
  const funnel = useQuery({
    queryKey: ["journey-funnel", customer?.id, environment],
    queryFn: () =>
      api.get<{
        definition: string;
        items: { name: string; events: number; customers: number }[];
        image_p50_ms: number | null;
        image_p95_ms: number | null;
      }>(`/v1/journey/staff/funnel?environment=${environment}`, { auth: true }),
    enabled: canMeasure,
    staleTime: 30000,
  });
  async function work(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  const text = { color: colors.ink, fontSize: 14, lineHeight: 21 };
  return (
    <View style={{ gap: 16 }}>
      <CategoryVisibility />
      {error ? <Notice error message={error} /> : null}
      {notice ? <Notice message={notice} /> : null}
      {canDesign ? (
        <Disclosure title="Customer design approval">
          <Input
            label="Order reference"
            placeholder="APP-…"
            value={reference}
            onChangeText={setReference}
            autoCapitalize="characters"
          />
          <Button
            variant="outline"
            label="Open order design"
            disabled={busy || !reference.trim().startsWith("APP-")}
            onPress={() =>
              void work(async () => {
                const ref = reference.trim();
                const p = await api.get<Proof | null>(
                  `/v1/journey/staff/orders/${encodeURIComponent(ref)}/design`,
                  { auth: true },
                );
                setLoaded(ref);
                setProof(p);
                setDescription(p?.description || "");
                setImage(p?.image_data || "");
              })
            }
          />
          {loaded ? (
            <>
              <Text style={text}>
                {loaded} ·{" "}
                {proof
                  ? `Version ${proof.revision} · ${proof.state.replace(/_/g, " ")}`
                  : "No design published yet"}
              </Text>
              {proof?.customer_note ? (
                <Text style={text}>Customer: {proof.customer_note}</Text>
              ) : null}
              {image ? (
                <LoadingImage
                  source={{ uri: image }}
                  contentFit="contain"
                  style={{ height: 180, width: "100%", borderRadius: 16 }}
                />
              ) : null}
              <Input
                label="Design, colours & inscription for approval"
                multiline
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  variant="outline"
                  size="sm"
                  label="Choose design photo"
                  onPress={() =>
                    void work(async () => {
                      const r = await ImagePicker.launchImageLibraryAsync({
                        mediaTypes: ["images"],
                        base64: true,
                        quality: 0.7,
                      });
                      if (!r.canceled && r.assets[0]?.base64) {
                        const mime = r.assets[0].mimeType;
                        if (mime && !["image/png", "image/jpeg"].includes(mime))
                          throw Error("Choose a JPEG or PNG image.");
                        setImage(
                          `data:${mime || "image/jpeg"};base64,${r.assets[0].base64}`,
                        );
                      }
                    })
                  }
                  disabled={busy}
                />
                {image ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Remove photo"
                    disabled={busy}
                    onPress={() => setImage("")}
                  />
                ) : null}
              </View>
              <Button
                label={
                  proof ? "Publish revised design" : "Send design for approval"
                }
                disabled={busy || description.trim().length < 10}
                onPress={() =>
                  void work(async () => {
                    const p = await api.put<Proof>(
                      `/v1/journey/staff/orders/${loaded}/design`,
                      {
                        revision: proof?.revision || 0,
                        description,
                        image_data: image,
                      },
                      { auth: true },
                    );
                    setProof(p);
                    setNotice(
                      "The customer can review this version in their order. Production waits for approval.",
                    );
                  })
                }
              />
            </>
          ) : null}
        </Disclosure>
      ) : null}
      {canFacts ? (
        <Disclosure title="Verified ingredients & product care">
          <Button
            variant="outline"
            label={product?.name || "Choose a product"}
            onPress={() => setPicking(true)}
          />
          <CataloguePicker
            visible={picking}
            single
            selected={product ? [String(product.id)] : []}
            onClose={() => setPicking(false)}
            onChoose={(p) => {
              setPicking(false);
              setProduct(p);
              setFacts(null);
              void work(async () =>
                setFacts(
                  await api.get<Facts>(
                    `/v1/journey/staff/products/${p.id}/facts`,
                    { auth: true },
                  ),
                ),
              );
            }}
          />
          {facts && product ? (
            <>
              <Input
                label="Ingredients"
                multiline
                value={facts.ingredients}
                onChangeText={(v) => setFacts({ ...facts, ingredients: v })}
              />
              {(["contains", "may_contain", "dietary"] as const).map((key) => (
                <Input
                  key={key}
                  label={
                    {
                      contains: "Contains allergens",
                      may_contain: "May contain allergens",
                      dietary: "Verified dietary labels",
                    }[key]
                  }
                  hint="Separate labels with commas"
                  value={facts[key].join(", ")}
                  onChangeText={(v) =>
                    setFacts({
                      ...facts,
                      [key]: v.split(",").map((x) => x.trim()),
                    })
                  }
                />
              ))}
              <Input
                label="Storage & serving care"
                multiline
                value={facts.handling}
                onChangeText={(v) => setFacts({ ...facts, handling: v })}
              />
              <Input
                label="Verified recipe / source"
                value={facts.source}
                onChangeText={(v) => setFacts({ ...facts, source: v })}
                hint="Internal reference; customers do not see this field"
              />
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Text style={{ ...text, flex: 1 }}>
                  Publish verified information
                </Text>
                <Switch
                  value={facts.published}
                  onValueChange={(v) => setFacts({ ...facts, published: v })}
                  accessibilityLabel="Publish verified product information"
                />
              </View>
              <Button
                label="Save product information"
                disabled={busy}
                onPress={() =>
                  void work(async () => {
                    const p = await api.put<Facts>(
                      `/v1/journey/staff/products/${product.id}/facts`,
                      {
                        ...facts,
                        contains: facts.contains.filter(Boolean),
                        may_contain: facts.may_contain.filter(Boolean),
                        dietary: facts.dietary.filter(Boolean),
                        verified_at: undefined,
                      },
                      { auth: true },
                    );
                    setFacts(p);
                    setNotice("Product information saved.");
                  })
                }
              />
            </>
          ) : null}
        </Disclosure>
      ) : null}
      {canMeasure ? (
        <Disclosure title="Customer journey & loading performance">
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["live", "development"] as const).map((env) => (
              <Button
                key={env}
                size="sm"
                variant={environment === env ? "primary" : "outline"}
                label={env === "live" ? "Live app" : "Local review"}
                onPress={() => setEnvironment(env)}
              />
            ))}
          </View>
          {funnel.isPending ? (
            <Feedback loading />
          ) : funnel.isError ? (
            <Feedback
              error={funnel.error}
              onRetry={() => void funnel.refetch()}
            />
          ) : (
            <>
              <Text style={{ color: colors.muted, lineHeight: 20 }}>
                {funnel.data?.definition}
              </Text>
              {funnel.data?.items.map((i) => (
                <View
                  key={i.name}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ ...text, flex: 1 }}>
                    {i.name.replace(/_/g, " ")}
                  </Text>
                  <Text style={text}>
                    {i.customers} clients · {i.events}
                  </Text>
                </View>
              ))}
              <Text style={text}>
                Image load: median {funnel.data?.image_p50_ms ?? "—"} ms · 95th
                percentile {funnel.data?.image_p95_ms ?? "—"} ms
              </Text>
            </>
          )}
        </Disclosure>
      ) : null}
    </View>
  );
}
