/**
 * Shared visual primitives for the native Cake City experience.
 *
 * Design language: "Aurora Candy Glass" — a vivid magenta/violet/cyan spectrum
 * poured over frosted-glass surfaces. Screens and reusable components should
 * consume these semantic values instead of introducing one-off colours,
 * spacing, or elevation rules.
 */
export const tokens = {
  color: {
    // Canvas & surfaces — cool violet-tinted whites that float over the aurora backdrop
    background: '#FFF8FB',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceTint: '#FFF0F5',
    white: '#FFFFFF',

    // Text — deep violet ink family
    ink: '#25171D',
    cocoa: '#542B38',
    muted: '#79666D',
    mutedSoft: '#A18F96',

    // Lines
    border: '#F1DFE7',
    borderStrong: '#E8C6D4',

    // Brand — electric magenta
    brand: '#F70B72',
    brandStrong: '#D90C61',
    brandPressed: '#B50850',
    brandDark: '#89063D',
    brandLight: '#FFE3EE',

    // Supporting spectrum
    violet: '#8B4562',
    violetStrong: '#6F304A',
    violetLight: '#F5E8ED',
    accent: '#3D8B7D',
    accentStrong: '#236B60',
    accentLight: '#E3F3EF',
    sunshine: '#E8A323',
    sunshineStrong: '#A96B00',
    sunshineLight: '#FFF3D7',

    // Feedback
    success: '#0FA36B',
    successLight: '#DCF7EA',
    warning: '#B26A00',
    warningLight: '#FFF1D6',
    error: '#E5484D',
    errorLight: '#FFE5E5',
  },
  /**
   * Signature colour sequences for native paint surfaces.
   * Colours are listed in paint order (start → end).
   */
  gradient: {
    /** Hero / feature banners: magenta → violet → indigo */
    hero: ['#7D1238', '#C90859', '#F02A79'],
    /** Primary actions: hot magenta → electric purple */
    primary: ['#F70B72', '#C90859'],
    /** Cool counterpoint: cyan → periwinkle */
    cool: ['#3D8B7D', '#70B8A8'],
    /** Rewards & gold moments */
    gold: ['#FFC53D', '#FF8A00'],
    /** Full-screen aurora canvas behind glass surfaces */
    aurora: ['#FFFDFE', '#FFF6FA', '#FFF9F3'],
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
      shadowColor: '#5D263C',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 3,
    },
    floating: {
      shadowColor: '#5D263C',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.18,
      shadowRadius: 22,
      elevation: 8,
    },
    /** Neon glow used by the futuristic tab bar and hero actions */
    glow: {
      shadowColor: '#D90C61',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.42,
      shadowRadius: 16,
      elevation: 8,
    },
  },
} as const;

export type ThemeTokens = typeof tokens;
