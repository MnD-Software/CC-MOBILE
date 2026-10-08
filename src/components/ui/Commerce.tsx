import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Component,
  createContext,
  ErrorInfo,
  memo,
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
  View,
  ViewStyle,
} from "react-native";
import { Text } from "@/components/ui/Typography";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { trackCommerceEvent } from "@/observability/commerce-events";
import { performHaptic } from "@/design";
import { GlassSurface } from "@/components/storefront/GlassSurface";
import { Button } from "./Button";
import {
  plainText,
  productPrice,
  money,
  type StoreProduct,
} from "@/features/commerce/contracts";
import { useBag, usePreferences } from "@/features/commerce/store";
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
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
});
const baseUi = ui;

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
  const themed = useThemedStyles(ui);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        themed.icon,
        plain && { backgroundColor: "transparent", borderWidth: 0 },
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Ionicons name={name} size={22} color={colors.ink} />
      {badge ? (
        <View
          style={{
            position: "absolute",
            right: -3,
            top: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: tokens.color.brand,
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
      onPress={() => {
        trackCommerceEvent("cart_viewed", { item_count: count });
        router.navigate("/cart");
      }}
    />
  );
}
/**
 * Persistent browsing chrome for the catalogue surfaces. It intentionally
 * lives outside each screen's scrolling list: the search affordance and bag
 * are always one tap away, rather than disappearing with the first products.
 * Consumers own the brand/title treatment and the actual search control so
 * Home can stay lightweight while Shop keeps its native TextInput.
 */
export function CommerceBrowseHeader({
  brand,
  children,
  right,
}: {
  brand: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  const browseHeader = useThemedStyles(browseHeaderStyles);
  return (
    <View style={browseHeader.shell}>
      <View style={browseHeader.topRow}>
        <View style={browseHeader.brand}>{brand}</View>
        <View style={browseHeader.actions}>
          <BagButton />
          {right}
        </View>
      </View>
      <View style={browseHeader.search}>{children}</View>
    </View>
  );
}

const browseHeaderStyles = StyleSheet.create({
  shell: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "rgba(255,254,255,0.985)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(236,0,140,0.12)",
    shadowColor: "#51382D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 2,
  },
  topRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: { flex: 1, minWidth: 0 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  search: { width: "100%" },
});

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
  const themed = useThemedStyles(ui);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={themed.page}>
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
                <Text accessibilityRole="header" style={themed.title}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={[themed.body, { marginTop: 3 }]}>{subtitle}</Text>
              ) : null}
            </View>
            {right === undefined ? null : right}
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
  const themed = useThemedStyles(ui);
  const { colors } = useTheme();
  return (
    <View style={ui.spread}>
      <Text accessibilityRole="header" style={[themed.heading, { flex: 1 }]}>
        {title}
      </Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          hitSlop={compact ? 5 : 0}
          style={{ minHeight: compact ? 34 : 44, justifyContent: "center" }}
        >
          <Text style={[ui.label, { fontSize: 13, color: colors.brandStrong }]}>
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
  const themed = useThemedStyles(ui);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      hitSlop={compact ? 6 : 2}
      style={[
        themed.chip,
        compact && {
          minHeight: 32,
          paddingVertical: 5,
          paddingHorizontal: 19,
          borderRadius: 10,
        },
        selected && themed.chipActive,
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
                  ? colors.brandStrong
                  : colors.ink,
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
  const themed = useThemedStyles(ui);
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[
        themed.panel,
        {
          backgroundColor: error ? colors.errorLight : colors.accentLight,
          borderWidth: 0,
          padding: 14,
        },
      ]}
    >
      <Text
        style={[ui.body, { color: error ? colors.error : colors.accentStrong }]}
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
  const ui = useThemedStyles(baseUi);
  const { colors } = useTheme();
  if (loading)
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading Cake City"
        style={[ui.panel, { minHeight: 140, justifyContent: "center" }]}
      >
        <ActivityIndicator color={colors.brandStrong} />
        <Text style={[ui.body, { textAlign: "center" }]}>Just a moment…</Text>
      </View>
    );
  if (error)
    return (
      <View style={ui.panel}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.cocoa} />
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
          color={colors.brandStrong}
        />
        <Text style={ui.heading}>{empty}</Text>
        <Text style={ui.body}>Your next celebration starts here.</Text>
      </View>
    );
  return null;
}
export function AccountRequired({ children }: PropsWithChildren) {
  const ui = useThemedStyles(baseUi);
  const { colors } = useTheme();
  const { customer, restoring } = useAuth();
  if (restoring) return <Feedback loading />;
  if (!customer)
    return (
      <View style={ui.panel}>
        <Ionicons
          name="person-circle-outline"
          size={42}
          color={colors.brandStrong}
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
  const toast = useToast();
  const { colors } = useTheme();
  const { customer } = useAuth();
  const saved = usePreferences((state) => state.savedProductSlugs);
  const toggle = usePreferences((state) => state.toggleSavedProduct);
  const selected = (saved ?? []).includes(product.slug);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        (selected ? "Remove " : "Save ") +
        plainText(product.name) +
        (selected ? " from favourites" : " to favourites")
      }
      accessibilityState={{ selected }}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        trackCommerceEvent("product_favorited", {
          product_id: product.id,
          saved: !selected,
        });
        toggle(product.slug);
        void performHaptic(selected ? "toggleOff" : "toggleOn");
        toast(
          selected
            ? "Removed from My cakes."
            : customer
              ? "Saved to My cakes."
              : "Saved. Sign in to keep it with your account.",
        );
      }}
      style={{
        width: diameter ?? (small ? 29 : 35),
        height: diameter ?? (small ? 29 : 35),
        borderRadius: 30,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={selected ? "heart" : "heart-outline"}
        size={small ? 17 : 20}
        color={selected ? colors.brandStrong : colors.cocoa}
      />
    </Pressable>
  );
}

const PRODUCT_TILE_CANVAS = "#FFFFFF";

export const ProductTile = memo(function ProductTile({
  product,
  width,
  onPress,
  compact = false,
  layout = "card",
}: {
  product: StoreProduct;
  width?: number;
  onPress?: () => void;
  compact?: boolean;
  layout?: "card" | "row";
}) {
  const { colors, isDark } = useTheme();
  const tileStyles = useThemedStyles(productTileStyles);
  const horizontal = layout === "row";
  const price = productPrice(product);
  const addToBag = useBag((state) => state.add);
  const toast = useToast();
  const category = product.categories[0]?.name
    ? plainText(product.categories[0].name)
    : "Cake City";
  const quickAddAllowed =
    product.type === "simple" &&
    product.variations.length === 0 &&
    product.is_in_stock &&
    product.is_purchasable &&
    price !== null;
  const quickAddSize = /(?:^|\D)2(?:\.0)?\s*kg/i.test(plainText(product.name))
    ? "2kg"
    : /1[.\s-]*5\s*kg/i.test(plainText(product.name))
      ? "1.5kg"
      : "1kg";
  const openProduct = () => {
    trackCommerceEvent("product_viewed", {
      product_id: product.id,
      source: compact ? "product_rail" : "product_grid",
    });
    if (onPress) {
      onPress();
      return;
    }
    router.push({
      pathname: "/product/[id]",
      params: { id: String(product.id), slug: product.slug },
    });
  };
  const quickAdd = () => {
    if (!quickAddAllowed || price === null) return;
    addToBag({
      key: "",
      product_id: product.id,
      slug: product.slug,
      name: plainText(product.name),
      image: product.images[0]?.src ?? null,
      price,
      quantity: 1,
      selection: {
        size: quickAddSize,
        message: "",
        add_ons: [],
      },
    });
    trackCommerceEvent("quick_add", { product_id: product.id });
    void performHaptic("addToCart");
    toast("Added to your bag.");
  };
  return (
    <GlassSurface
      intensity={28}
      opaque={horizontal || compact}
      tintColor={colors.surface}
      style={{
        width,
        flex: horizontal || width ? undefined : 1,
        minWidth: 0,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: compact ? 16 : 26,
        ...tokens.shadow.card,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          plainText(product.name) + (price !== null ? ", " + money(price) : "")
        }
        onPress={openProduct}
        style={({ pressed }) => ({
          opacity: pressed ? 0.86 : 1,
          minWidth: 0,
          flexDirection: horizontal ? "row" : "column",
          alignItems: horizontal ? "center" : undefined,
          minHeight: horizontal ? 156 : undefined,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        <View
          style={{
            aspectRatio: 1,
            width: horizontal ? 90 : undefined,
            marginLeft: horizontal ? 10 : 0,
            borderRadius: horizontal ? 23 : 0,
            backgroundColor: PRODUCT_TILE_CANVAS,
            overflow: "hidden",
          }}
        >
          {product.images[0] ? (
            <CakeArtwork
              source={product.images[0].src}
              compact={compact}
              recyclingKey={`${product.id}:${product.images[0].src}`}
            />
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
            backgroundColor: colors.surface,
            paddingHorizontal: compact ? 9 : 14,
            paddingTop: compact ? 9 : 12,
            paddingBottom: 14,
            paddingRight: horizontal ? 10 : compact ? 9 : 14,
            paddingLeft: horizontal ? 9 : compact ? 9 : 14,
            flex: horizontal ? 1 : undefined,
            minWidth: 0,
            gap: 5,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: product.on_sale ? colors.brandStrong : colors.muted,
              fontSize: compact ? 10 : 9,
              lineHeight: 14,
              fontWeight: "800",
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            {product.on_sale ? "Special price" : category}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: colors.ink,
              fontWeight: "700",
              minHeight: compact ? 36 : 40,
              fontSize: horizontal ? 13 : compact ? 13 : 14,
              lineHeight: horizontal ? 18 : compact ? 18 : 20,
              letterSpacing: -0.15,
            }}
          >
            {plainText(product.name)}
          </Text>
          {horizontal && product.review_count > 0 ? (
            <Text style={{ fontSize: 10, color: colors.muted }}>
              ★ {product.average_rating} · {product.review_count} reviews
            </Text>
          ) : null}
          <Text
            style={{
              color: colors.ink,
              fontWeight: "800",
              fontSize: compact ? 16 : 16,
              lineHeight: 22,
              minHeight: 18,
              paddingRight: compact ? 0 : 42,
              marginTop: 3,
              minWidth: 0,
            }}
          >
            {price === null ? (
              "Ask Cake City"
            ) : (
              <>
                {(product.type === "variable" ||
                  product.variations.length > 0) && (
                  <Text style={{ color: colors.cocoa, fontWeight: "400" }}>
                    From{" "}
                  </Text>
                )}
                {money(price)}
              </>
            )}
          </Text>
          <Text
            style={{
              fontSize: compact ? 11 : 9,
              lineHeight: 15,
              color: colors.muted,
              paddingRight: compact ? 0 : 44,
              marginBottom: compact ? 48 : 0,
            }}
          >
            {!product.is_in_stock
              ? "Out of stock"
              : !product.is_purchasable || price === null
                ? "View details"
                : quickAddAllowed
                  ? "Ready to add"
                  : "Choose size & options"}
          </Text>
        </View>
      </Pressable>
      {!horizontal ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
          }}
        >
          <FavouriteButton
            product={product}
            small={compact}
            diameter={undefined}
          />
        </View>
      ) : null}
      <Pressable
        accessibilityLabel={`${!product.is_in_stock ? "Out of stock:" : quickAddAllowed ? "Quick add to bag:" : "Choose options for:"} ${plainText(product.name)}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !product.is_in_stock }}
        disabled={!product.is_in_stock}
        onPress={quickAddAllowed ? quickAdd : openProduct}
        style={({ pressed }) => [
          tileStyles.quickAdd,
          compact && {
            left: 9,
            right: 9,
            bottom: 10,
            width: "auto",
            height: 44,
            borderRadius: 22,
            flexDirection: "row",
            gap: 5,
          },
          !product.is_in_stock && { backgroundColor: colors.mutedSoft },
          pressed && tileStyles.quickAddPressed,
        ]}
      >
        {!(compact && width && width < 145) ? (
          <Ionicons
            name={quickAddAllowed ? "add" : "options-outline"}
            size={20}
            color="#FFFFFF"
          />
        ) : null}
        {compact ? (
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 11,
              fontWeight: "700",
              flexShrink: 1,
              textAlign: "center",
            }}
          >
            {!product.is_in_stock
              ? "Sold out"
              : quickAddAllowed
                ? "Add to bag"
                : "Choose options"}
          </Text>
        ) : null}
      </Pressable>
    </GlassSurface>
  );
});
const productTileStyles = StyleSheet.create({
  quickAdd: {
    position: "absolute",
    right: 12,
    bottom: 11,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: tokens.color.brandStrong,
  },
  quickAddPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
});
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
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the customer-facing fallback calm, while preserving the actual
    // stack in Logcat/Sentry-compatible console capture. Never send product,
    // account, address, or payment data from this boundary.
    console.error(
      "[Cake City] Screen render failed",
      error,
      info.componentStack,
    );
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
  // Native Liquid Glass loses its effect when any ancestor reaches opacity 0.
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!reduced && active) {
        offset.setValue(8);
        Animated.timing(offset, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      active = false;
      offset.stopAnimation();
    };
  }, [offset]);
  return (
    <Animated.View style={{ transform: [{ translateY: offset }], gap: 22 }}>
      {children}
    </Animated.View>
  );
}
