/**
 * Shared visual primitives for the native Cake City experience.
 *
 * Design language: glossy warm-white surfaces with Cake City pink, blue and
 * cocoa used as deliberate, high-contrast accents. Screens and reusable
 * components should consume these semantic values instead of introducing
 * one-off colours, spacing, or elevation rules.
 */
export const tokens = {
  color: {
    // Canvas & surfaces
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceTint: "#FFEAF4",
    glass: "rgba(255, 255, 255, 0.82)",
    glassStrong: "rgba(255, 255, 255, 0.94)",
    white: "#FFFFFF",

    // Text
    ink: "#21131B",
    cocoa: "#49302E",
    muted: "#62515C",
    mutedSoft: "#715F6A",

    // Lines
    border: "#DCC8D2",
    borderStrong: "#B888A1",

    // Brand
    brand: "#EC008C",
    brandStrong: "#B80068",
    brandPressed: "#930052",
    brandDark: "#51382D",
    brandLight: "#FFF0F8",

    // Supporting accents are used sparingly so the catalogue remains pink-led.
    violet: "#8A5B72",
    violetStrong: "#684054",
    violetLight: "#F6EDF2",
    accent: "#00AEEF",
    accentStrong: "#006E95",
    accentLight: "#EAF8FE",
    sunshine: "#E8A323",
    sunshineStrong: "#A96B00",
    sunshineLight: "#FFF3D7",

    // Feedback
    success: "#087A4C",
    successLight: "#DCF7EA",
    warning: "#8C5300",
    warningLight: "#FFF1D6",
    error: "#BC2939",
    errorLight: "#FFE5E5",
  },
  /**
   * Signature colour sequences for native paint surfaces.
   * Colours are listed in paint order (start → end).
   */
  gradient: {
    /** Hero / feature banners: cocoa → Cake City pink */
    hero: ["#51382D", "#B80068", "#EC008C"],
    /** Primary actions: Cake City pink → a rich accessible pink */
    primary: ["#C90077", "#B80068"],
    /** Cool counterpoint, used only for supporting information */
    cool: ["#00AEEF", "#00749E"],
    /** Rewards & gold moments */
    gold: ["#FFC53D", "#FF8A00"],
    /** Full-screen aurora canvas behind glass surfaces */
    aurora: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
  } as const,
  space: {
    none: 0,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 18,
    xl: 24,
    pill: 9999,
  },
  shadow: {
    card: {
      shadowColor: "#51382D",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 3,
    },
    floating: {
      shadowColor: "#51382D",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 22,
      elevation: 8,
    },
    /** Reserved for a single focused brand action, never a full screen. */
    glow: {
      shadowColor: "#EC008C",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.24,
      shadowRadius: 16,
      elevation: 8,
    },
  },
} as const;

export type ThemeTokens = typeof tokens;
