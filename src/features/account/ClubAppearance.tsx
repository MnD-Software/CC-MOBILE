import { useEffect, useRef, useState } from "react";
import { Switch, View } from "react-native";
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { getStorageItem, setStorageItem } from "@/auth/secure-storage";
import { Text } from "@/components/ui/Typography";
import { useTheme } from "@/theme/ThemeProvider";
import { clubApi } from "./club-api";
import { membershipSurface } from "./member-card";

const choices = create<{ values: Record<string, boolean> }>(() => ({
  values: {},
}));
const writes = new Map<string, Promise<void>>();
export function useClubAppearance() {
  const { customer } = useAuth();
  const owner = customer?.id ? String(customer.id) : "guest";
  const enabled = choices((s) => s.values[owner] ?? false);
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
              values: { ...s.values, [owner]: value === "1" },
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
            A personal colour wash that follows your membership tier.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Match Club page to my membership card"
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: colors.border, true: colors.brandStrong }}
        />
      </View>
      {error ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Changed for this session. Your preference could not be saved.
        </Text>
      ) : null}
    </View>
  );
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
