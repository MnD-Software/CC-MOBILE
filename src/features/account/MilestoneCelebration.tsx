import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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

type Celebration = { tier: string; owner: string; id: string };

/** Lives above navigation so a confirmed milestone follows the member between screens. */
export function MilestoneCelebrationObserver() {
  const pathname = usePathname();
  const origin = purchaseTestOrigin();
  const { customer } = useAuth();
  const preview = usePurchasePreview();
  const live = useQuery({
    queryKey: ["club", customer?.id, origin],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !origin && Boolean(customer),
    staleTime: 60_000,
    retry: false,
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
  useEffect(() => {
    const achieved = tracker.current.update(
      owner && tier ? { owner, tier } : null,
    );
    if (achieved && owner)
      setQueued({
        tier: achieved,
        owner,
        id: `${++sequence.current}-${achieved}`,
      });
  }, [owner, tier]);
  useEffect(() => {
    if (celebration && celebration.owner !== owner) setCelebration(null);
    if (!queued) return;
    if (queued.owner !== owner) {
      setQueued(null);
      return;
    }
    // Let checkout finish navigation before offering another destination.
    if (["/checkout", "/purchase-test"].includes(pathname)) return;
    setCelebration(queued);
    setQueued(null);
  }, [owner, pathname, queued, celebration]);
  return celebration ? (
    <MilestoneCelebration
      key={celebration.id}
      tier={celebration.tier}
      onClose={() => setCelebration(null)}
      onView={() =>
        router.navigate({
          pathname: "/(tabs)/loyalty",
          params: { milestone: celebration.id },
        })
      }
    />
  ) : null;
}

export function MilestoneCelebration({
  tier,
  onClose,
  onView,
}: {
  tier: string;
  onClose: () => void;
  onView: () => void;
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
      `${tier} unlocked! Your membership card has a new colour.`,
    );
  }, [tier]);
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
                {tier} unlocked!
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}
              >
                Your membership card has a new colour.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss milestone celebration"
              onPress={() => setPrompt(false)}
              style={{ padding: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <Button
            label="View new card"
            onPress={() => {
              setPrompt(false);
              onView();
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
