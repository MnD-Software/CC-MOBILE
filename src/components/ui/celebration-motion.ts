export const CELEBRATION_DURATION = 9000;

/** Foil shapes. Ribbons and streamers flutter; squares and coins tumble. */
export type ConfettiKind = "ribbon" | "square" | "coin" | "streamer";

const PALETTE = [
  "#EC008C",
  "#F4C95D",
  "#FFF1C2",
  "#51C4DC",
  "#F58FC5",
  "#BE87C5",
  "#A7E2B8",
  "#FF6FB5",
] as const;

const KINDS: ConfettiKind[] = [
  "ribbon",
  "square",
  "ribbon",
  "coin",
  "ribbon",
  "square",
  "streamer",
];

/** Large, glossy foil pieces in one simultaneous burst (owner-approved timing). */
export function celebrationPieces(compact = false) {
  const count = compact ? 96 : 320;
  return Array.from({ length: count }, (_, index) => {
    const kind = KINDS[index % KINDS.length];
    const scale = compact ? 0.72 : 1;
    // Deterministic pseudo-random spread keeps tests and renders stable.
    const jitter = ((index * 37) % 23) / 22;
    const size =
      kind === "ribbon"
        ? { width: 13 + jitter * 7, height: 30 + jitter * 16 }
        : kind === "streamer"
          ? { width: 8 + jitter * 3, height: 58 + jitter * 26 }
          : kind === "coin"
            ? { width: 16 + jitter * 6, height: 16 + jitter * 6 }
            : { width: 17 + jitter * 7, height: 17 + jitter * 7 };
    return {
      index,
      kind,
      // Every fourth piece showers from the top; the rest leave two cannons.
      origin: index % 4 === 0 ? ("top" as const) : ("cannon" as const),
      side: index % 2,
      burst: 0,
      delay: (index % 7) * 0.004,
      energy: 0.6 + ((index * 17) % 36) / 100,
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      flips: 2 + (index % 4),
      color: PALETTE[index % PALETTE.length],
    };
  });
}

export function gracefulFall(t: number, rise: number, height: number) {
  if (t <= 0.28) return -rise * (1 - (1 - t / 0.28) ** 3);
  return -rise + (height + rise) * ((t - 0.28) / 0.72) ** 1.4;
}
