import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useBag, usePreferences } from "@/features/commerce/store";
import { Disclosure } from "@/components/ui/Disclosure";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen, Notice, Feedback, useToast } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { CustomCakeBrief } from "./CustomCakeBrief";
import { appMedia } from "@/features/commerce/app-media";
import { useScreenActive } from "@/design/useScreenActive";

type Item = {
  id: number;
  name: string;
  slug: string;
  price_minor: number;
  image: string | null;
  attributes: { name?: string; attribute?: string; value: string }[];
  variants: Item[];
  kind: string;
};
type Quote = {
  subtotal_minor: number;
  expires_at: string;
  preview_notice: string;
  lines: {
    product_id: number;
    variation_id: number | null;
    name: string;
    slug: string;
    image: string | null;
    unit_minor: number;
    attributes: Item["attributes"];
    kind: string;
    size: string;
  }[];
};
const swatches = [
  "#F7B6D2",
  "#FFF3D6",
  "#B9E3DB",
  "#B7D5F2",
  "#CBB8E9",
  "#85523F",
  "#F3C958",
  "#FFFFFF",
];
const cash = (n: number) => `KES ${(n / 100).toLocaleString("en-KE")}`;
const EMPTY_DESIGNS: never[] = [];

export function CakeCanvas({
  colour,
  message,
  decorations,
}: {
  colour: string;
  message: string;
  decorations: number;
}) {
  const { reduceMotion, isResolved } = useMotionAccessibilityPreference();
  const active = useScreenActive();
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isResolved || reduceMotion || !active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion, isResolved, reduceMotion, active]);
  return (
    <View
      accessibilityLabel={`Illustrative cake canvas, colour ${colour}${message ? `, message ${message}` : ""}`}
      style={{
        height: 255,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 215,
          height: 215,
          borderRadius: 110,
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: `${10 + i * 18}%`,
            top: i % 2 ? 35 : 155,
            opacity: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.35, 0.9],
            }),
            transform: [
              {
                translateY: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -12],
                }),
              },
            ],
          }}
        >
          <Ionicons name="sparkles" size={12 + i * 2} color="#FFE5A5" />
        </Animated.View>
      ))}
      <Animated.View
        style={{
          width: 225,
          height: 190,
          alignItems: "center",
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -6],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            position: "absolute",
            bottom: 2,
            width: 230,
            height: 35,
            borderRadius: 120,
            backgroundColor: "rgba(0,0,0,0.15)",
            transform: [{ scaleY: 0.5 }],
          }}
        />
        <LinearGradient
          colors={["#FFF8EE", "#CFC0C9"]}
          style={{
            position: "absolute",
            bottom: 15,
            width: 224,
            height: 35,
            borderRadius: 120,
          }}
        />
        <LinearGradient
          colors={[colour, "#FFFFFF"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: "absolute",
            bottom: 29,
            width: 188,
            height: 106,
            borderBottomLeftRadius: 42,
            borderBottomRightRadius: 42,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 103,
            width: 188,
            height: 56,
            borderRadius: 100,
            backgroundColor: colour,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.7)",
          }}
        />
        {Array.from({ length: 12 }, (_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 23 + i * 15,
              bottom: 100 - (i % 3) * 5,
              width: 13,
              height: 20 + (i % 3) * 7,
              borderBottomLeftRadius: 9,
              borderBottomRightRadius: 9,
              backgroundColor: colour,
            }}
          />
        ))}
        <View
          style={{
            position: "absolute",
            bottom: 112,
            width: 150,
            alignItems: "center",
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              color: "#4A2438",
              fontSize: 13,
              fontWeight: "800",
              textAlign: "center",
              lineHeight: 17,
            }}
          >
            {message || "Made for your moment"}
          </Text>
        </View>
        {Array.from({ length: Math.min(6, decorations) }, (_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 45 + i * 24,
              bottom: 142,
              width: 8,
              height: 30,
              borderRadius: 3,
              backgroundColor: i % 2 ? "#EA5FA0" : "#F2C968",
              transform: [{ rotate: `${i % 2 ? 6 : -6}deg` }],
            }}
          >
            <View
              style={{
                position: "absolute",
                top: -12,
                left: 0,
                width: 8,
                height: 13,
                borderRadius: 8,
                backgroundColor: "#FFE39A",
              }}
            />
          </View>
        ))}
      </Animated.View>
      <Text
        style={{
          position: "absolute",
          bottom: 4,
          color: "#F5D6E6",
          fontSize: 10,
          letterSpacing: 1,
        }}
      >
        YOUR DESIGN CANVAS · ILLUSTRATION
      </Text>
    </View>
  );
}

export function InventoryStudio() {
  const { colors } = useTheme();
  const { customer } = useAuth();
  const toast = useToast();
  const addBundle = useBag((s) => s.addBundle);
  const owner = customer?.id || "guest";
  const drafts = usePreferences((s) => s.designs[owner] ?? EMPTY_DESIGNS);
  const saveDesign = usePreferences((s) => s.saveDesign);
  const deleteDesign = usePreferences((s) => s.deleteDesign);
  const [step, setStep] = useState(0),
    [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [cake, setCake] = useState<Item | null>(null),
    [variant, setVariant] = useState<Item | null>(null),
    [extras, setExtras] = useState<Item[]>([]),
    [colour, setColour] = useState(swatches[0]),
    [message, setMessage] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cakes = useQuery({
    queryKey: ["diy-inventory", submitted],
    queryFn: () =>
      api.get<Item[]>(
        `/v1/diy/inventory?search=${encodeURIComponent(submitted)}`,
      ),
    staleTime: 60000,
  });
  const decor = useQuery({
    queryKey: ["diy-decor"],
    queryFn: () => api.get<Item[]>("/v1/diy/inventory?group=decor"),
    enabled: step >= 2,
    staleTime: 60000,
  });
  useEffect(() => setQuote(null), [cake, variant, extras, colour, message]);
  const sku = variant || cake;
  const estimate =
    (sku?.price_minor || 0) + extras.reduce((s, x) => s + x.price_minor, 0);
  function saveDraft() {
    if (!cake) return;
    saveDesign(owner, {
      id: `inventory-${cake.id}-${variant?.id || 0}`,
      name: cake.name,
      version: "inventory-v1",
      selections: {
        cake: [String(cake.id)],
        variant: variant ? [String(variant.id)] : [],
        extras: extras.map((x) => String(x.id)),
        colour: [colour],
      },
      message,
      updated_at: new Date().toISOString(),
    });
    toast("Your creation is saved in your sketchbook on this device.");
  }
  async function restoreDraft(draft: (typeof drafts)[number]) {
    setBusy(true);
    setError("");
    try {
      const options = await api.get<Item[]>(
        `/v1/diy/inventory?search=${encodeURIComponent(draft.name)}`,
      );
      const chosen = options.find(
        (p) => String(p.id) === draft.selections.cake?.[0],
      );
      if (!chosen)
        throw Error(
          "This saved cake is no longer available. Choose another flavour.",
        );
      const chosenVariant = draft.selections.variant?.[0]
        ? chosen.variants.find(
            (v) => String(v.id) === draft.selections.variant[0],
          )
        : null;
      if (draft.selections.variant?.length && !chosenVariant)
        throw Error(
          "This saved size or finish has changed. Choose a current inventory combination.",
        );
      const available = await api.get<Item[]>("/v1/diy/inventory?group=decor");
      const selected = available.filter((x) =>
        draft.selections.extras?.includes(String(x.id)),
      );
      if (selected.length !== (draft.selections.extras?.length || 0))
        throw Error(
          "An extra in this design is unavailable. Choose current decorations before continuing.",
        );
      setCake(chosen);
      setVariant(chosenVariant || null);
      setExtras(selected);
      setColour(draft.selections.colour?.[0] || swatches[0]);
      setMessage(draft.message);
      setStep(3);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your design could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    if (!customer) {
      router.push("/sign-in");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const value = await api.post<Quote>(
        "/v1/diy/quote",
        {
          product_id: cake?.id,
          variation_id: variant?.id,
          extras: extras.map((x) => x.id),
          colour,
          message,
        },
        { auth: true },
      );
      setQuote(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry your design.");
    } finally {
      setBusy(false);
    }
  }
  function add() {
    if (!quote || Date.parse(quote.expires_at) <= Date.now()) {
      setError("Refresh your design price before adding it.");
      return;
    }
    const ok = addBundle(
      quote.lines.map((l) => ({
        key: "",
        product_id: l.product_id,
        slug: l.slug,
        name: l.name,
        image: l.image ? appMedia(l.image) : null,
        quantity: 1,
        price: l.unit_minor / 100,
        selection: {
          size: l.size,
          message: l.kind === "cake" ? message : "",
          add_ons: [],
          ...(l.kind === "cake" ? { design_colour: colour } : {}),
          ...(l.variation_id ? { variation_id: l.variation_id } : {}),
          variation_attributes: l.attributes.map((a) => ({
            attribute: a.attribute || a.name || "",
            value: a.value,
          })),
        },
      })),
    );
    if (ok) {
      toast("Your creation is in the bag. Let’s make it a celebration.");
      router.push("/cart");
    } else
      setError("Your bag is full. Make some room before adding this design.");
  }
  return (
    <Screen
      title="Your cake playground"
      subtitle="Dream it. Shape it. Make their day."
      back
    >
      <LinearGradient
        colors={["#372034", "#6F2C54", "#AD3F7D"]}
        style={{ borderRadius: 30, padding: 18, gap: 7 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#F7CEE3",
              fontWeight: "800",
              letterSpacing: 2,
              fontSize: 10,
            }}
          >
            MADE BY YOU
          </Text>
          <Text style={{ color: "white", fontWeight: "800", fontSize: 18 }}>
            {sku ? cash(quote?.subtotal_minor ?? estimate) : "Start creating"}
          </Text>
        </View>
        <CakeCanvas
          colour={colour}
          message={message}
          decorations={extras.length}
        />
        <Text style={{ color: "#F5D6E6", textAlign: "center", fontSize: 12 }}>
          Every choice starts with real Cake City inventory.
        </Text>
      </LinearGradient>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {["Flavour", "Finish", "Extras", "Make it yours"].map((label, i) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: step === i }}
            onPress={() => setStep(i)}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 16,
              backgroundColor:
                step === i ? colors.brandLight : colors.surfaceRaised,
              alignItems: "center",
              gap: 5,
            }}
          >
            <Text
              style={{
                color: step === i ? colors.brandStrong : colors.muted,
                fontWeight: "800",
                fontSize: 12,
              }}
            >
              {i < step ? "✓" : `0${i + 1}`}
            </Text>
            <Text
              style={{
                color: step === i ? colors.brandStrong : colors.muted,
                fontSize: 10,
                fontWeight: "700",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {step === 0 ? (
        <>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}>
            Find your flavour story
          </Text>
          <Input
            label="Search flavours, cake styles or themes"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setSubmitted(search)}
            returnKeyType="search"
          />
          <Button
            label="Find my flavour"
            variant="outline"
            onPress={() => setSubmitted(search)}
          />
          {cakes.isPending ? (
            <Feedback loading />
          ) : cakes.isError ? (
            <Feedback
              error={cakes.error}
              onRetry={() => void cakes.refetch()}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              {cakes.data.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: cake?.id === item.id }}
                  onPress={() => {
                    setCake(item);
                    setVariant(item.variants?.[0] || null);
                    setStep(1);
                  }}
                  style={{
                    width: 175,
                    borderRadius: 24,
                    padding: 10,
                    gap: 10,
                    borderWidth: 2,
                    borderColor:
                      cake?.id === item.id ? colors.brandStrong : colors.border,
                    backgroundColor: colors.surface,
                  }}
                >
                  <LoadingImage
                    source={{ uri: item.image ? appMedia(item.image) : "" }}
                    contentFit="contain"
                    style={{ width: "100%", height: 125, borderRadius: 18 }}
                  />
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.ink,
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{ color: colors.brandStrong, fontWeight: "700" }}
                  >
                    From{" "}
                    {cash(item.variants?.[0]?.price_minor || item.price_minor)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}>
            The perfect finish
          </Text>
          {!cake ? (
            <Notice message="Choose a cake first to see its available sizes, cake types and icing options." />
          ) : (
            <>
              <Text style={{ color: colors.muted, lineHeight: 21 }}>
                Choose a published combination for {cake.name}. These sizes and
                finishes come from inventory.
              </Text>
              <View style={{ gap: 10 }}>
                {(cake.variants?.length ? cake.variants : [cake]).map((v) => (
                  <Pressable
                    key={v.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sku?.id === v.id }}
                    onPress={() => setVariant(v.id === cake.id ? null : v)}
                    style={{
                      padding: 18,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor:
                        sku?.id === v.id ? colors.brandStrong : colors.border,
                      backgroundColor:
                        sku?.id === v.id ? colors.brandLight : colors.surface,
                      gap: 7,
                    }}
                  >
                    <Text style={{ color: colors.ink, fontWeight: "700" }}>
                      {v.attributes?.length
                        ? v.attributes
                            .map((a) => a.value.replaceAll("-", " "))
                            .join(" · ")
                        : "Original recipe and finish"}
                    </Text>
                    <Text
                      style={{ color: colors.brandStrong, fontWeight: "800" }}
                    >
                      {cash(v.price_minor)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Notice message="Need an icing or decoration that is not listed? Send a custom brief below for a kitchen quote." />
            </>
          )}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}>
            A little extra magic
          </Text>
          <Text style={{ color: colors.muted }}>
            Optional inventory extras. Tap to add or remove.
          </Text>
          {decor.isPending ? (
            <Feedback loading />
          ) : decor.isError ? (
            <Feedback
              error={decor.error}
              onRetry={() => void decor.refetch()}
            />
          ) : (
            <View style={{ gap: 10 }}>
              {decor.data?.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: extras.some((x) => x.id === item.id),
                  }}
                  onPress={() =>
                    setExtras((v) =>
                      v.some((x) => x.id === item.id)
                        ? v.filter((x) => x.id !== item.id)
                        : v.length < 10
                          ? [...v, item]
                          : v,
                    )
                  }
                  style={{
                    padding: 15,
                    borderRadius: 20,
                    backgroundColor: extras.some((x) => x.id === item.id)
                      ? colors.brandLight
                      : colors.surface,
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <LoadingImage
                    source={{ uri: item.image ? appMedia(item.image) : "" }}
                    contentFit="contain"
                    style={{ width: 55, height: 55, borderRadius: 14 }}
                  />
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={{ color: colors.ink, fontWeight: "700" }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.brandStrong }}>
                      {cash(item.price_minor)}
                    </Text>
                  </View>
                  <Ionicons
                    name={
                      extras.some((x) => x.id === item.id)
                        ? "checkmark-circle"
                        : "add-circle-outline"
                    }
                    size={25}
                    color={colors.brandStrong}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : null}
      {step === 3 ? (
        <>
          <Text style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}>
            Give it your signature
          </Text>
          <Text style={{ color: colors.muted }}>
            Try a colour on the canvas. Custom colour requests are confirmed by
            the kitchen.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {swatches.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityLabel={`Cake colour ${c}`}
                accessibilityState={{ checked: colour === c }}
                onPress={() => setColour(c)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c,
                  borderWidth: colour === c ? 3 : 1,
                  borderColor:
                    colour === c ? colors.brandStrong : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {colour === c ? (
                  <Ionicons name="checkmark" color="#442338" size={23} />
                ) : null}
              </Pressable>
            ))}
          </View>
          <Input
            label="Message on the cake"
            value={message}
            onChangeText={setMessage}
            maxLength={32}
          />
          {quote ? (
            <>
              <Text
                style={{ color: colors.ink, fontWeight: "800", fontSize: 25 }}
              >
                {cash(quote.subtotal_minor)}
              </Text>
              <Notice message={quote.preview_notice} />
              <Button label="Add my creation to bag" onPress={add} />
            </>
          ) : (
            <Button
              label="Confirm my design price"
              disabled={!cake || busy}
              loading={busy}
              onPress={() => void review()}
            />
          )}
          <Notice message="Your cake canvas is an illustration, not a photograph of the finished cake. Delivery and any additional custom work are quoted separately." />
        </>
      ) : null}
      {error ? <Notice error message={error} /> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        {step > 0 ? (
          <Button
            label="Back"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => setStep((s) => s - 1)}
          />
        ) : null}
        {step < 3 ? (
          <Button
            label="Next sweet step"
            style={{ flex: 1 }}
            disabled={!cake}
            onPress={() => setStep((s) => s + 1)}
          />
        ) : null}
      </View>
      {cake ? (
        <Button
          label="Save to my sketchbook"
          variant="outline"
          disabled={busy}
          onPress={saveDraft}
        />
      ) : null}
      {drafts.some((d) => d.version === "inventory-v1") ? (
        <Disclosure title="Your saved creations">
          {drafts
            .filter((d) => d.version === "inventory-v1")
            .map((d) => (
              <View key={d.id} style={{ gap: 10, paddingVertical: 12 }}>
                <Text style={{ color: colors.ink, fontWeight: "700" }}>
                  {d.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {d.message || "A little magic in the making"}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button
                    label="Continue creating"
                    size="sm"
                    disabled={busy}
                    onPress={() => void restoreDraft(d)}
                  />
                  <Button
                    label="Remove"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onPress={() => deleteDesign(owner, d.id)}
                  />
                </View>
              </View>
            ))}
        </Disclosure>
      ) : null}
      <CustomCakeBrief />
    </Screen>
  );
}
