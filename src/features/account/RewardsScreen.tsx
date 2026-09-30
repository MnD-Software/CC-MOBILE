import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  BagButton,
  Feedback,
  Notice,
  Screen,
  Section,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  removeCouponCode,
  saveCouponCode,
  selectCouponCode,
  useCouponWallet,
} from "@/features/commerce/coupon-wallet";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import { tokens } from "@/theme/tokens";

export function RewardsScreen() {
  const { customer, restoring } = useAuth();
  const wallet = useCouponWallet(customer?.id);
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setCode("");
    setError("");
    setNotice("");
  }, [wallet.scope]);

  async function change(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your coupon wallet could not be updated. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Cake City Club"
      subtitle="Your next celebration, made sweeter."
      right={<BagButton />}
    >
      <LinearGradient
        colors={
          isDark
            ? ["#301B28", "#73203E", "#B80068"]
            : ["#51382D", "#8F285D", "#C90078"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroMark}>
            <Ionicons name="ribbon" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.heroEyebrow}>THE SWEET SIDE OF CAKE CITY</Text>
        </View>
        <Text style={styles.heroTitle}>
          A little more
          {customer?.first_name ? `, ${customer.first_name}` : " to love"}.
        </Text>
        <Text style={styles.heroCopy}>
          Keep your coupon codes together, plan a celebration and pick up where
          you left off.
        </Text>
      </LinearGradient>

      <Section title="Your coupon wallet" />
      <View style={styles.walletPanel}>
        <View style={styles.panelHeading}>
          <View style={styles.ticketIcon}>
            <Ionicons
              name="ticket-outline"
              size={23}
              color={colors.brandStrong}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.panelTitle}>Have a Cake City code?</Text>
            <Text style={styles.body}>
              Save it here. Cake City checks its eligibility and discount
              against your bag at checkout.
            </Text>
          </View>
        </View>
        <Input
          label="Coupon code"
          placeholder="Enter your code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={100}
          editable={!busy && !restoring}
        />
        <Button
          label="Save coupon"
          disabled={busy || restoring || !code.trim()}
          loading={busy}
          onPress={() =>
            void change(async () => {
              await saveCouponCode(wallet.scope, code);
              setCode("");
            }, "Code saved. It is not applied until Cake City confirms it at checkout.")
          }
        />
        <Text style={styles.small}>
          {customer
            ? "Stored securely on this device for your signed-in account. Codes do not sync between devices."
            : "Guest codes stay only in this app session. Signing in or switching accounts clears the guest wallet."}
        </Text>
      </View>

      {error ? <Notice error message={error} /> : null}
      {notice ? <Notice message={notice} /> : null}
      {restoring ? (
        <Feedback loading />
      ) : wallet.codes.length ? (
        <View style={styles.codeList}>
          {wallet.codes.map((saved) => {
            const selected = wallet.selected === saved;
            return (
              <View
                key={saved}
                style={[styles.couponCard, selected && styles.selectedCard]}
              >
                <View style={styles.panelHeading}>
                  <Ionicons
                    name="ticket"
                    size={24}
                    color={colors.brandStrong}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.couponCode}>{saved}</Text>
                    <Text style={styles.small}>
                      {selected
                        ? "Selected for checkout - eligibility not yet verified"
                        : "Saved code - eligibility checked at checkout"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove coupon ${saved}`}
                    disabled={busy}
                    onPress={() =>
                      void change(
                        () => removeCouponCode(wallet.scope, saved),
                        "Code removed from your wallet.",
                      )
                    }
                    style={styles.remove}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={19}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>
                <Button
                  variant={selected ? "secondary" : "outline"}
                  label={selected ? "Clear selection" : "Use at checkout"}
                  disabled={busy}
                  onPress={() =>
                    void change(
                      () =>
                        selectCouponCode(wallet.scope, selected ? null : saved),
                      selected
                        ? "Coupon selection cleared. Checkout will confirm any removal."
                        : "Selected. Open your bag to check this code against your cakes.",
                    )
                  }
                />
              </View>
            );
          })}
          <Button label="Open my bag" onPress={() => router.push("/cart")} />
        </View>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="ticket-outline" size={28} color={colors.muted} />
          <Text style={styles.panelTitle}>Ready when you have a code</Text>
          <Text style={styles.body}>
            Add a code you received from Cake City. Saving a code does not
            create a discount or confirm its expiry.
          </Text>
        </View>
      )}

      <Section title="Make it a celebration" />
      <View style={styles.actions}>
        <Button
          variant="outline"
          label="Create a custom cake"
          onPress={() => router.push("/(tabs)/custom")}
        />
        <Button
          variant="outline"
          label="Track an order"
          onPress={() => router.push("/(tabs)/orders")}
        />
        <Button
          variant="outline"
          label="Browse Deals & Steals"
          onPress={() =>
            router.push({
              pathname: "/(tabs)/shop",
              params: { category: "206", categoryName: "Deals and Steals" },
            })
          }
        />
      </View>
      <View style={styles.balanceNote}>
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={colors.muted}
        />
        <View style={styles.flex}>
          <Text style={styles.panelTitle}>Club points: not connected</Text>
          <Text style={styles.body}>
            A verified points balance and points redemption are not available
            from Cake City's mobile service yet. Coupon discounts are separate
            and verified by the website checkout.
          </Text>
        </View>
      </View>
      <Button
        variant="ghost"
        label="Get help with a coupon"
        onPress={() => router.push("/help")}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  hero: {
    gap: 14,
    padding: 23,
    borderRadius: 30,
    overflow: "hidden",
    ...tokens.shadow.floating,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroMark: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  heroEyebrow: {
    color: "#FFF8E5",
    fontSize: 9,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 1,
    flex: 1,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
  },
  heroCopy: { color: "#FFF7E7", fontSize: 13, lineHeight: 20 },
  walletPanel: {
    gap: 14,
    padding: 19,
    borderRadius: 27,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.card,
  },
  panelHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  ticketIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tokens.color.brandLight,
  },
  panelTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: tokens.color.ink,
  },
  body: { fontSize: 12, lineHeight: 18, color: tokens.color.muted },
  small: { fontSize: 11, lineHeight: 17, color: tokens.color.muted },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  codeList: { gap: 12 },
  couponCard: {
    gap: 14,
    padding: 18,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  selectedCard: {
    borderColor: tokens.color.brandStrong,
    backgroundColor: tokens.color.brandLight,
  },
  couponCode: {
    color: tokens.color.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
  },
  remove: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    gap: 8,
    padding: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: tokens.color.borderStrong,
    backgroundColor: tokens.color.surface,
  },
  actions: { gap: 10 },
  balanceNote: {
    flexDirection: "row",
    gap: 10,
    padding: 18,
    borderRadius: 24,
    backgroundColor: tokens.color.surfaceTint,
  },
});
