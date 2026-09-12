import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Component,
  createContext,
  PropsWithChildren,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";
import { Button } from "./Button";
import {
  plainText,
  productPrice,
  money,
  type StoreProduct,
} from "@/features/commerce/contracts";
import { useBag } from "@/features/commerce/store";
import { useAuth } from "@/auth/AuthProvider";
export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: tokens.color.background },
  content: {
    padding: 16,
    gap: 20,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
    paddingBottom: 32,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  spread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: tokens.color.ink,
  },
  heading: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.35,
    color: tokens.color.ink,
  },
  body: { fontSize: 14, lineHeight: 21, color: tokens.color.muted },
  label: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: tokens.color.ink,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: tokens.color.brandStrong,
  },
  panel: {
    padding: 16,
    gap: 12,
    borderRadius: 18,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  line: { height: 1, backgroundColor: tokens.color.border },
  chip: {
    minHeight: 40,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  chipActive: {
    borderColor: tokens.color.brandStrong,
    backgroundColor: tokens.color.brandLight,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
});
export function IconButton({
  name,
  label,
  onPress,
  badge,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [ui.icon, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Ionicons name={name} size={23} color={tokens.color.cocoa} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            right: -3,
            top: -4,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: tokens.color.brandStrong,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 10, fontWeight: "800" }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
export function BagButton() {
  const count = useBag((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  return (
    <IconButton
      name="bag-handle-outline"
      label={"Shopping bag, " + count + " items"}
      badge={count}
      onPress={() => router.navigate("/cart")}
    />
  );
}
export function Screen({
  title,
  subtitle,
  children,
  back = false,
  right,
  header,
  scroll = true,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  right?: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={ui.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {header ?? (
          <View
            style={[
              ui.spread,
              {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 14,
                maxWidth: 900,
                width: "100%",
                alignSelf: "center",
              },
            ]}
          >
            {back ? (
              <IconButton
                name="arrow-back"
                label="Go back"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace("/home")
                }
              />
            ) : null}
            <View style={{ flex: 1 }}>
              {title ? (
                <Text accessibilityRole="header" style={ui.title}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={[ui.body, { marginTop: 3 }]}>{subtitle}</Text>
              ) : null}
            </View>
            {right === undefined ? <BagButton /> : right}
          </View>
        )}
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              ui.content,
              { paddingBottom: Math.max(36, insets.bottom + 24) },
            ]}
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={ui.spread}>
      <Text accessibilityRole="header" style={[ui.heading, { flex: 1 }]}>
        {title}
      </Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text
            style={[
              ui.label,
              { fontSize: 13, color: tokens.color.brandStrong },
            ]}
          >
            {action} →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[ui.chip, selected && ui.chipActive]}
    >
      <Text
        style={[
          ui.label,
          {
            fontSize: 13,
            color: selected ? tokens.color.brandStrong : tokens.color.cocoa,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[
        ui.panel,
        {
          backgroundColor: error
            ? tokens.color.errorLight
            : tokens.color.accentLight,
          borderWidth: 0,
          padding: 14,
        },
      ]}
    >
      <Text
        style={[
          ui.body,
          { color: error ? "#90252A" : tokens.color.accentStrong },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}
export function Feedback({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: string;
  onRetry?: () => void;
}) {
  if (loading)
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading Cake City"
        style={[ui.panel, { minHeight: 140, justifyContent: "center" }]}
      >
        <ActivityIndicator color={tokens.color.brandStrong} />
        <Text style={[ui.body, { textAlign: "center" }]}>Just a moment…</Text>
      </View>
    );
  if (error)
    return (
      <View style={ui.panel}>
        <Ionicons
          name="cloud-offline-outline"
          size={32}
          color={tokens.color.cocoa}
        />
        <Text style={ui.heading}>Let’s try that again</Text>
        <Text style={ui.body}>
          {error instanceof Error
            ? error.message
            : "This information could not be loaded."}
        </Text>
        {onRetry ? (
          <Button variant="outline" label="Try again" onPress={onRetry} />
        ) : null}
      </View>
    );
  if (empty)
    return (
      <View style={[ui.panel, { paddingVertical: 32 }]}>
        <Ionicons
          name="sparkles-outline"
          size={34}
          color={tokens.color.brandStrong}
        />
        <Text style={ui.heading}>{empty}</Text>
        <Text style={ui.body}>Your next celebration starts here.</Text>
      </View>
    );
  return null;
}
export function AccountRequired({ children }: PropsWithChildren) {
  const { customer, restoring } = useAuth();
  if (restoring) return <Feedback loading />;
  if (!customer)
    return (
      <View style={ui.panel}>
        <Ionicons
          name="person-circle-outline"
          size={42}
          color={tokens.color.brandStrong}
        />
        <Text style={ui.heading}>A little more personal.</Text>
        <Text style={ui.body}>
          Sign in to keep your cakes, addresses, rewards and celebrations
          together.
        </Text>
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        <Button
          variant="ghost"
          label="Create an account"
          onPress={() => router.push("/register")}
        />
      </View>
    );
  return children;
}
export function ProductTile({
  product,
  width,
  onPress,
}: {
  product: StoreProduct;
  width?: number;
  onPress?: () => void;
}) {
  const price = productPrice(product);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        plainText(product.name) + (price !== null ? ", " + money(price) : "")
      }
      onPress={
        onPress ??
        (() =>
          router.push({
            pathname: "/product/[id]",
            params: { id: String(product.id) },
          }))
      }
      style={({ pressed }) => ({
        width,
        flex: width ? undefined : 1,
        opacity: pressed ? 0.8 : 1,
        minWidth: 0,
        overflow: "hidden",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.color.border,
        backgroundColor: tokens.color.surface,
      })}
    >
      <View
        style={{
          aspectRatio: 1.08,
          backgroundColor: "#F8E6EB",
          overflow: "hidden",
        }}
      >
        {product.images[0] ? (
          <Image
            source={product.images[0].src}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={String(product.id)}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons
              name="image-outline"
              size={32}
              color={tokens.color.muted}
            />
          </View>
        )}
        {product.on_sale ? (
          <View
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              backgroundColor: "white",
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 8,
            }}
          >
            <Text style={[ui.eyebrow, { letterSpacing: 0.6 }]}>
              SPECIAL PRICE
            </Text>
          </View>
        ) : null}
        <View
          style={{
            position: "absolute",
            top: 9,
            right: 9,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "rgba(255,255,255,.94)",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,.9)",
          }}
        >
          <Ionicons
            name="heart-outline"
            size={19}
            color={tokens.color.brandStrong}
          />
        </View>
      </View>
      <View
        style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12 }}
      >
        <Text
          numberOfLines={2}
          style={[ui.label, { minHeight: 38, fontSize: 13, lineHeight: 18 }]}
        >
          {plainText(product.name)}
        </Text>
        <Text
          style={[
            ui.label,
            { color: tokens.color.brandStrong, marginTop: 4, fontSize: 12.5 },
          ]}
        >
          {price !== null
            ? (product.type === "variable" ? "From " : "") + money(price)
            : "Ask Cake City"}
        </Text>
      </View>
    </Pressable>
  );
}
const ToastContext = createContext<(message: string) => void>(() => undefined);
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <ToastContext.Provider
      value={(message) => {
        if (timer.current) clearTimeout(timer.current);
        setMessage(message);
        AccessibilityInfo.announceForAccessibility(message);
        timer.current = setTimeout(() => setMessage(""), 4000);
      }}
    >
      {children}
      {message ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 100,
            left: 22,
            right: 22,
            padding: 16,
            backgroundColor: tokens.color.cocoa,
            borderRadius: 14,
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "600",
            }}
          >
            {message}
          </Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export class AppErrorBoundary extends Component<
  PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <SafeAreaView
        style={[ui.page, { justifyContent: "center", padding: 24 }]}
      >
        <Feedback
          error={
            new Error(
              "Cake City could not display this screen. Try opening it again.",
            )
          }
          onRetry={() => this.setState({ failed: false })}
        />
      </SafeAreaView>
    ) : (
      this.props.children
    );
  }
}
export function Reveal({ children }: PropsWithChildren) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!reduced && active) {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      active = false;
      opacity.stopAnimation();
    };
  }, [opacity]);
  return <Animated.View style={{ opacity, gap: 22 }}>{children}</Animated.View>;
}
