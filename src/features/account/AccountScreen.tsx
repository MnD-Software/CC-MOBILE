import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { clubApi } from "./club-api";
import { membershipPalette } from "./member-card";
import { customerApi } from "@/features/commerce/api";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Typography";
import { useAuth } from "@/auth/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { Disclosure } from "@/components/ui/Disclosure";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import {
  CommerceBrowseHeader,
  Feedback,
  Screen,
  Section,
  useToast,
} from "@/components/ui/Commerce";
import { Button } from "@/components/ui/Button";
import { usePreferences } from "@/features/commerce/store";
import { tokens } from "@/theme/tokens";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";

const SUPPORT_PHONE = "tel:+254709729000";

const avatarChoices = [
  {
    id: "sparkles",
    label: "Sparkles",
    icon: "sparkles" as const,
    color: "#B80068",
    tint: "#FFF0F8",
  },
  {
    id: "heart",
    label: "Heart",
    icon: "heart" as const,
    color: "#BE375E",
    tint: "#FFF0F3",
  },
  {
    id: "balloon",
    label: "Balloon",
    icon: "balloon" as const,
    color: "#2475A8",
    tint: "#EEF7FF",
  },
  {
    id: "happy",
    label: "Happy face",
    icon: "happy" as const,
    color: "#7652A8",
    tint: "#F4F0FF",
  },
] as const;

type AccountLink = {
  id: string;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
};

const celebrationLinks: AccountLink[] = [
  {
    id: "orders",
    title: "Your orders",
    detail: "Track Cake City orders on this device",
    icon: "receipt-outline",
    href: "/(tabs)/orders",
  },
  {
    id: "saved",
    title: "Saved cakes",
    detail: "Keep your shortlist close",
    icon: "heart-outline",
    href: "/favourites",
  },
  {
    id: "studio",
    title: "Cake studio",
    detail: "Shape a cake around their moment",
    icon: "color-palette-outline",
    href: "/(tabs)/custom",
  },
];

const supportLinks: AccountLink[] = [
  {
    id: "help",
    title: "Help and contact",
    detail: "Answers from Cake City",
    icon: "chatbubbles-outline",
    href: "/help",
  },
  {
    id: "privacy",
    title: "Privacy and terms",
    detail: "The details that matter",
    icon: "shield-checkmark-outline",
    href: "/legal",
  },
];

function CountLabel({ count, singular }: { count: number; singular: string }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Text style={styles.shortcutValue} numberOfLines={1}>
      {count
        ? `${count} ${count === 1 ? singular : `${singular}s`}`
        : "None yet"}
    </Text>
  );
}

function Shortcut({
  icon,
  label,
  children,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  children: React.ReactNode;
  onPress: () => void;
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <View style={styles.shortcutIcon}>
        <Ionicons name={icon} size={20} color={colors.brandStrong} />
      </View>
      <Text style={styles.shortcutLabel} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </Pressable>
  );
}

function AccountRow({ link, badge }: { link: AccountLink; badge?: string }) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={link.title}
      onPress={() => router.push(link.href)}
      style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
    >
      <View style={styles.accountRowIcon}>
        <Ionicons name={link.icon} size={21} color={colors.brandStrong} />
      </View>
      <View style={styles.accountRowCopy}>
        <Text style={styles.accountRowTitle}>{link.title}</Text>
        <Text style={styles.accountRowDetail} numberOfLines={1}>
          {badge ?? link.detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedSoft} />
    </Pressable>
  );
}

function ServiceTile({
  title,
  detail,
  icon,
  onPress,
}: {
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.serviceTile, pressed && styles.pressed]}
    >
      <View style={styles.serviceIcon}>
        <Ionicons name={icon} size={21} color={colors.cocoa} />
      </View>
      <Text style={styles.serviceTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.serviceDetail} numberOfLines={2}>
        {detail}
      </Text>
    </Pressable>
  );
}

function AppearanceSelector() {
  const { colors, preference, setPreference, persistenceError } = useTheme();
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.appearancePanel}>
      <Text style={styles.profileDetailsTitle}>Appearance</Text>
      <Text style={styles.profileDetailsCopy}>
        Choose your look, or follow your device.
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="App appearance"
        style={styles.appearanceOptions}
      >
        {(
          [
            { value: "light", label: "Light", icon: "sunny-outline" },
            { value: "dark", label: "Dark", icon: "moon-outline" },
            {
              value: "system",
              label: "System",
              icon: "phone-portrait-outline",
            },
          ] as const
        ).map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label} appearance`}
            accessibilityState={{ checked: preference === option.value }}
            onPress={() => setPreference(option.value)}
            style={[
              styles.appearanceOption,
              preference === option.value && styles.appearanceSelected,
            ]}
          >
            <Ionicons
              name={option.icon}
              size={20}
              color={
                preference === option.value ? colors.brandStrong : colors.muted
              }
            />
            <Text
              style={[
                styles.shortcutLabel,
                {
                  color:
                    preference === option.value
                      ? colors.brandStrong
                      : colors.ink,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {persistenceError ? (
        <Text accessibilityRole="alert" style={styles.profileDetailsCopy}>
          Your look changed, but this device could not save it. Choose it again
          to retry.
        </Text>
      ) : null}
    </View>
  );
}

export function AccountScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors, isDark } = useTheme();
  const [editingProfile, setEditingProfile] = useState(false);
  const { customer, logout, restoring } = useAuth();
  const membership = useQuery({
    queryKey: ["club", customer?.id],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer,
    staleTime: 60_000,
    retry: false,
  });
  const clubPalette = membership.data
    ? membershipPalette(membership.data.tier)
    : null;
  const addresses = useQuery({
    queryKey: ["addresses", customer?.id],
    queryFn: customerApi.addresses,
    enabled: !!customer,
    staleTime: 60_000,
    retry: false,
  });
  const defaultAddress =
    addresses.data?.find((value) => value.is_default) ?? addresses.data?.[0];
  const savedCount = usePreferences((state) => state.savedProductSlugs.length);
  const avatar = usePreferences((state) =>
    customer ? state.profileAvatars?.[customer.id] : undefined,
  );
  const designCount = usePreferences(
    (state) => state.designs[customer?.id ?? "guest"]?.length ?? 0,
  );
  const setAvatar = usePreferences((state) => state.setProfileAvatar);
  const toast = useToast();

  async function choosePhoto() {
    if (!customer) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast("Allow photo access to choose a profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.72,
    });
    const photo = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (!photo) return;
    setAvatar(customer.id, { kind: "photo", value: photo });
    toast("Profile photo updated everywhere in Cake City.");
  }

  async function callSupport() {
    try {
      await Linking.openURL(SUPPORT_PHONE);
    } catch {
      toast("Calling is unavailable on this device.");
    }
  }

  if (restoring) {
    return (
      <Screen
        header={
          <CommerceBrowseHeader
            brand={<BrandLogo width={105} />}
            children={null}
          />
        }
      >
        <Feedback loading />
      </Screen>
    );
  }

  if (!customer) {
    return (
      <Screen
        header={
          <CommerceBrowseHeader
            brand={<BrandLogo width={105} />}
            children={null}
          />
        }
      >
        <LinearGradient
          colors={
            isDark
              ? ["#332030", "#211B24", "#172C38"]
              : ["#FFFFFF", "#FFFFFF", "#FFFFFF"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.guestHero}
        >
          <View style={styles.guestIcon}>
            <Ionicons
              name="person-add-outline"
              size={29}
              color={colors.brandStrong}
            />
          </View>
          <Text style={styles.heroEyebrow}>CAKE CITY ACCOUNT</Text>
          <Text style={styles.guestTitle}>A little more you.</Text>
          <Text style={styles.guestCopy}>
            Keep your account details close and make every celebration easier to
            pick up again.
          </Text>
          <View style={styles.guestActions}>
            <Button
              variant="secondary"
              label="Sign in"
              onPress={() => router.push("/sign-in")}
              style={styles.guestPrimaryAction}
            />
            <Button
              variant="primary"
              label="Create account"
              onPress={() => router.push("/register")}
              style={styles.guestOutlineAction}
            />
          </View>
        </LinearGradient>

        <View style={styles.deviceCard}>
          <View style={styles.deviceCardIcon}>
            <Ionicons
              name="phone-portrait-outline"
              size={22}
              color={colors.accentStrong}
            />
          </View>
          <View style={styles.deviceCardCopy}>
            <Text style={styles.deviceCardTitle}>Already choosing cakes?</Text>
            <Text style={styles.deviceCardText}>
              Your saved cakes and studio sketches stay available on this
              device.
            </Text>
          </View>
        </View>

        <View style={styles.shortcutRail}>
          <Shortcut
            icon="heart-outline"
            label="Saved cakes"
            onPress={() => router.push("/favourites")}
          >
            <CountLabel count={savedCount} singular="cake" />
          </Shortcut>
          <Shortcut
            icon="color-palette-outline"
            label="Sketches"
            onPress={() => router.push("/(tabs)/custom")}
          >
            <CountLabel count={designCount} singular="sketch" />
          </Shortcut>
          <Shortcut
            icon="chatbubbles-outline"
            label="Need help?"
            onPress={() => router.push("/help")}
          >
            <Text style={styles.shortcutValue}>Talk to us</Text>
          </Shortcut>
        </View>
        <AppearanceSelector />
        <Section title="Your essentials" />
        <View style={styles.accountList}>
          {celebrationLinks
            .filter((link) => link.id === "orders")
            .map((link) => (
              <AccountRow key={link.id} link={link} />
            ))}
          <AccountRow
            link={{
              id: "branches",
              title: "Find a bakery",
              detail: "Cake City locations and contact details",
              icon: "location-outline",
              href: "/branches",
            }}
          />
          <AccountRow link={supportLinks[1]} />
        </View>
      </Screen>
    );
  }

  const firstName = customer.first_name?.trim() || "Cake City guest";
  const avatarChoice = avatarChoices.find(
    (choice) => avatar?.kind === "preset" && choice.id === avatar.value,
  );

  return (
    <Screen
      header={
        <CommerceBrowseHeader
          brand={<BrandLogo width={105} />}
          children={null}
        />
      }
    >
      <LinearGradient
        colors={["#B80068", "#8E0052", "#610A3E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.memberHero}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose your profile photo"
          onPress={() => void choosePhoto()}
          style={({ pressed }) => [
            styles.avatarPressable,
            pressed && styles.pressed,
          ]}
        >
          <ProfileAvatar size={72} />
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={13} color={colors.brandStrong} />
          </View>
        </Pressable>
        <View style={styles.memberHeroCopy}>
          <Text style={[styles.heroEyebrow, { color: "#FFFFFF" }]}>
            YOUR CAKE CITY
          </Text>
          <Text
            style={[styles.memberName, { color: "#FFFFFF" }]}
            numberOfLines={2}
          >
            {firstName} {customer.last_name?.trim()}
          </Text>
          <Text
            style={[styles.memberEmail, { color: "#FFFFFF" }]}
            numberOfLines={1}
          >
            {customer.email}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditingProfile(!editingProfile)}
            style={[
              styles.securePill,
              { minHeight: 38, paddingHorizontal: 10 },
            ]}
          >
            <Ionicons name="create-outline" size={14} color="#FFFFFF" />
            <Text style={[styles.securePillText, { color: "#FFFFFF" }]}>
              Profile settings
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      <LinearGradient
        colors={clubPalette?.gradient ?? [colors.brandLight, colors.brandLight]}
        style={{
          borderRadius: 23,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: clubPalette?.accent ?? colors.borderStrong,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open Cake City Club${membership.data ? `, ${membership.data.tier} membership` : ""}`}
          onPress={() => router.push("/(tabs)/loyalty")}
          style={({ pressed }) => [
            styles.clubPreview,
            { backgroundColor: "transparent", borderWidth: 0 },
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.clubPreviewIcon}>
            <Ionicons
              name="ribbon-outline"
              size={23}
              color={clubPalette?.accent ?? colors.brandStrong}
            />
          </View>
          <View style={styles.clubPreviewCopy}>
            <Text
              style={[
                styles.clubPreviewTitle,
                { color: clubPalette?.ink ?? colors.ink },
              ]}
            >
              Cake City Club
            </Text>
            <Text
              style={[
                styles.clubPreviewText,
                { color: clubPalette?.muted ?? colors.muted },
              ]}
              numberOfLines={2}
            >
              {membership.data
                ? `${membership.data.points.toLocaleString()} points / Your member benefits`
                : "Your membership, rewards and celebrations"}
            </Text>
          </View>
          <View
            style={[
              styles.clubStatus,
              { backgroundColor: "rgba(255,255,255,0.20)" },
            ]}
          >
            <Text
              style={[
                styles.clubStatusText,
                { color: clubPalette?.ink ?? colors.brandStrong },
              ]}
            >
              {membership.data?.tier ?? "Open Club"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={clubPalette?.ink ?? colors.cocoa}
          />
        </Pressable>
      </LinearGradient>

      <View style={styles.shortcutRail}>
        <Shortcut
          icon="heart-outline"
          label="Saved cakes"
          onPress={() => router.push("/favourites")}
        >
          <CountLabel count={savedCount} singular="cake" />
        </Shortcut>
        <Shortcut
          icon="receipt-outline"
          label="Orders"
          onPress={() => router.push("/(tabs)/orders")}
        >
          <Text style={styles.shortcutValue}>Track them</Text>
        </Shortcut>
        <Shortcut
          icon="color-palette-outline"
          label="Sketchbook"
          onPress={() => router.push("/(tabs)/custom")}
        >
          <CountLabel count={designCount} singular="design" />
        </Shortcut>
      </View>

      {editingProfile ? (
        <>
          <View style={styles.profileDetails}>
            <View style={styles.profileDetailsHeading}>
              <View style={styles.profileDetailsIcon}>
                <Ionicons
                  name="person-outline"
                  size={19}
                  color={colors.accentStrong}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileDetailsTitle}>
                  Your sign-in details
                </Text>
                <Text style={styles.profileDetailsCopy}>
                  Verified by your current session
                </Text>
              </View>
            </View>
            <View style={styles.profileDetailRow}>
              <Text style={styles.profileDetailLabel}>Email</Text>
              <Text style={styles.profileDetailValue} numberOfLines={1}>
                {customer.email}
              </Text>
            </View>
            {customer.phone ? (
              <View style={styles.profileDetailRow}>
                <Text style={styles.profileDetailLabel}>Phone</Text>
                <Text style={styles.profileDetailValue}>{customer.phone}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.avatarPanel}>
            <View style={styles.avatarPanelHeading}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.avatarPanelTitle}>Make it yours</Text>
                <Text style={styles.avatarPanelCopy}>
                  Choose a photo or a Cake City avatar. It updates your
                  navigation icon too.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a profile photo"
                onPress={() => void choosePhoto()}
                style={({ pressed }) => [
                  styles.photoButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="images-outline" size={18} color="#FFFFFF" />
                <Text style={styles.photoButtonText}>Photo</Text>
              </Pressable>
            </View>
            <View style={styles.avatarChoices}>
              {avatarChoices.map((choice) => {
                const selected = avatarChoice?.id === choice.id;
                return (
                  <Pressable
                    key={choice.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${choice.label} avatar`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setAvatar(customer.id, {
                        kind: "preset",
                        value: choice.id,
                      });
                      toast("Avatar updated everywhere in Cake City.");
                    }}
                    style={({ pressed }) => [
                      styles.avatarChoice,
                      { backgroundColor: choice.tint },
                      selected && styles.avatarChoiceSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={choice.icon}
                      size={22}
                      color={choice.color}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      ) : null}
      <Section
        title="My addresses"
        action="Manage"
        onPress={() => router.push("/addresses")}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage your delivery addresses"
        onPress={() => router.push("/addresses")}
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 20,
          gap: 10,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={styles.shortcutIcon}>
            <Ionicons
              name="location-outline"
              size={24}
              color={colors.brandStrong}
            />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{ color: colors.ink, fontSize: 16, fontWeight: "800" }}
            >
              {defaultAddress?.label ??
                (addresses.isPending
                  ? "Loading your addresses"
                  : addresses.isError
                    ? "Your address book"
                    : "Where should we deliver?")}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
              {defaultAddress
                ? [
                    defaultAddress.line1,
                    defaultAddress.area,
                    defaultAddress.city,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : addresses.isError
                  ? "Open to retry or add a delivery address."
                  : "Save home, work or someone else's address for an easier checkout."}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.brandStrong}
          />
        </View>
        <Text
          style={{ color: colors.brandStrong, fontSize: 13, fontWeight: "700" }}
        >
          {addresses.data?.length
            ? `${addresses.data.length} saved / Manage addresses`
            : "Add a new address"}
        </Text>
      </Pressable>
      <Section title="Your essentials" />
      <View style={styles.accountList}>
        <AccountRow
          link={{
            id: "requests",
            title: "Your requests",
            detail: "Custom cakes, quotes and support replies",
            icon: "chatbox-ellipses-outline",
            href: "/requests",
          }}
        />
      </View>

      <Disclosure title="Appearance">
        <AppearanceSelector />
      </Disclosure>
      <Section title="Here to help" />
      <View style={styles.accountList}>
        {supportLinks.map((link) => (
          <AccountRow key={link.id} link={link} />
        ))}
        <AccountRow
          link={{
            id: "password",
            title: "Reset password",
            detail: "Keep your account secure",
            icon: "lock-closed-outline",
            href: "/forgot-password",
          }}
        />
      </View>
      <Button
        variant="outline"
        label="Sign out"
        icon={
          <Ionicons
            name="log-out-outline"
            size={18}
            color={colors.brandStrong}
          />
        }
        onPress={async () => {
          try {
            await logout();
            toast("You have been signed out.");
          } catch {
            toast("Unable to clear your session. Try again.");
          }
        }}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  appearancePanel: {
    gap: 10,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  appearanceOptions: { flexDirection: "row", gap: 8 },
  appearanceOption: {
    flex: 1,
    minHeight: 62,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
  },
  appearanceSelected: {
    borderColor: tokens.color.brandStrong,
    backgroundColor: tokens.color.brandLight,
  },
  guestHero: {
    gap: 11,
    padding: 21,
    borderRadius: 28,
    overflow: "hidden",
    ...tokens.shadow.floating,
  },
  guestIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  heroEyebrow: {
    color: tokens.color.brandStrong,
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.35,
  },
  guestTitle: {
    color: tokens.color.cocoa,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
  },
  guestCopy: { color: tokens.color.muted, fontSize: 13, lineHeight: 19 },
  guestActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  guestPrimaryAction: { flex: 1 },
  guestOutlineAction: {
    flex: 1,
    borderColor: "rgba(255,255,255,0.78)",
    backgroundColor: tokens.color.brandStrong,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 20,
    backgroundColor: tokens.color.accentLight,
  },
  deviceCardIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  deviceCardCopy: { flex: 1, gap: 2 },
  deviceCardTitle: { color: tokens.color.ink, fontSize: 14, fontWeight: "900" },
  deviceCardText: {
    color: tokens.color.accentStrong,
    fontSize: 11.5,
    lineHeight: 17,
  },
  memberHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.card,
  },
  avatarPressable: { position: "relative", borderRadius: 26 },
  editBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: tokens.color.brandLight,
  },
  memberHeroCopy: { flex: 1, minWidth: 0, gap: 3 },
  memberName: {
    color: tokens.color.cocoa,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  memberEmail: { color: tokens.color.muted, fontSize: 12.5 },
  securePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  securePillText: {
    color: tokens.color.brandStrong,
    fontSize: 10.5,
    fontWeight: "800",
  },
  shortcutRail: {
    flexDirection: "row",
    gap: 9,
    paddingVertical: 2,
  },
  shortcut: {
    flex: 1,
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    paddingVertical: 18,
    paddingHorizontal: 5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    ...tokens.shadow.card,
  },
  shortcutIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: tokens.color.brandLight,
  },
  shortcutLabel: { color: tokens.color.ink, fontSize: 12, fontWeight: "900" },
  shortcutValue: {
    color: tokens.color.muted,
    fontSize: 9.5,
    fontWeight: "700",
  },
  clubPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 15,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: tokens.color.borderStrong,
    backgroundColor: tokens.color.brandLight,
  },
  clubPreviewIcon: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  clubPreviewCopy: { flex: 1, minWidth: 0, gap: 2 },
  clubPreviewTitle: {
    color: tokens.color.cocoa,
    fontSize: 14,
    fontWeight: "900",
  },
  clubPreviewText: {
    color: tokens.color.brandStrong,
    fontSize: 11.5,
    lineHeight: 16,
  },
  clubStatus: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: tokens.color.surface,
  },
  clubStatusText: {
    color: tokens.color.brandStrong,
    fontSize: 9.5,
    fontWeight: "900",
  },
  profileDetails: {
    gap: 12,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  profileDetailsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileDetailsIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: tokens.color.accentLight,
  },
  profileDetailsTitle: {
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  profileDetailsCopy: { color: tokens.color.muted, fontSize: 11 },
  profileDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingTop: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border,
  },
  profileDetailLabel: {
    color: tokens.color.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  profileDetailValue: {
    flex: 1,
    color: tokens.color.ink,
    fontSize: 12,
    textAlign: "right",
  },
  avatarPanel: {
    gap: 13,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  avatarPanelHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarPanelTitle: {
    color: tokens.color.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  avatarPanelCopy: {
    color: tokens.color.muted,
    fontSize: 11.5,
    lineHeight: 16,
  },
  photoButton: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: tokens.color.cocoa,
  },
  photoButtonText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
  avatarChoices: { flexDirection: "row", gap: 9 },
  avatarChoice: {
    width: 47,
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarChoiceSelected: { borderColor: tokens.color.brandStrong },
  accountList: {
    overflow: "hidden",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  accountRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  accountRowIcon: {
    width: 41,
    height: 41,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: tokens.color.surfaceTint,
  },
  accountRowCopy: { flex: 1, minWidth: 0, gap: 2 },
  accountRowTitle: {
    color: tokens.color.ink,
    fontSize: 13.5,
    fontWeight: "900",
  },
  accountRowDetail: {
    color: tokens.color.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceTile: {
    width: "48.5%",
    minHeight: 130,
    gap: 6,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  serviceIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: tokens.color.violetLight,
  },
  serviceTitle: { color: tokens.color.ink, fontSize: 12.5, fontWeight: "900" },
  serviceDetail: { color: tokens.color.muted, fontSize: 10.5, lineHeight: 15 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
