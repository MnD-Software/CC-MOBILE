import { validatedPreferences } from "./preference-validation";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { appendBagBundle } from "./bag-bundle";
import {
  bagLineSchema,
  lineKey,
  settleBag,
  type BagLine,
  type Branch,
  type CheckoutInput,
} from "./contracts";
type Design = {
  id: string;
  name: string;
  version: string;
  selections: Record<string, string[]>;
  message: string;
  updated_at: string;
};
/** Stable empty list so selectors never return a fresh array per render. */
const EMPTY: string[] = [];
/**
 * The signed-in account that device-local shopping state belongs to. Set by
 * the auth provider before a session becomes visible, and checked when the
 * persisted bag finishes hydrating so a late read cannot resurrect another
 * account's bag.
 */
let activeOwner: string | null = null;
type BagState = {
  /** Account the bag belongs to; a bag is never shown to a different owner. */
  owner: string | null;
  lines: BagLine[];
  settled: string[];
  settle: (id: string, items: CheckoutInput["items"]) => Promise<void>;
  add: (line: BagLine) => void;
  addBundle: (lines: BagLine[]) => boolean;
  quantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};
export const useBag = create<BagState>()(
  persist(
    (set) => ({
      owner: null,
      lines: [],
      settled: [],
      addBundle: (lines) => {
        let added = false;
        set((state) => {
          const next = appendBagBundle(state.lines, lines);
          added = next !== null;
          return next ? { lines: next } : state;
        });
        return added;
      },
      settle: async (id, items) => {
        await set((s) => settleBag(s.lines, s.settled, id, items));
      },
      add: (line) =>
        set((state) => {
          const key = lineKey(line.slug, line.selection);
          const existing = state.lines.find((l) => l.key === key);
          return {
            lines: existing
              ? state.lines.map((l) =>
                  l.key === key
                    ? {
                        ...line,
                        key,
                        quantity: Math.min(20, l.quantity + line.quantity),
                      }
                    : l,
                )
              : [...state.lines, { ...line, key }].slice(0, 30),
          };
        }),
      quantity: (key, quantity) =>
        set((s) => ({
          lines: s.lines.flatMap((l) =>
            l.key === key
              ? quantity > 0
                ? [{ ...l, quantity: Math.min(20, quantity) }]
                : []
              : [l],
          ),
        })),
      remove: (key) =>
        set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    {
      // v3 deliberately starts with a clean bag so legacy reference products
      // cannot survive into the server-authoritative catalogue experience.
      name: "cakecity.bag.v3",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        owner: s.owner,
        lines: s.lines,
        settled: s.settled,
      }),
      merge: (saved, current) => {
        const result = z
          .object({
            // Bags written before ownership was recorded have no owner and
            // are dropped on the next sign-in rather than adopted.
            owner: z.string().nullable().default(null),
            lines: bagLineSchema.array().max(30),
            settled: z.array(z.string()).max(100).default([]),
          })
          .safeParse(saved);
        const data = result.success
          ? result.data
          : { owner: null, lines: [], settled: [] };
        return {
          ...current,
          ...(activeOwner !== null && data.owner !== activeOwner
            ? { owner: activeOwner, lines: [], settled: [] }
            : data),
        };
      },
    },
  ),
);
type Preferences = {
  /** Signed-in account the owner-keyed lists below are read for (not persisted). */
  owner: string | null;
  /** Device-local saves per account; product records are revalidated before display. */
  savedSlugsByOwner: Record<string, string[]>;
  /** Saves for the current account; a no-op while signed out. */
  toggleSavedProduct: (slug: string) => void;
  profileAvatars: Record<string, { kind: "photo" | "preset"; value: string }>;
  setProfileAvatar: (
    owner: string,
    avatar: { kind: "photo" | "preset"; value: string },
  ) => void;
  branch: Branch | null;
  recentSearchesByOwner: Record<string, string[]>;
  /** Recently viewed products are account-scoped; guests are not profiled. */
  recentSlugsByOwner: Record<string, string[]>;
  designs: Record<string, Design[]>;
  setBranch: (branch: Branch) => void;
  /** Remembers a search for the current account; a no-op while signed out. */
  search: (term: string) => void;
  view: (owner: string | null | undefined, slug: string) => void;
  saveDesign: (owner: string, design: Design) => void;
  deleteDesign: (owner: string, id: string) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      owner: null,
      savedSlugsByOwner: {},
      toggleSavedProduct: (slug) =>
        set((state) => {
          if (!state.owner) return state;
          const saved = state.savedSlugsByOwner?.[state.owner] ?? [];
          return {
            savedSlugsByOwner: {
              ...(state.savedSlugsByOwner ?? {}),
              [state.owner]: saved.includes(slug)
                ? saved.filter((value) => value !== slug)
                : [...saved, slug].slice(0, 30),
            },
          };
        }),
      profileAvatars: {},
      setProfileAvatar: (owner, avatar) =>
        set((state) => ({
          profileAvatars: {
            ...(state.profileAvatars ?? {}),
            [owner]: avatar,
          },
        })),
      branch: null,
      recentSearchesByOwner: {},
      recentSlugsByOwner: {},
      designs: {},
      setBranch: (branch) => set({ branch }),
      search: (term) =>
        set((s) => {
          if (!s.owner) return s;
          return {
            recentSearchesByOwner: {
              ...(s.recentSearchesByOwner ?? {}),
              [s.owner]: [
                term,
                ...(s.recentSearchesByOwner?.[s.owner] ?? []).filter(
                  (v) => v !== term,
                ),
              ].slice(0, 8),
            },
          };
        }),
      view: (owner, slug) => {
        const key = owner?.trim();
        if (!key) return;
        set((s) => ({
          recentSlugsByOwner: {
            ...(s.recentSlugsByOwner ?? {}),
            [key]: [
              slug,
              ...(s.recentSlugsByOwner?.[key] ?? []).filter(
                (value) => value !== slug,
              ),
            ].slice(0, 12),
          },
        }));
      },
      saveDesign: (owner, design) =>
        set((s) => ({
          designs: {
            ...s.designs,
            [owner]: [
              design,
              ...(s.designs[owner] ?? []).filter((d) => d.id !== design.id),
            ].slice(0, 20),
          },
        })),
      deleteDesign: (owner, id) =>
        set((s) => ({
          designs: {
            ...s.designs,
            [owner]: (s.designs[owner] ?? []).filter((d) => d.id !== id),
          },
        })),
    }),
    {
      // v3 drops the old negative-ID reference favourites rather than letting
      // presentation-only catalogue data appear as customer content.
      name: "cakecity.preferences.v3",
      merge: (saved, current) => ({
        ...current,
        ...validatedPreferences(saved),
      }),
      version: 2,
      migrate: (saved, version) => {
        // v2: favourites and searches used to be device-global. Their owner is
        // unknown, so drop them instead of handing them to the next sign-in.
        const {
          savedProductSlugs: _saved,
          recentSearches: _searches,
          ...rest
        } = (saved ?? {}) as Record<string, unknown>;
        // v1: discard history recorded by background detail screens.
        return version < 1 ? { ...rest, recentSlugsByOwner: {} } : rest;
      },
      partialize: ({ owner: _owner, ...persisted }) => persisted,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
export const selectSavedSlugs = (s: Preferences) =>
  (s.owner && s.savedSlugsByOwner?.[s.owner]) || EMPTY;
export const selectRecentSearches = (s: Preferences) =>
  (s.owner && s.recentSearchesByOwner?.[s.owner]) || EMPTY;
/** Binds device-local bag and preferences to a signed-in account. */
export function claimDeviceState(owner: string) {
  activeOwner = owner;
  if (useBag.getState().owner !== owner)
    useBag.setState({ owner, lines: [], settled: [] });
  if (usePreferences.getState().owner !== owner)
    usePreferences.setState({ owner });
}
/** Clears the signed-out account's bag; saved lists stay keyed by owner. */
export function releaseDeviceState() {
  activeOwner = null;
  useBag.setState({ owner: null, lines: [], settled: [] });
  usePreferences.setState({ owner: null });
}
