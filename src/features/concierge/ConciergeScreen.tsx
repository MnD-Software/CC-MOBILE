import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Screen, Notice } from "@/components/ui/Commerce";
import { Text } from "@/components/ui/Typography";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingImage } from "@/components/ui/LoadingImage";
import { useTheme } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";
import { money, plainText } from "@/features/commerce/contracts";
import { useBag } from "@/features/commerce/store";
import {
  conciergeApi,
  type ConciergeReply,
  type ConversationTurn,
} from "./api";

const VoiceCommand = lazy(() => import("./VoiceCommand"));
export function ConciergeScreen() {
  const { customer, restoring } = useAuth();
  // Changing accounts unmounts all private conversation state and pending requests.
  return (
    <Conversation
      key={customer?.id ?? "guest"}
      signedIn={!!customer && !restoring}
    />
  );
}
type Bubble = ConversationTurn & { result?: ConciergeReply; added?: boolean };
function Conversation({ signedIn }: { signedIn: boolean }) {
  const { colors } = useTheme();
  const { action, prompt } = useLocalSearchParams<{
    action?: string;
    prompt?: string;
  }>();
  const initial =
    prompt?.slice(0, 1500) ||
    (action === "reorder"
      ? "Help me reorder my last cake."
      : action === "track"
        ? "Where is my latest order?"
        : "");
  const [draft, setDraft] = useState(initial);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(false);
  const [consent, setConsent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const flight = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const status = useQuery({
    queryKey: ["concierge-status"],
    queryFn: ({ signal }) => conciergeApi.status(signal),
    staleTime: 60_000,
    retry: false,
  });
  const available = signedIn && status.data?.available;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setDraft(initial);
  }, [initial]);
  async function send() {
    const text = draft.trim();
    if (!text || !available || !consent || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    const history = messages.map(({ role, content }) => ({ role, content }));
    const next: Bubble[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    controller.current = new AbortController();
    try {
      const result = await conciergeApi.chat(
        text,
        history,
        controller.current.signal,
      );
      if (controller.current.signal.aborted) return;
      setMessages(
        [
          ...next,
          { role: "assistant" as const, content: result.reply, result },
        ].slice(-12),
      );
    } catch (reason) {
      if (!controller.current?.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn't send your message.",
        );
        setMessages(messages);
        setDraft(text);
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const suggestions = [
    "Find a birthday cake for 10 people",
    "Help me reorder my last cake",
    "Track my latest order",
    "How close am I to my next Club reward?",
  ];
  return (
    <Screen
      title="Your concierge"
      back
      scroll={false}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new conversation"
          disabled={busy}
          onPress={() => {
            setMessages([]);
            setDraft("");
            setError("");
          }}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="create-outline"
            size={22}
            color={colors.brandStrong}
          />
        </Pressable>
      }
    >
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 24,
          maxWidth: 680,
          width: "100%",
          alignSelf: "center",
          paddingBottom: 150,
        }}
        onContentSizeChange={() => {
          if (messages.length) scroll.current?.scrollToEnd({ animated: true });
        }}
      >
        {!messages.length ? (
          <>
            <LinearGradient
              colors={["#32172D", "#672445", "#9E245F"]}
              style={styles.hero}
            >
              <View style={styles.mark}>
                <Ionicons name="sparkles" color="#FFE1A8" size={27} />
              </View>
              <Text style={styles.kicker}>
                A LITTLE INSPIRATION. JUST FOR YOU.
              </Text>
              <Text style={styles.title}>
                Let's make it{"\n"}something special.
              </Text>
              <Text style={styles.copy}>
                Find your cake, plan a celebration or follow an order. One
                conversation at a time.
              </Text>
            </LinearGradient>
            <View style={{ gap: 10 }}>
              {suggestions.map((text, index) => (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  accessibilityLabel={text}
                  onPress={() => setDraft(text)}
                  style={[
                    styles.suggestion,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      (
                        [
                          "gift-outline",
                          "refresh-outline",
                          "navigate-outline",
                          "diamond-outline",
                        ] as const
                      )[index]
                    }
                    size={20}
                    color={colors.brandStrong}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      lineHeight: 20,
                      color: colors.ink,
                    }}
                  >
                    {text}
                  </Text>
                  <Ionicons
                    name="arrow-up-outline"
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {!signedIn ? (
          <>
            <Notice message="Sign in for your personal concierge, Club and order tracking." />
            <Button label="Sign in" onPress={() => router.push("/sign-in")} />
          </>
        ) : null}
        {status.isError ? (
          <>
            <Notice error message="Couldn't check assistant availability." />
            <Button
              label="Try again"
              variant="outline"
              onPress={() => void status.refetch()}
            />
          </>
        ) : null}
        {status.data && !status.data.available ? (
          <View style={[styles.panel, { backgroundColor: colors.brandLight }]}>
            <Text
              style={{ color: colors.ink, fontSize: 16, fontWeight: "700" }}
            >
              Your concierge is being prepared
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
              Personal chat and voice will be available once assistant setup is
              complete. Your cakes, checkout and order updates are ready to use.
            </Text>
            <Button
              variant="outline"
              label="Browse cakes"
              onPress={() => router.push("/(tabs)/shop")}
            />
            <Button
              variant="ghost"
              label="Track my orders"
              onPress={() => router.push("/(tabs)/orders")}
            />
          </View>
        ) : null}
        {available && !consent ? (
          <View
            style={[
              styles.panel,
              {
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20 }}>
              Your messages and relevant Cake City product, order and Club
              details are shared with our AI provider to answer your requests.
              Chat is kept only while this screen is open. Never share card
              details. You'll review your bag and approve payment in checkout.
            </Text>
            <Button
              label="Continue with personal assistant"
              onPress={() => setConsent(true)}
            />
          </View>
        ) : null}
        {messages.map((message, index) => (
          <View key={index} style={{ gap: 16 }}>
            <View
              style={[
                styles.bubble,
                {
                  alignSelf:
                    message.role === "user" ? "flex-end" : "flex-start",
                  backgroundColor:
                    message.role === "user"
                      ? colors.brandLight
                      : colors.surfaceRaised,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 10,
                  color: colors.brandStrong,
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                {message.role === "user" ? "YOU" : "CAKE CITY"}
              </Text>
              <Text
                selectable
                style={{ color: colors.ink, fontSize: 14, lineHeight: 23 }}
              >
                {message.content}
              </Text>
            </View>
            {message.result?.products.map((product) => (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/product/[id]",
                    params: { id: String(product.id), slug: product.slug },
                  })
                }
                style={[
                  styles.product,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <LoadingImage
                  source={product.images?.[0]?.src}
                  contentFit="contain"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 16,
                    backgroundColor: colors.brandLight,
                  }}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {plainText(product.name)}
                  </Text>
                  <Text style={{ color: colors.brandStrong, fontSize: 12 }}>
                    {product.type === "variable" ? "From " : ""}
                    {product.prices.currency_code === "KES"
                      ? money(
                          Number(product.prices.price) /
                            10 ** product.prices.currency_minor_unit,
                        )
                      : "View options"}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))}
            {message.result?.orders.map((order) => (
              <Button
                key={order.reference}
                variant="outline"
                label={`Track ${order.reference}`}
                onPress={() =>
                  router.push({
                    pathname: "/order/[reference]",
                    params: { reference: order.reference },
                  })
                }
              />
            ))}
            {message.result?.bag.length ? (
              <View
                style={[
                  styles.panel,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    ...tokens.shadow.card,
                  },
                ]}
              >
                <Text
                  style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}
                >
                  Your celebration, ready to review
                </Text>
                {message.result.bag.map((line, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <Text
                      style={{
                        color: colors.ink,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {line.quantity} × {plainText(line.name)} ·{" "}
                      {line.selection.size}
                    </Text>
                    {line.selection.message ? (
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        “{line.selection.message}”
                      </Text>
                    ) : null}
                    <Text style={{ color: colors.brandStrong, fontSize: 13 }}>
                      {money(line.price * line.quantity)}
                    </Text>
                  </View>
                ))}
                <Text
                  style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}
                >
                  Delivery and final totals are checked at checkout. Nothing has
                  been ordered or charged.
                </Text>
                <Button
                  label={
                    message.added
                      ? "Added to your bag"
                      : "Add these items & review bag"
                  }
                  disabled={message.added || busy}
                  onPress={() => {
                    if (useBag.getState().addBundle(message.result!.bag)) {
                      setMessages((current) =>
                        current.map((value, i) =>
                          i === index ? { ...value, added: true } : value,
                        ),
                      );
                      router.push("/cart");
                    } else
                      setError(
                        "Your bag is at its item limit. Remove an item before adding these cakes.",
                      );
                  }}
                />
              </View>
            ) : null}
          </View>
        ))}
        {busy ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Your concierge is thinking"
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <ActivityIndicator color={colors.brandStrong} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Finding something sweet…
            </Text>
          </View>
        ) : null}
        {error ? <Notice error message={error} /> : null}
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              ...tokens.shadow.card,
            },
          ]}
        >
          <Input
            accessibilityLabel="Message your Cake City concierge"
            placeholder="A cake for a birthday next Saturday…"
            multiline
            maxLength={1500}
            value={draft}
            onChangeText={setDraft}
            editable={!busy}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              style={{ flex: 1 }}
              label="Send message"
              disabled={!available || !consent || busy || !draft.trim()}
              loading={busy}
              onPress={() => void send()}
            />
            {available && consent ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open voice commands"
                onPress={() => setVoice(!voice)}
                style={{
                  width: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  backgroundColor: colors.brandLight,
                }}
              >
                <Ionicons
                  name={voice ? "close-outline" : "mic-outline"}
                  size={22}
                  color={colors.brandStrong}
                />
              </Pressable>
            ) : null}
          </View>
          {voice && available && consent ? (
            <Suspense
              fallback={<ActivityIndicator color={colors.brandStrong} />}
            >
              <VoiceCommand
                disabled={busy}
                onText={(text) => {
                  setDraft(text);
                  setVoice(false);
                }}
              />
            </Suspense>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16 }}>
            AI can make mistakes. Always review your selections and checkout
            details.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: { padding: 28, borderRadius: 30, gap: 20, overflow: "hidden" },
  mark: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  kicker: {
    fontSize: 9,
    lineHeight: 16,
    letterSpacing: 1.5,
    color: "#F6C9DC",
    fontWeight: "700",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  copy: { color: "#F7DFE8", fontSize: 13, lineHeight: 21 },
  suggestion: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
  },
  panel: { padding: 22, borderRadius: 24, gap: 16 },
  bubble: { padding: 20, borderRadius: 24, maxWidth: "96%" },
  product: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
