import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import { Text } from "@/components/ui/Typography";
import { ThemeScope, useTheme } from "@/theme/ThemeProvider";
import { useMemo, type PropsWithChildren } from "react";
import { clubApi } from "./club-api";
import {
  membershipSurface,
  membershipPagePalette,
  membershipPalette,
} from "./member-card";
import {
  cardColours,
  cardColourTier,
  hasFinalCard,
  parseCardColour,
  type CardColour,
} from "./card-colour";
import { usePathname } from "expo-router";
import {
  cardPages,
  cardPageForPath,
  parseCardPages,
  type CardPage,
} from "./card-pages";

const pageChoices = create<{
  values: Record<string, Partial<Record<CardPage, boolean>>>;
}>(() => ({ values: {} }));
function useCardPages() {
  const { customer } = useAuth();
  const owner = customer?.id || "guest";
  const values = pageChoices((s) => s.values[owner]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    if (owner !== "guest" && pageChoices.getState().values[owner] === undefined)
      void getStorageItem(`cakecity.card-pages.v1.${owner}`)
        .then((value) => {
          if (active && pageChoices.getState().values[owner] === undefined)
            pageChoices.setState((s) => ({
              values: { ...s.values, [owner]: parseCardPages(value) },
            }));
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [owner]);
  function change(page: CardPage, enabled: boolean) {
    const next = { ...pageChoices.getState().values[owner], [page]: enabled };
    pageChoices.setState((s) => ({ values: { ...s.values, [owner]: next } }));
    const key = `pages:${owner}`;
    const write = (writes.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(() =>
        setStorageItem(`cakecity.card-pages.v1.${owner}`, JSON.stringify(next)),
      );
    writes.set(key, write);
    void write.then(() => setError(false)).catch(() => setError(true));
  }
  return { values, change, error };
}

const choices = create<{ values: Record<string, boolean> }>(() => ({
  values: {},
}));
const writes = new Map<string, Promise<void>>();
const colourChoices = create<{ values: Record<string, CardColour | null> }>(
  () => ({ values: {} }),
);
export function useCardColour(tier?: string) {
  const { customer } = useAuth();
  const owner = customer?.id || "guest";
  const choice = colourChoices((state) => state.values[owner]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    if (
      owner !== "guest" &&
      colourChoices.getState().values[owner] === undefined
    )
      void getStorageItem(`cakecity.card-colour.v1.${owner}`)
        .then((value) => {
          if (active && colourChoices.getState().values[owner] === undefined)
            colourChoices.setState((state) => ({
              values: {
                ...state.values,
                [owner]: parseCardColour(value) || null,
              },
            }));
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [owner]);
  const canChoose = owner !== "guest" && hasFinalCard(tier);
  const choose = (value: CardColour) => {
    if (!canChoose || !parseCardColour(value)) return;
    colourChoices.setState((state) => ({
      values: { ...state.values, [owner]: value },
    }));
    const key = `colour:${owner}`;
    const write = (writes.get(key) || Promise.resolve())
      .catch(() => {})
      .then(() => setStorageItem(`cakecity.card-colour.v1.${owner}`, value));
    writes.set(key, write);
    void write.then(() => setError(false)).catch(() => setError(true));
  };
  return { tier: cardColourTier(tier, choice), canChoose, choose, error };
}
export function useClubAppearance() {
  const { customer } = useAuth();
  const owner = customer?.id ? String(customer.id) : "guest";
  const enabled = choices((s) => s.values[owner] ?? owner !== "guest");
  const [error, setError] = useState(false);
  const interacted = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(false);
    if (owner !== "guest" && choices.getState().values[owner] === undefined)
      void getStorageItem(`cakecity.club-colour.v1.${owner}`)
        .then((value) => {
          if (
            alive &&
            interacted.current !== owner &&
            choices.getState().values[owner] === undefined
          )
            choices.setState((s) => ({
              values: { ...s.values, [owner]: value !== "0" },
            }));
        })
        .catch(() => {
          if (alive) setError(true);
        });
    return () => {
      alive = false;
    };
  }, [owner]);
  const setEnabled = (value: boolean) => {
    interacted.current = owner;
    choices.setState((s) => ({ values: { ...s.values, [owner]: value } }));
    if (owner === "guest") return;
    const write = (writes.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(() =>
        setStorageItem(`cakecity.club-colour.v1.${owner}`, value ? "1" : "0"),
      );
    writes.set(owner, write);
    void write.then(() => setError(false)).catch(() => setError(true));
  };
  return { enabled, setEnabled, error };
}
export function ClubAppearanceControl() {
  const { customer } = useAuth();
  const { colors } = useTheme();
  const { enabled, setEnabled, error } = useClubAppearance();
  const pages = useCardPages();
  const query = useQuery({
    queryKey: ["club", customer?.id, null],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer,
    staleTime: 60000,
  });
  const colour = useCardColour(query.data?.tier);
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 22,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 6,
      }}
    >
      {colour.canChoose ? (
        <View style={{ gap: 8, paddingBottom: 12 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "800" }}>
            Your card. Your colour.
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            Platinum unlocks all four colours. Choose a look for your card and
            the pages you select below. Your Platinum benefits stay the same.
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Membership colour"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
          >
            {cardColours.map((value) => {
              const palette = membershipPalette(value);
              const selected = colour.tier === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${value} card colour`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => colour.choose(value)}
                  style={{
                    width: "48%",
                    borderRadius: 16,
                    overflow: "hidden",
                    borderWidth: 2,
                    borderColor: selected ? colors.brandStrong : colors.border,
                  }}
                >
                  <LinearGradient
                    colors={palette.gradient}
                    style={{
                      minHeight: 64,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        color: palette.ink,
                        fontSize: 14,
                        fontWeight: "800",
                      }}
                    >
                      {value}
                    </Text>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={palette.ink}
                    />
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 14 }}>
            Match Club to my card
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
            Your entire Club page, dressed in your membership colour.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Match Club page to my membership card"
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.brandStrong }}
        />
      </View>
      <View style={{ gap: 8, paddingTop: 12 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: "700" }}>
          Choose pages for my card colour
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          Choose each page independently. Turning Club off keeps your other
          choices.
        </Text>
        {cardPages.map((page) => (
          <View
            key={page.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              minHeight: 48,
            }}
          >
            <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>
              {page.label}
            </Text>
            <Switch
              accessibilityLabel={`Use my card colour on ${page.label}`}
              value={pages.values?.[page.id] === true}
              onValueChange={(value) => pages.change(page.id, value)}
              trackColor={{ false: colors.border, true: colors.brandStrong }}
            />
          </View>
        ))}
      </View>
      {error || pages.error || colour.error ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Changed for this session. Your preference could not be saved.
        </Text>
      ) : null}
    </View>
  );
}
export function CustomerPageTheme({ children }: PropsWithChildren) {
  const { customer } = useAuth();
  const path = usePathname();
  const page = cardPageForPath(path);
  const pages = useCardPages();
  const parent = useTheme();
  const enabled =
    customer?.role === "customer" && !!page && pages.values?.[page] === true;
  const query = useQuery({
    queryKey: ["club", customer?.id, null],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled,
    staleTime: 60000,
  });
  const { tier } = useCardColour(query.data?.tier);
  const colors = useMemo(
    () =>
      enabled && tier && !parent.highContrast
        ? { ...parent.colors, ...membershipPagePalette(tier, parent.isDark) }
        : undefined,
    [enabled, tier, parent.colors, parent.isDark, parent.highContrast],
  );
  return <ThemeScope colors={colors}>{children}</ThemeScope>;
}
export function ClubPageTheme({ children }: PropsWithChildren) {
  const { customer } = useAuth();
  const { enabled } = useClubAppearance();
  const parent = useTheme();
  const query = useQuery({
    queryKey: ["club", customer?.id, null],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer && enabled,
    staleTime: 60000,
  });
  const { tier } = useCardColour(query.data?.tier);
  const colors = useMemo(
    () =>
      enabled && tier && !parent.highContrast
        ? { ...parent.colors, ...membershipPagePalette(tier, parent.isDark) }
        : undefined,
    [enabled, tier, parent.colors, parent.isDark, parent.highContrast],
  );
  return <ThemeScope colors={colors}>{children}</ThemeScope>;
}
export function useClubPageColour() {
  const { customer } = useAuth();
  const { enabled } = useClubAppearance();
  const { colors, highContrast } = useTheme();
  const query = useQuery({
    queryKey: ["club", customer?.id, null],
    queryFn: ({ signal }) => clubApi.overview(signal),
    enabled: !!customer && enabled,
    staleTime: 60_000,
  });
  const { tier } = useCardColour(query.data?.tier);
  return enabled && tier && !highContrast
    ? membershipSurface(tier, colors.background)
    : colors.background;
}
