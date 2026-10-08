import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { Feedback, Screen, useToast } from "@/components/ui/Commerce";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { CheckoutProgress } from "@/components/storefront/CheckoutProgress";
import { money } from "./contracts";
import { useBag, usePreferences } from "./store";

export function CartScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  const bag = useBag();
  const saveCake = usePreferences((state) => state.toggleSavedProduct);
  const toast = useToast();
  const itemCount = bag.lines.reduce((total, line) => total + line.quantity, 0);
  const subtotal = bag.lines.reduce(
    (total, line) => total + line.price * line.quantity,
    0,
  );

  async function orderBagOnWhatsApp() {
    const order = bag.lines
      .map(
        (line) =>
          `${line.quantity} × ${line.name} (${money(line.price * line.quantity)})`,
      )
      .join("\n");
    const message = [
      "Hi Cake City, I would like to order:",
      order,
      `Subtotal: ${money(subtotal)}`,
      "Please help me confirm delivery or pickup.",
    ].join("\n\n");
    try {
      await Linking.openURL(
        `https://wa.me/254709729000?text=${encodeURIComponent(message)}`,
      );
    } catch {
      toast("We could not open WhatsApp. Please try secure checkout instead.");
    }
  }

  return (
    <Screen
      title="Your bag"
      subtitle="Everything for your next celebration."
      back
    >
      {!bag.lines.length ? (
        <>
          <Feedback empty="Your bag is waiting for something delicious." />
          <Button
            label="Find your cake"
            onPress={() => router.replace("/(tabs)/shop")}
          />
        </>
      ) : (
        <>
          <CheckoutProgress current={0} />
          <LinearGradient
            colors={isDark ? ["#211B24", "#362030"] : ["#FFFFFF", "#FFF1F8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summary}
          >
            <View style={styles.summaryIcon}>
              <Ionicons
                name="bag-handle-outline"
                size={24}
                color={colors.brandStrong}
              />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryEyebrow}>
                {itemCount} {itemCount === 1 ? "ITEM" : "ITEMS"}
              </Text>
              <Text style={styles.summaryTitle}>
                Your picks look delicious.
              </Text>
              <Text style={styles.summaryPrice}>{money(subtotal)}</Text>
            </View>
          </LinearGradient>

          <View style={styles.list}>
            {bag.lines.map((line) => (
              <View key={line.key} style={styles.lineCard}>
                <View style={styles.lineTop}>
                  <View style={styles.imageFrame}>
                    {line.image ? (
                      <Image
                        source={{ uri: line.image }}
                        cachePolicy="memory-disk"
                        contentFit="contain"
                        contentPosition="center"
                        recyclingKey={`${line.key}:${line.image}`}
                        style={styles.image}
                      />
                    ) : (
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color={colors.muted}
                      />
                    )}
                  </View>
                  <View style={styles.lineCopy}>
                    <Text numberOfLines={2} style={styles.lineName}>
                      {line.name}
                    </Text>
                    <Text style={styles.lineMeta}>{line.selection.size}</Text>
                    <Text style={styles.linePrice}>
                      {money(line.price * line.quantity)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${line.name}`}
                    onPress={() => bag.remove(line.key)}
                    style={styles.removeButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>

                <View style={styles.lineActions}>
                  <View style={styles.quantity}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease ${line.name}`}
                      disabled={line.quantity <= 1}
                      onPress={() => bag.quantity(line.key, line.quantity - 1)}
                      style={({ pressed }) => [
                        styles.quantityButton,
                        line.quantity <= 1 && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="remove" size={17} color={colors.cocoa} />
                    </Pressable>
                    <Text style={styles.quantityText}>{line.quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Increase ${line.name}`}
                      disabled={line.quantity >= 20}
                      onPress={() => bag.quantity(line.key, line.quantity + 1)}
                      style={({ pressed }) => [
                        styles.quantityButton,
                        line.quantity >= 20 && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="add" size={17} color={colors.cocoa} />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (
                      !usePreferences
                        .getState()
                        .savedProductSlugs.includes(line.slug)
                    )
                      saveCake(line.slug);
                    bag.remove(line.key);
                    toast("Moved to My cakes.");
                  }}
                  style={styles.saveButton}
                >
                  <Ionicons
                    name="heart-outline"
                    size={16}
                    color={colors.brandStrong}
                  />
                  <Text style={styles.saveButtonText}>Save for later</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.totalCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Bag total</Text>
              <Text style={styles.totalValue}>{money(subtotal)}</Text>
            </View>
            <Text style={styles.totalNote}>
              Cake City confirms availability, delivery and the final total in
              one secure checkout for every item in this bag.
            </Text>
          </View>

          <Button
            label="Secure checkout for all items"
            onPress={() => router.push("/checkout")}
          />
          <Button
            variant="outline"
            label="Manage coupons in Cake City Club"
            onPress={() => router.push("/(tabs)/loyalty")}
          />
          <Button
            variant="outline"
            label="Order everything on WhatsApp"
            onPress={() => void orderBagOnWhatsApp()}
          />
          <Button
            variant="outline"
            label="Keep shopping"
            onPress={() => router.push("/(tabs)/shop")}
          />
        </>
      )}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  summary: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 20,
    borderRadius: 26,
    ...tokens.shadow.floating,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  summaryCopy: { flex: 1, gap: 4 },
  summaryEyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  summaryTitle: {
    color: tokens.color.cocoa,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  summaryPrice: { color: tokens.color.cocoa, fontSize: 17, fontWeight: "800" },
  list: { gap: 14 },
  lineCard: {
    gap: 13,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  lineTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  imageFrame: {
    width: 86,
    height: 86,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: tokens.color.surfaceTint,
  },
  image: { width: "100%", height: "100%" },
  lineCopy: { flex: 1, minWidth: 0, gap: 3 },
  lineName: {
    color: tokens.color.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  lineMeta: { color: tokens.color.muted, fontSize: 11.5 },
  linePrice: {
    color: tokens.color.brandStrong,
    fontSize: 14,
    fontWeight: "900",
  },
  removeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  lineActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  quantity: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceTint,
  },
  quantityButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityText: {
    minWidth: 26,
    textAlign: "center",
    color: tokens.color.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  saveButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  saveButtonText: {
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    fontWeight: "700",
  },
  totalCard: {
    gap: 7,
    padding: 17,
    borderRadius: 20,
    backgroundColor: tokens.color.brandLight,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { color: tokens.color.cocoa, fontSize: 13, fontWeight: "700" },
  totalValue: {
    color: tokens.color.brandStrong,
    fontSize: 18,
    fontWeight: "900",
  },
  totalNote: { color: tokens.color.muted, fontSize: 11.5, lineHeight: 17 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
