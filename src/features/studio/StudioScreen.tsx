import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Text, View, ScrollView } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  Screen,
  Feedback,
  Notice,
  Section,
  Chip,
  Reveal,
  ui,
  useToast,
} from "@/components/ui/Commerce";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { shopApi } from "@/features/commerce/api";
import { studioEstimate, money } from "@/features/commerce/contracts";
import { useBag, usePreferences } from "@/features/commerce/store";
import { tokens } from "@/theme/tokens";
export function StudioScreen() {
  const configQuery = useQuery({
    queryKey: ["mobile-config"],
    queryFn: ({ signal }) => shopApi.config(signal),
    staleTime: 60000,
  });
  const config = configQuery.data?.studio;
  const { customer } = useAuth();
  const branch = usePreferences((s) => s.branch);
  const owner = customer?.id ?? "guest";
  const designs = usePreferences((s) => s.designs[owner] ?? EMPTY);
  const save = usePreferences((s) => s.saveDesign);
  const remove = usePreferences((s) => s.deleteDesign);
  const add = useBag((s) => s.add);
  const toast = useToast();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [name, setName] = useState("My celebration cake");
  const [designId, setDesignId] = useState<string | null>(null);
  const [quoteInput, setQuoteInput] = useState<{
    configuration_version: string;
    selections: Record<string, string[]>;
    message: string;
    branch_id?: string;
  } | null>(null);
  const estimate = useMemo(
    () => (config ? studioEstimate(config, selections) : null),
    [config, selections],
  );
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(
      () =>
        setQuoteInput(
          estimate
            ? {
                configuration_version: config.version,
                selections,
                message,
                branch_id: branch?.id,
              }
            : null,
        ),
      450,
    );
    return () => clearTimeout(timer);
  }, [config, selections, message, estimate, branch?.id]);
  const quote = useQuery({
    queryKey: ["studio-quote", quoteInput],
    queryFn: ({ signal }) => shopApi.studioQuote(quoteInput!, signal),
    enabled: !!quoteInput && !!configQuery.data?.capabilities.studio,
    retry: false,
    staleTime: 15000,
  });
  const current =
    !!quoteInput &&
    quoteInput.configuration_version === config?.version &&
    quoteInput.branch_id === branch?.id &&
    quoteInput.message === message &&
    JSON.stringify(quoteInput.selections) === JSON.stringify(selections) &&
    quote.isSuccess &&
    Date.parse(quote.data.expires_at) > Date.now();
  const layers =
    config?.groups
      .flatMap((g) =>
        g.options.filter(
          (o) => (selections[g.id] ?? []).includes(o.id) && o.image_url,
        ),
      )
      .sort((a, b) => a.layer - b.layer) ?? [];
  function toggle(groupId: string, optionId: string, multiple: boolean) {
    setSelections((s) => ({
      ...s,
      [groupId]: multiple
        ? (s[groupId] ?? []).includes(optionId)
          ? s[groupId].filter((id) => id !== optionId)
          : [...(s[groupId] ?? []), optionId]
        : [optionId],
    }));
  }
  function saveDesign() {
    if (!config) return;
    const id = designId ?? "design-" + Date.now();
    setDesignId(id);
    save(owner, {
      id,
      name: name.trim() || "My celebration cake",
      version: config.version,
      selections,
      message,
      updated_at: new Date().toISOString(),
    });
    toast("Design saved on this device.");
  }
  function addDesign() {
    if (!config || !current || !quote.data) return;
    if (Date.parse(quote.data.expires_at) <= Date.now()) {
      toast("Your cake quote expired. Refresh the price before adding it.");
      void quote.refetch();
      return;
    }
    add({
      key: "",
      slug: quote.data.product_slug,
      name: quote.data.name,
      image: config.base_image_url,
      price: quote.data.subtotal,
      quantity: 1,
      selection: { ...quote.data.selection, studio_quote_id: quote.data.id },
    });
    toast("Your custom cake is in the bag.");
    router.push("/cart");
  }
  return (
    <Screen title="The Cake Studio." subtitle="Imagine it. Make it theirs.">
      <View
        style={[
          ui.panel,
          { backgroundColor: tokens.color.accentLight, borderWidth: 0 },
        ]}
      >
        <Text style={ui.eyebrow}>A LITTLE CREATIVITY. A LOT OF CAKE.</Text>
        <Text style={ui.heading}>Every detail has a story.</Text>
        <Text style={ui.body}>
          Choose your finish, add the things they love, and say it in your own
          words.
        </Text>
      </View>
      <Feedback
        loading={configQuery.isPending}
        error={configQuery.error}
        onRetry={() => void configQuery.refetch()}
      />
      {config && configQuery.data?.capabilities.studio ? (
        <Reveal>
          <View
            accessible
            accessibilityLabel={
              "Your custom cake preview. " +
              layers.map((l) => l.name).join(", ") +
              ". Message: " +
              message
            }
            style={{
              aspectRatio: 1,
              backgroundColor: "#F5EFEB",
              borderRadius: 24,
              overflow: "hidden",
            }}
          >
            <Image
              source={config.base_image_url}
              contentFit="contain"
              cachePolicy="memory-disk"
              style={{ position: "absolute", width: "100%", height: "100%" }}
            />
            {layers.map((layer) => (
              <Image
                key={layer.id}
                source={layer.image_url}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />
            ))}
            {message ? (
              <View
                style={{
                  position: "absolute",
                  bottom: "21%",
                  left: "17%",
                  right: "17%",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontStyle: "italic",
                    fontWeight: "600",
                    color: tokens.color.cocoa,
                    textAlign: "center",
                    backgroundColor: "rgba(255,255,255,.82)",
                    padding: 5,
                    borderRadius: 5,
                  }}
                >
                  {message}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[ui.body, { fontSize: 12 }]}>
            Design preview · handmade finishes may vary slightly.
          </Text>
          {config.groups.map((group) => (
            <View key={group.id} style={{ gap: 12 }}>
              <Section title={group.name + (group.required ? " *" : "")} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {group.options
                  .filter((o) => o.available)
                  .map((option) => (
                    <Chip
                      key={option.id}
                      label={
                        option.name +
                        (option.price ? " · +" + money(option.price) : "")
                      }
                      selected={(selections[group.id] ?? []).includes(
                        option.id,
                      )}
                      onPress={() =>
                        toggle(group.id, option.id, group.multiple)
                      }
                    />
                  ))}
              </View>
              {!group.required && !group.multiple ? (
                <Button
                  variant="ghost"
                  size="sm"
                  label="No selection"
                  onPress={() =>
                    setSelections((s) => ({ ...s, [group.id]: [] }))
                  }
                />
              ) : null}
            </View>
          ))}
          <Input
            label="Your message on the cake"
            value={message}
            onChangeText={setMessage}
            maxLength={config.message_max_length}
            hint={
              message.length + "/" + config.message_max_length + " characters"
            }
          />
          <Input
            label="Give your creation a name"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
          {estimate ? (
            <View style={ui.panel}>
              <Section title="The sweet details" />
              {estimate.breakdown.map((b, i) => (
                <View key={i} style={ui.spread}>
                  <Text style={[ui.body, { flex: 1 }]}>{b.name}</Text>
                  <Text style={ui.label}>{money(b.price)}</Text>
                </View>
              ))}
              <View style={ui.line} />
              <View style={ui.spread}>
                <Text style={ui.heading}>
                  {current ? "Confirmed price" : "Estimated subtotal"}
                </Text>
                <Text style={ui.heading}>
                  {money(current ? quote.data!.subtotal : estimate.total)}
                </Text>
              </View>
              <Text style={ui.body}>
                Delivery is quoted separately at checkout.
              </Text>
            </View>
          ) : (
            <Notice message="Select the required details to price your cake. Some decorations cannot be combined." />
          )}
          {quote.error ? (
            <Feedback
              error={quote.error}
              onRetry={() => void quote.refetch()}
            />
          ) : null}
          <Button
            label={
              current
                ? "Add your creation · " + money(quote.data!.subtotal)
                : "Confirming your creation"
            }
            loading={quote.isFetching}
            disabled={!current}
            onPress={addDesign}
          />
          <Button
            variant="outline"
            label="Save this design"
            onPress={saveDesign}
          />
        </Reveal>
      ) : !configQuery.isPending && !configQuery.error ? (
        <Notice message="Cake Studio materials are unavailable at the moment. Try refreshing, or discover our finished cakes." />
      ) : null}
      {designs.length ? (
        <>
          <Section title="Your sketchbook" />
          {designs.map((d) => (
            <View key={d.id} style={ui.panel}>
              <Text style={ui.heading}>{d.name}</Text>
              <Text style={ui.body}>
                {d.message || "Saved cake design"} ·{" "}
                {new Date(d.updated_at).toLocaleDateString("en-KE")}
              </Text>
              <View style={ui.row}>
                <Button
                  variant="outline"
                  label="Open design"
                  disabled={!config}
                  onPress={() => {
                    setDesignId(d.id);
                    setName(d.name);
                    setSelections(d.selections);
                    setMessage(d.message);
                    if (d.version !== config?.version)
                      toast(
                        "Materials have changed. Review your selections before ordering.",
                      );
                  }}
                />
                <Button
                  variant="ghost"
                  label="Delete"
                  onPress={() => remove(owner, d.id)}
                />
              </View>
            </View>
          ))}
          <Text style={[ui.body, { fontSize: 12 }]}>
            Your sketchbook is saved on this device. Prices are rechecked when
            you order.
          </Text>
        </>
      ) : null}
      <Button
        variant="ghost"
        label="Discover ready-designed cakes"
        onPress={() => router.push("/(tabs)/shop")}
      />
    </Screen>
  );
}
const EMPTY: never[] = [];
