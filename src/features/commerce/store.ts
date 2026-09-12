import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
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
type BagState = {
  lines: BagLine[];
  settled: string[];
  settle: (id: string, items: CheckoutInput["items"]) => Promise<void>;
  add: (line: BagLine) => void;
  quantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};
export const useBag = create<BagState>()(
  persist(
    (set) => ({
      lines: [],
      settled: [],
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
      name: "cakecity.bag.v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lines: s.lines, settled: s.settled }),
      merge: (saved, current) => {
        const result = z
          .object({
            lines: bagLineSchema.array().max(30),
            settled: z.array(z.string()).max(100).default([]),
          })
          .safeParse(saved);
        return {
          ...current,
          ...(result.success ? result.data : { lines: [], settled: [] }),
        };
      },
    },
  ),
);
type Preferences = {
  branch: Branch | null;
  recentSearches: string[];
  recentSlugs: string[];
  designs: Record<string, Design[]>;
  setBranch: (branch: Branch) => void;
  search: (term: string) => void;
  view: (slug: string) => void;
  saveDesign: (owner: string, design: Design) => void;
  deleteDesign: (owner: string, id: string) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      branch: null,
      recentSearches: [],
      recentSlugs: [],
      designs: {},
      setBranch: (branch) => set({ branch }),
      search: (term) =>
        set((s) => ({
          recentSearches: [
            term,
            ...s.recentSearches.filter((v) => v !== term),
          ].slice(0, 8),
        })),
      view: (slug) =>
        set((s) => ({
          recentSlugs: [slug, ...s.recentSlugs.filter((v) => v !== slug)].slice(
            0,
            12,
          ),
        })),
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
      name: "cakecity.preferences.v2",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
