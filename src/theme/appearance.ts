import { tokens } from "./tokens";

export type AppearancePreference = "system" | "light" | "dark";
export type ThemeColors = { [Key in keyof typeof tokens.color]: string };

export const APPEARANCE_STORAGE_KEY = "cakecity.appearance.v1";

export function parseAppearance(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveAppearance(
  preference: AppearancePreference,
  system: string | null | undefined,
): "light" | "dark" {
  return preference === "system"
    ? system === "dark"
      ? "dark"
      : "light"
    : preference;
}

export const darkColors: ThemeColors = {
  ...tokens.color,
  background: "#141016",
  surface: "#211B24",
  surfaceRaised: "#2C2430",
  surfaceTint: "#30202B",
  glass: "rgba(33,27,36,0.84)",
  glassStrong: "rgba(33,27,36,0.96)",
  ink: "#FFF5FB",
  cocoa: "#EED5DE",
  muted: "#D7C2CF",
  mutedSoft: "#C4AABA",
  border: "#695463",
  borderStrong: "#A87996",
  brand: "#EC008C",
  brandStrong: "#FF8BCB",
  brandLight: "#3A2031",
  violet: "#D7ABCB",
  violetStrong: "#E6B7D5",
  violetLight: "#312435",
  accent: "#66D7FF",
  accentStrong: "#87DBFF",
  accentLight: "#152D38",
  sunshine: "#F5C660",
  sunshineStrong: "#FFD580",
  sunshineLight: "#352B18",
  success: "#6BE0AA",
  successLight: "#17372C",
  warning: "#FFD081",
  warningLight: "#382C1C",
  error: "#FF9A9F",
  errorLight: "#3E222B",
};

const foreground = new Map<string, string>(
  Object.entries(tokens.color)
    .filter(
      ([key]) =>
        ![
          "white",
          "surface",
          "surfaceRaised",
          "background",
          "brandDark",
        ].includes(key),
    )
    .map(([key, value]) => [
      value.toUpperCase(),
      darkColors[key as keyof ThemeColors],
    ]),
);
// Cocoa is a foreground only here: cocoa hero backgrounds must remain cocoa.
foreground.set(tokens.color.cocoa, darkColors.cocoa);
// Older screen styles still use these original neutral values.
foreground.set("#251914", darkColors.ink);
foreground.set("#51382D", darkColors.cocoa);
foreground.set("#766C69", darkColors.muted);
foreground.set("#A09490", darkColors.mutedSoft);
foreground.set("#90252A", darkColors.error);

const surfaces = new Map<string, string>([
  [tokens.color.background, darkColors.background],
  [tokens.color.surface, darkColors.surface],
  [tokens.color.surfaceTint, darkColors.surfaceTint],
  [tokens.color.brandLight, darkColors.brandLight],
  [tokens.color.accentLight, darkColors.accentLight],
  [tokens.color.violetLight, darkColors.violetLight],
  [tokens.color.sunshineLight, darkColors.sunshineLight],
  [tokens.color.errorLight, darkColors.errorLight],
  [tokens.color.successLight, darkColors.successLight],
  [tokens.color.warningLight, darkColors.warningLight],
  [tokens.color.border, darkColors.border],
]);

function paleHex(value: string) {
  const match = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(value);
  if (!match) return false;
  return [0, 2, 4].every(
    (index) => parseInt(match[1].slice(index, index + 2), 16) >= 210,
  );
}

/** Migrate neutral UI paint, never photos, opacity or brand-filled backgrounds.
 * White text stays white for artwork overlays and solid brand buttons.
 * Explicit photo canvases should override backgroundColor after mapped styles.
 */
export function themeColor(
  property: string,
  value: string,
  isDark: boolean,
): string {
  if (!isDark) return value;
  const normalized = value.toUpperCase();
  if (
    property === "color" ||
    property === "tintColor" ||
    property === "placeholderTextColor"
  ) {
    return foreground.get(normalized) ?? value;
  }
  if (/^border.*Color$/.test(property)) {
    if (normalized === tokens.color.borderStrong)
      return darkColors.borderStrong;
    if (paleHex(value) || /^rgba?\(\s*(255|81)[,\s]/i.test(value))
      return darkColors.border;
    return value;
  }
  if (property === "backgroundColor") {
    if (surfaces.has(normalized)) return surfaces.get(normalized)!;
    if (normalized === "WHITE" || normalized === "#FFF" || paleHex(value))
      return darkColors.surface;
    // Preserve translucency while adapting the neutral glass wash.
    const paleAlpha =
      /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(
        value,
      );
    if (
      paleAlpha &&
      paleAlpha.slice(1, 4).every((channel) => Number(channel) >= 210)
    )
      return `rgba(33,27,36,${paleAlpha[4]})`;
  }
  return value;
}

export function themedStyleMap<T extends Record<string, object>>(
  base: T,
  isDark: boolean,
): T {
  if (!isDark) return base;
  return Object.fromEntries(
    Object.entries(base).map(([name, style]) => [
      name,
      Object.fromEntries(
        Object.entries(style).map(([property, value]) => [
          property,
          typeof value === "string" ? themeColor(property, value, true) : value,
        ]),
      ),
    ]),
  ) as T;
}
