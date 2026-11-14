import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
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
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen, Notice, Feedback, useToast } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";
import { CustomCakeBrief } from "./CustomCakeBrief";
import { SizeFinishPicker } from "./SizeFinishPicker";
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
  canvas_colour?: string;
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
  compact = false,
}: {
  colour: string;
  message: string;
  decorations: number;
  compact?: boolean;
}) {
  const { reduceMotion, isResolved } = useMotionAccessibilityPreference();
  const active = useScreenActive();
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (compact || !isResolved || reduceMotion || !active) return;
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
  }, [motion, isResolved, reduceMotion, active, compact]);
  return (
    <View
      accessibilityLabel={`Illustrative cake canvas, colour ${colour}${message ? `, message ${message}` : ""}`}
      style={{
        height: compact ? 160 : 220,
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
            { scale: compact ? 0.72 : 1 },
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
        {Array.from({ length: decorations > 0 ? 8 : 0 }, (_, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 108 + Math.cos((i / 8) * Math.PI * 2) * 73,
              bottom: 137 + Math.sin((i / 8) * Math.PI * 2) * 19,
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { customer } = useAuth();
  const toast = useToast();
  const addBundle = useBag((s) => s.addBundle);
  const owner = customer?.id || "guest";
  const drafts = usePreferences((s) => s.designs[owner] ?? EMPTY_DESIGNS);
  const saveDesign = usePreferences((s) => s.saveDesign);
  const deleteDesign = usePreferences((s) => s.deleteDesign);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [mode, setMode] = useState<"diy" | "inspo">("diy");
  const [step, setStep] = useState(0),
    [search, setSearch] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [cake, setCake] = useState<Item | null>(null),
    [variant, setVariant] = useState<Item | null>(null),
    [extras, setExtras] = useState<Item[]>([]),
    [colour, setColour] = useState("#FFF8EE"),
    [message, setMessage] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSubmitted(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const cakes = useQuery({
    enabled: mode === "diy",
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
  useEffect(() => {
    setQuote(null);
    setCompletedSteps((steps) => steps.filter((s) => s !== 3));
  }, [cake, variant, extras, colour, message]);
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
        candle_ring: extras.some((x) => /candle|candel|sparkler/i.test(x.name))
          ? ["yes"]
          : [],
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
      setCompletedSteps([0, 1, 2, 3]);
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
      scroll={false}
    >
      <View
        testID="diy-fixed-tabs"
        style={{
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 6,
            padding: 5,
            borderRadius: 20,
            backgroundColor: colors.surfaceRaised,
          }}
        >
          {(["diy", "inspo"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
              style={{
                flex: 1,
                borderRadius: 19,
                shadowColor: "#B80068",
                shadowOpacity: mode === value ? 0.22 : 0,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: mode === value ? 4 : 0,
              }}
            >
              <LinearGradient
                colors={
                  mode === value
                    ? ["#B80068", "#EC008C"]
                    : [colors.surfaceRaised, colors.surfaceRaised]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  minHeight: 62,
                  borderRadius: 19,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 9,
                  padding: 12,
                  borderWidth: 1,
                  borderColor:
                    mode === value ? "rgba(255,255,255,0.45)" : colors.border,
                }}
              >
                <Ionicons
                  name={value === "diy" ? "color-wand" : "images"}
                  size={24}
                  color={mode === value ? "#FFFFFF" : colors.brandStrong}
                />
                <View style={{ gap: 3 }}>
                  <Text
                    style={{
                      color: mode === value ? "#FFFFFF" : colors.ink,
                      fontWeight: "800",
                      fontSize: 17,
                      letterSpacing: 0.3,
                    }}
                  >
                    {value === "diy" ? "DIY" : "Inspiration"}
                  </Text>
                  <Text
                    style={{
                      color: mode === value ? "#FFFFFF" : colors.muted,
                      fontSize: 10,
                    }}
                  >
                    {value === "diy"
                      ? "Mix. Match. Make magic."
                      : "Your dream, our kitchen."}
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
        {mode === "diy" ? (
          <View
            testID="diy-fixed-steps"
            style={{ flexDirection: "row", gap: 6, paddingTop: 10 }}
          >
            {["Flavour", "Finish", "Extras", "Make it yours"].map(
              (label, i) => (
                <Pressable
                  key={label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: step === i }}
                  onPress={() => setStep(i)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: completedSteps.includes(i)
                      ? colors.successLight
                      : step === i
                        ? colors.brandLight
                        : colors.surfaceRaised,
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Text
                    style={{
                      color: completedSteps.includes(i)
                        ? colors.success
                        : step === i
                          ? colors.brandStrong
                          : colors.muted,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    {completedSteps.includes(i) ? "✓" : `0${i + 1}`}
                  </Text>
                  <Text
                    style={{
                      color: completedSteps.includes(i)
                        ? colors.success
                        : step === i
                          ? colors.brandStrong
                          : colors.muted,
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
        ) : null}
      </View>
      <ScrollView
        key={`${mode}-${step}`}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(112, insets.bottom + 96),
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {mode === "inspo" ? (
          <CustomCakeBrief />
        ) : (
          <>
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
                <Text
                  style={{ color: "white", fontWeight: "800", fontSize: 18 }}
                >
                  {sku
                    ? cash(quote?.subtotal_minor ?? estimate)
                    : "Start creating"}
                </Text>
              </View>
              <CakeCanvas
                colour={colour}
                message={message}
                decorations={
                  extras.filter((x) => /candle|candel|sparkler/i.test(x.name))
                    .length
                }
              />
              <Text
                style={{ color: "#F5D6E6", textAlign: "center", fontSize: 12 }}
              >
                Every choice starts with real Cake City inventory.
              </Text>
            </LinearGradient>
            {step === 0 ? (
              <>
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}
                >
                  Find your flavour story
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 56,
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: search ? colors.brandStrong : colors.border,
                    shadowColor: "#351A2B",
                    shadowOpacity: 0.04,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                  }}
                >
                  <Ionicons
                    name="search-outline"
                    size={22}
                    color={colors.brandStrong}
                  />
                  <TextInput
                    accessibilityLabel="Search flavours, cake styles or themes"
                    placeholder="Find your favourite flavour?"
                    placeholderTextColor={colors.muted}
                    value={search}
                    onChangeText={setSearch}
                    onSubmitEditing={() => setSubmitted(search.trim())}
                    returnKeyType="search"
                    autoCorrect={false}
                    style={{
                      flex: 1,
                      color: colors.ink,
                      fontSize: 15,
                      paddingVertical: 14,
                      minWidth: 0,
                    }}
                  />
                  {search ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear flavour search"
                      hitSlop={8}
                      onPress={() => {
                        setSearch("");
                        setSubmitted("");
                      }}
                      style={{
                        width: 32,
                        height: 36,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={22}
                        color={colors.muted}
                      />
                    </Pressable>
                  ) : null}
                </View>
                {!cakes.isPending && !cakes.isError ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={{ color: colors.muted, fontSize: 12 }}
                  >
                    {cakes.data?.length
                      ? `${cakes.data.length} cake${cakes.data.length === 1 ? "" : "s"} to make your own`
                      : "No cakes match yet. Try a different flavour."}
                  </Text>
                ) : null}
                {cakes.isPending ? (
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Skeleton height={210} radius={23} width="48%" />
                    <Skeleton height={210} radius={23} width="48%" />
                  </View>
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
                          setCompletedSteps([0]);
                          setColour(item.canvas_colour || "#FFF8EE");
                          setVariant(item.variants?.[0] || null);
                          setStep(1);
                        }}
                        style={{
                          width: 175,
                          borderRadius: 24,
                          padding: 0,
                          gap: 0,
                          overflow: "hidden",
                          borderWidth: 2,
                          borderColor:
                            cake?.id === item.id
                              ? colors.brandStrong
                              : colors.border,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <LoadingImage
                          source={{
                            uri: item.image ? appMedia(item.image) : "",
                          }}
                          contentFit="cover"
                          style={{
                            width: "100%",
                            aspectRatio: 1,
                            borderTopLeftRadius: 22,
                            borderTopRightRadius: 22,
                          }}
                        />
                        <Text
                          numberOfLines={2}
                          style={{
                            color: colors.ink,
                            fontWeight: "800",
                            fontSize: 15,
                            paddingHorizontal: 12,
                            paddingTop: 12,
                            minHeight: 54,
                          }}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={{
                            color: colors.brandStrong,
                            fontWeight: "700",
                            paddingHorizontal: 12,
                            paddingTop: 6,
                            paddingBottom: 14,
                          }}
                        >
                          From{" "}
                          {cash(
                            item.variants?.[0]?.price_minor || item.price_minor,
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            ) : null}
            {step === 1 ? (
              <>
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}
                >
                  The perfect finish
                </Text>
                {!cake ? (
                  <Notice message="Choose a cake first to see its available sizes, cake types and icing options." />
                ) : (
                  <>
                    <Text style={{ color: colors.muted, lineHeight: 21 }}>
                      Choose a published combination for {cake.name}. These
                      sizes and finishes come from inventory.
                    </Text>
                    <SizeFinishPicker
                      variants={cake.variants?.length ? cake.variants : [cake]}
                      selected={variant || cake}
                      onSelect={(value) =>
                        setVariant(value.id === cake.id ? null : value)
                      }
                    />
                    <Notice message="Need an icing or decoration that is not listed? Send a custom brief below for a kitchen quote." />
                  </>
                )}
              </>
            ) : null}
            {step === 2 ? (
              <>
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}
                >
                  A little extra magic
                </Text>
                <Text style={{ color: colors.muted }}>
                  Optional inventory extras. Tap to add or remove. One candle
                  pack dresses the cake; the ring on the canvas is illustrative.
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
                          source={{
                            uri: item.image ? appMedia(item.image) : "",
                          }}
                          contentFit="contain"
                          style={{ width: 55, height: 55, borderRadius: 14 }}
                        />
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text
                            style={{ color: colors.ink, fontWeight: "700" }}
                          >
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
                <Text
                  style={{ color: colors.ink, fontWeight: "800", fontSize: 22 }}
                >
                  Give it your signature
                </Text>
                <Text style={{ color: colors.muted }}>
                  Try a colour on the canvas. Custom colour requests are
                  confirmed by the kitchen.
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
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
                      style={{
                        color: colors.ink,
                        fontWeight: "800",
                        fontSize: 25,
                      }}
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
                  onPress={() => {
                    setCompletedSteps((v) => [...new Set([...v, step])]);
                    setStep((s) => s + 1);
                  }}
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
                      <View
                        style={{
                          borderRadius: 22,
                          overflow: "hidden",
                          backgroundColor: "#38243B",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <CakeCanvas
                          compact
                          colour={d.selections.colour?.[0] || "#FFF3D6"}
                          message={d.message}
                          decorations={d.selections.candle_ring?.length || 0}
                        />
                        <Text
                          style={{
                            color: "#EED9E5",
                            fontSize: 11,
                            paddingHorizontal: 14,
                            paddingBottom: 12,
                          }}
                        >
                          Your saved design preview ? final finish confirmed by
                          our kitchen
                        </Text>
                      </View>
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
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
