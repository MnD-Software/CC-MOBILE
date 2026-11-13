import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import {
  couponWalletScope,
  saveCouponCode,
} from "@/features/commerce/coupon-wallet";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfettiBurst } from "@/components/ui/ConfettiBurst";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Notice, useToast } from "@/components/ui/Commerce";
import { useTheme } from "@/theme/ThemeProvider";
import { useMotionAccessibilityPreference } from "@/design/useReducedMotion";

export function WelcomeCoupon() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false),
    [checked, setChecked] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { reduceMotion, isResolved } = useMotionAccessibilityPreference();
  const motion = useRef(new Animated.Value(0)).current;
  const benefit = useQuery({
    queryKey: ["welcome-coupon", customer?.id],
    queryFn: () =>
      api.post<{
        coupon: { code: string; amount_minor: number; terms: string } | null;
      }>("/v1/account/coupons/welcome", {}, { auth: true }),
    enabled: customer?.role === "customer",
    staleTime: 300000,
    retry: false,
  });
  const code = benefit.data?.coupon?.code;
  const seenKey = `cakecity.welcome-coupon.${customer?.id}`;
  useEffect(() => {
    let active = true;
    if (!code) return;
    void getStorageItem(seenKey)
      .then((seen) => {
        if (active && !seen) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, seenKey]);
  useEffect(() => {
    if (!open || !isResolved || reduceMotion) return;
    motion.setValue(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 4600,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [open, isResolved, reduceMotion, motion]);
  async function save(apply: boolean) {
    if (!code || !customer || busy) return;
    setBusy(true);
    setError("");
    try {
      await saveCouponCode(couponWalletScope(customer.id), code, apply);
      await setStorageItem(seenKey, "seen");
      setOpen(false);
      toast(
        apply
          ? "Your KES 100 welcome coupon will be selected at checkout."
          : "Your welcome coupon is saved for your first order.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your coupon could not be saved. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <BottomSheet
      visible={open}
      title="A little welcome. A big celebration."
      onClose={() => void save(false)}
    >
      <View style={{ gap: 18 }}>
        <LinearGradient
          colors={["#631344", "#B80068", "#E63699"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 28,
            padding: 28,
            gap: 12,
            overflow: "hidden",
            minHeight: 270,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {!reduceMotion && isResolved ? (
            <ConfettiBurst motion={motion} testID="welcome-coupon-confetti" />
          ) : null}
          {Array.from({ length: 12 }, (_, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: `${(i * 29) % 95}%`,
                top: 15 + ((i * 41) % 220),
                width: i % 2 ? 7 : 12,
                height: i % 2 ? 20 : 7,
                borderRadius: 3,
                backgroundColor: ["#FFE49C", "#F6AAD8", "#8FE2D9"][i % 3],
                transform: [{ rotate: `${i * 37}deg` }],
                opacity: 0.7,
              }}
            />
          ))}
          <View
            style={{
              padding: 10,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.15)",
            }}
          >
            <Ionicons name="gift-outline" size={34} color="#FFE9B3" />
          </View>
          <Text
            style={{
              color: "#FFE4F1",
              fontSize: 11,
              fontWeight: "800",
              letterSpacing: 3,
            }}
          >
            YOUR FIRST TREAT IS ON US
          </Text>
          <Text
            style={{
              color: "white",
              fontWeight: "900",
              fontSize: 61,
              letterSpacing: -3,
            }}
          >
            KES 100
          </Text>
          <Text style={{ color: "#FFF2F8", fontSize: 20, fontWeight: "800" }}>
            off your first order
          </Text>
          <View
            style={{
              borderTopWidth: 1,
              borderStyle: "dashed",
              borderColor: "rgba(255,255,255,0.5)",
              width: "100%",
              marginTop: 8,
              paddingTop: 13,
            }}
          >
            <Text
              style={{
                color: "#FFE8B7",
                fontSize: 12,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              Sweet beginnings. Even sweeter memories.
            </Text>
          </View>
        </LinearGradient>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => setChecked((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 10,
          }}
        >
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={27}
            color={colors.brandStrong}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{ color: colors.ink, fontWeight: "800", fontSize: 16 }}
            >
              Apply my welcome coupon
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              We’ll select it at checkout. You can change it there.
            </Text>
          </View>
        </Pressable>
        {error ? <Notice error message={error} /> : null}
        <Button
          label={checked ? "Yes, treat me!" : "Save my welcome treat"}
          loading={busy}
          onPress={() => void save(checked)}
        />
        <Button
          label="I’ll use it later"
          variant="ghost"
          disabled={busy}
          onPress={() => void save(false)}
        />
        <Text
          style={{
            color: colors.muted,
            fontSize: 11,
            lineHeight: 18,
            textAlign: "center",
          }}
        >
          {benefit.data?.coupon?.terms}
        </Text>
      </View>
    </BottomSheet>
  );
}
