import { useEffect, useRef, useState } from "react";
import { Switch, View } from "react-native";
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import { Text } from "@/components/ui/Typography";
import { ThemeScope, useTheme } from "@/theme/ThemeProvider";
import { useMemo, type PropsWithChildren } from "react";
import { clubApi } from "./club-api";
import { membershipSurface, membershipPagePalette } from "./member-card";
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
  const { colors } = useTheme();
  const { enabled, setEnabled, error } = useClubAppearance();
  const pages = useCardPages();
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
      {error || pages.error ? (
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
  const tier = query.data?.tier;
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
  const tier = query.data?.tier;
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
  return enabled && query.data && !highContrast
    ? membershipSurface(query.data.tier, colors.background)
    : colors.background;
}
