import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Typography";
import { useReducedMotion } from "@/design/useReducedMotion";
import { purchaseTestOrigin } from "@/features/purchase-test/client";
import { usePurchasePreview } from "@/features/purchase-test/usePurchasePreview";
import { useTheme } from "@/theme/ThemeProvider";
import { clubApi } from "./club-api";
import { membershipPalette } from "./member-card";
import { MilestoneTracker } from "./milestones";

type Celebration = {
  tier: string;
  owner: string;
  id: string;
  kind?: string;
  points?: number;
  reference?: string;
};

/** Lives above navigation so a confirmed milestone follows the member between screens. */
export function MilestoneCelebrationObserver() {
  const pathname = usePathname();
  const client = useQueryClient();
  const origin = purchaseTestOrigin();
  const { customer } = useAuth();
  const preview = usePurchasePreview();
  const live = useQuery({
    queryKey: ["club", customer?.id, origin],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !origin && Boolean(customer),
    staleTime: 60_000,
    retry: false,
    refetchInterval: 20_000,
  });
  const tracker = useRef(new MilestoneTracker());
  const owner = origin
    ? preview.data
      ? `${origin}:${customer?.id ?? "guest"}:${preview.data.history.at(-1)?.id ?? "new"}`
      : null
    : customer && live.data
      ? customer.id
      : null;
  const tier = origin ? preview.data?.membership.tier : live.data?.tier;
  const [queued, setQueued] = useState<Celebration | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const sequence = useRef(0);
  const dismissed = useRef(new Set<string>());
  const [ackError, setAckError] = useState("");
  useEffect(() => {
    if (!origin && live.data?.celebrations && owner) {
      const next = live.data.celebrations.find(
        (event) =>
          !dismissed.current.has(event.id) && event.id !== celebration?.id,
      );
      if (next && !celebration) setQueued({ ...next, owner });
      return;
    }
    const achieved = tracker.current.update(
      owner && tier ? { owner, tier } : null,
    );
    if (achieved && owner)
      setQueued({
        tier: achieved,
        owner,
        id: `${++sequence.current}-${achieved}`,
      });
  }, [owner, tier, live.data?.celebrations, celebration?.id, origin]);
  useEffect(() => {
    if (celebration && celebration.owner !== owner) setCelebration(null);
    if (!queued) return;
    if (queued.owner !== owner) {
      setQueued(null);
      return;
    }
    const timer = setTimeout(() => {
      setCelebration(queued);
      setQueued(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [owner, pathname, queued, celebration]);
  async function acknowledge(view = false) {
    if (!celebration) return;
    setAckError("");
    if (celebration.kind) {
      try {
        await api.post(
          `/v1/club/celebrations/${encodeURIComponent(celebration.id)}/ack`,
          {},
          { auth: true },
        );
      } catch {
        setAckError("Your celebration could not be saved. Please try again.");
        return;
      }
      dismissed.current.add(celebration.id);
      void client.invalidateQueries({ queryKey: ["club"] });
    }
    const id = celebration.id;
    setCelebration(null);
    if (view)
      router.navigate({
        pathname: "/(tabs)/loyalty",
        params: { milestone: id },
      });
  }
  return celebration ? (
    <MilestoneCelebration
      key={celebration.id}
      tier={celebration.tier}
      first={celebration.kind === "first_points"}
      points={celebration.points}
      error={ackError}
      onClose={() => void acknowledge()}
      onView={() => void acknowledge(true)}
    />
  ) : null;
}

export function MilestoneCelebration({
  tier,
  onClose,
  onView,
  first = false,
  points,
  error,
}: {
  tier: string;
  onClose: () => void;
  onView: () => void;
  first?: boolean;
  points?: number;
  error?: string;
}) {
  const { colors } = useTheme();
  const palette = membershipPalette(tier);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const motion = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const [burst, setBurst] = useState(!reduce);
  const [prompt, setPrompt] = useState(true);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      first
        ? `Your first ${points} Club points have arrived! View your member card.`
        : `${tier} unlocked! Your membership card has a new colour.`,
    );
  }, [tier, first, points]);
  useEffect(() => {
    if (reduce) {
      motion.setValue(1);
      setBurst(false);
      return;
    }
    motion.setValue(0);
    setBurst(true);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 3400,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) setBurst(false);
    });
    return () => animation.stop();
  }, [reduce, motion]);
  useEffect(() => {
    if (!burst && !prompt) onClose();
  }, [burst, prompt, onClose]);
  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 30 }]}
    >
      {burst && !reduce ? (
        <View
          testID="milestone-confetti"
          pointerEvents="none"
          accessible={false}
          style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
        >
          {Array.from({ length: 48 }, (_, index) => {
            const side = index % 2;
            const start = (index % 8) * 0.018;
            const particle = motion.interpolate({
              inputRange: [start, start + 0.82],
              outputRange: [0, 1],
              extrapolate: "clamp",
            });
            const target = width * (0.18 + ((index * 17) % 65) / 100);
            return (
              <Animated.View
                key={index}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: index % 3 ? 7 : 9,
                  height: index % 3 ? 13 : 9,
                  borderRadius: index % 3 ? 2 : 5,
                  backgroundColor: [
                    "#EC008C",
                    "#F2C653",
                    "#51C4DC",
                    "#A78BFA",
                    "#F78DA7",
                    "#46BFA0",
                  ][index % 6],
                  opacity: particle.interpolate({
                    inputRange: [0, 0.08, 0.75, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: particle.interpolate({
                        inputRange: [0, 0.55, 1],
                        outputRange: [
                          side ? width + 20 : -20,
                          target,
                          target + (side ? -30 : 30),
                        ],
                      }),
                    },
                    {
                      translateY: particle.interpolate({
                        inputRange: [0, 0.25, 1],
                        outputRange: [
                          height * (0.2 + (index % 9) * 0.035),
                          height * (0.12 + (index % 7) * 0.035),
                          height + 30,
                        ],
                      }),
                    },
                    {
                      rotate: particle.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          `${index * 23}deg`,
                          `${index * 23 + (side ? -680 : 680)}deg`,
                        ],
                      }),
                    },
                  ],
                }}
              />
            );
          })}
        </View>
      ) : null}
      {prompt ? (
        <Animated.View
          testID="milestone-prompt"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            bottom: Math.max(108, insets.bottom + 96),
            width: Math.min(420, width - 32),
            alignSelf: "center",
            padding: 18,
            gap: 12,
            borderRadius: 26,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: palette.accent,
            shadowColor: "#21131B",
            shadowOpacity: 0.2,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 8 },
            elevation: 18,
            opacity: motion.interpolate({
              inputRange: [0, 0.09, 1],
              outputRange: [0, 1, 1],
            }),
            transform: [
              {
                translateY: motion.interpolate({
                  inputRange: [0, 0.09, 1],
                  outputRange: [16, 0, 0],
                }),
              },
            ],
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LinearGradient
              colors={palette.gradient}
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="ribbon" size={26} color={palette.accent} />
            </LinearGradient>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}
              >
                {first ? "Your first points!" : `${tier} unlocked!`}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}
              >
                {first
                  ? `You earned ${points} ${points === 1 ? "point" : "points"}. Your Club journey has begun—come reveal your card.`
                  : "Milestone achieved! Come see your membership card and your next goal."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss milestone celebration"
              onPress={onClose}
              style={{ padding: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <Button
            label={first ? "Reveal my Club card" : "View new card"}
            onPress={() => {
              onView();
            }}
          />
          {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
