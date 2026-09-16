import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  StyleProp,
  Text,
  View,
  ViewStyle,
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
import { useBag, usePreferences } from "@/features/commerce/store";
import { customerApi } from "@/features/commerce/api";
import { CakeArtwork } from "./ReferenceArtwork";
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
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
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
    width: 38,
    height: 38,
    borderRadius: 10,
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
  plain = false,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
  plain?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        ui.icon,
        plain && { backgroundColor: "transparent", borderWidth: 0 },
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Ionicons name={name} size={22} color={tokens.color.ink} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            right: -3,
            top: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
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
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  right?: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
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
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              ui.content,
              { paddingBottom: Math.max(112, insets.bottom + 96) },
              contentStyle,
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
  compact = false,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  compact?: boolean;
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
          hitSlop={compact ? 5 : 0}
          style={{ minHeight: compact ? 34 : 44, justifyContent: "center" }}
        >
          <Text
            style={[
              ui.label,
              { fontSize: 13, color: tokens.color.brandStrong },
            ]}
          >
            {action}
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
  filled = false,
  compact = false,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  filled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      hitSlop={compact ? 6 : 2}
      style={[
        ui.chip,
        compact && {
          minHeight: 32,
          paddingVertical: 5,
          paddingHorizontal: 19,
          borderRadius: 10,
        },
        selected && ui.chipActive,
        selected && filled && { backgroundColor: tokens.color.brandStrong },
      ]}
    >
      <Text
        style={[
          ui.label,
          {
            fontSize: 13,
            fontWeight: selected ? "600" : "400",
            color:
              selected && filled
                ? "#FFFFFF"
                : selected
                  ? tokens.color.brandStrong
                  : tokens.color.ink,
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
export function FavouriteButton({
  product,
  small = false,
  diameter,
}: {
  product: StoreProduct;
  small?: boolean;
  diameter?: number;
}) {
  const { customer } = useAuth();
  const cache = useQueryClient();
  const toast = useToast();
  const saved = usePreferences((state) => state.savedReferenceCakes);
  const toggle = usePreferences((state) => state.toggleReferenceCake);
  const isReference = product.type === "reference";
  const favourites = useQuery({
    queryKey: ["favourites", customer?.id],
    queryFn: customerApi.favourites,
    enabled: !!customer && !isReference,
  });
  const selected = isReference
    ? (saved ?? []).includes(product.id)
    : Boolean(favourites.data?.some((item) => item.slug === product.slug));
  const mutation = useMutation({
    mutationFn: () => customerApi.favourite(product.slug, selected),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["favourites"] });
    },
    onError: (error) => toast(error.message),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        (selected ? "Remove " : "Save ") +
        plainText(product.name) +
        (selected ? " from favourites" : " to favourites")
      }
      accessibilityState={{ selected, busy: mutation.isPending }}
      disabled={mutation.isPending}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        if (isReference) toggle(product.id);
        else if (!customer) router.push("/sign-in");
        else mutation.mutate();
      }}
      style={{
        width: diameter ?? (small ? 29 : 35),
        height: diameter ?? (small ? 29 : 35),
        borderRadius: 30,
        backgroundColor: "#FFFCFC",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={selected ? "heart" : "heart-outline"}
        size={small ? 17 : 20}
        color={selected ? tokens.color.brandStrong : tokens.color.cocoa}
      />
    </Pressable>
  );
}

export function ProductTile({
  product,
  width,
  onPress,
  compact = false,
}: {
  product: StoreProduct;
  width?: number;
  onPress?: () => void;
  compact?: boolean;
}) {
  const price = productPrice(product);
  const portraitArtwork =
    !compact &&
    product.type === "reference" &&
    product.slug === "black-forest-delight";
  const artworkWidth = width ?? 164;
  return (
    <View style={{ width, flex: width ? undefined : 1, minWidth: 0 }}>
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
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, minWidth: 0 })}
      >
        <View
          style={{
            aspectRatio: compact ? 0.77 : 1.1,
            backgroundColor: "#F3D9DC",
            overflow: "hidden",
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: compact ? 12 : 0,
            borderBottomRightRadius: compact ? 12 : 0,
          }}
        >
          {product.images[0] ? (
            <CakeArtwork source={product.images[0].src} compact={compact} />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="image-outline"
                size={32}
                color={tokens.color.muted}
              />
            </View>
          )}
        </View>
        <View
          style={{
            paddingHorizontal: 5,
            paddingTop: 10,
            paddingBottom: 7,
            gap: 7,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              color: tokens.color.ink,
              fontWeight: "600",
              minHeight: 35,
              fontSize: compact ? 12 : 13,
              lineHeight: 18,
            }}
          >
            {product.type === "reference"
              ? plainText(product.name).replace(
                  / (Delight|Dream|Cheesecake|Bliss)$/,
                  "\n$1",
                )
              : plainText(product.name)}
          </Text>
          <Text
            style={{
              color: compact ? tokens.color.cocoa : tokens.color.brandStrong,
              fontWeight: compact ? "400" : "600",
              fontSize: 13,
              lineHeight: 18,
              minHeight: 18,
            }}
          >
            {price === null ? (
              "Ask Cake City"
            ) : (
              <>
                {!compact && (
                  <Text
                    style={{ color: tokens.color.cocoa, fontWeight: "400" }}
                  >
                    From{" "}
                  </Text>
                )}
                {money(price)}
              </>
            )}
          </Text>
        </View>
      </Pressable>
      <View
        style={{
          position: "absolute",
          top: portraitArtwork ? artworkWidth * 0.03 : 7,
          right: portraitArtwork ? artworkWidth * 0.06 : 7,
        }}
      >
        <FavouriteButton
          product={product}
          small={compact}
          diameter={portraitArtwork ? artworkWidth * 0.25 : undefined}
        />
      </View>
    </View>
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
