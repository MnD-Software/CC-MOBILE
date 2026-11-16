/**
 * Layout and colour rules for the "Real cake" stage: the chosen product's own
 * photograph with the customer's additions composited on top. Everything here
 * is pure so the placement and contrast rules can be tested without a device.
 */

export type Point = { x: number; y: number };
export type Placement = { plaque: Point; topper: Point };

/** Studio photos show the cake on a stand, left of centre; tuned to that set. */
export const DEFAULT_PLACEMENT: Placement = {
  plaque: { x: 0.42, y: 0.6 },
  topper: { x: 0.42, y: 0.25 },
};

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string) {
  const value = HEX.test(hex) ? hex.slice(1) : "EC008C";
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mix(hex: string, target: string, amount: number) {
  const a = channels(hex),
    b = channels(target);
  return (
    "#" +
    a
      .map((c, i) =>
        Math.round((c + (b[i] - c) * amount) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

/**
 * Light icing is piped on a dark chocolate plaque and dark icing on a white
 * chocolate plaque, so the message always stays readable.
 */
export function plaqueStyle(colour: string) {
  const ink = HEX.test(colour) ? colour.toUpperCase() : "#EC008C";
  const dark = luminance(ink) > 0.42;
  return {
    ink,
    inkShade: dark ? mix(ink, "#000000", 0.45) : mix(ink, "#000000", 0.35),
    surface: dark
      ? (["#8A5640", "#5E3425", "#3D2017"] as const)
      : (["#FFFDF7", "#F5E8D0", "#E4CFA9"] as const),
    rim: dark ? "rgba(255,226,200,0.32)" : "rgba(160,120,70,0.35)",
  };
}

/** Candle stripes use the chosen colour unless it would vanish against white. */
export function candleStripe(colour: string) {
  const ink = HEX.test(colour) ? colour.toUpperCase() : "#EC008C";
  return luminance(ink) > 0.8 ? "#EC008C" : ink;
}

/** Shrinks long messages so they stay on one or two piped lines. */
export function pipingSize(message: string, plaqueWidth: number) {
  const length = Math.max(1, message.trim().length);
  // Two lines need slack because words, not characters, decide the break.
  const perLine = length > 11 ? Math.ceil(length / 2) + 2 : length;
  // Script faces run ~0.72em per character; 82% of the plaque is usable.
  const size = (plaqueWidth * 0.82) / (Math.max(perLine, 6) * 0.72);
  return Math.max(8, Math.min(size, plaqueWidth * 0.13));
}

export function clampPoint(point: Point): Point {
  const clamp = (v: number) =>
    Number.isFinite(v) ? Math.min(0.94, Math.max(0.06, v)) : 0.5;
  return { x: clamp(point.x), y: clamp(point.y) };
}

/**
 * The photo is shown as a square print sized to the stage. A wide, short
 * stage slightly over-fills the height so the cake (the middle 90% of the
 * studio shot) stays visible; blurred copies of the photo fill the sides.
 */
export function printFrame(width: number, height: number) {
  const size = Math.max(1, Math.round(Math.min(width, height * 1.12)));
  return {
    size,
    left: Math.round((width - size) / 2),
    top: Math.round((height - size) / 2),
  };
}

/** Keeps a zoomed print covering the stage instead of exposing its edges. */
export function clampPan(offset: number, scale: number, size: number) {
  const limit = Math.max(0, ((scale - 1) * size) / 2);
  return Math.min(limit, Math.max(-limit, offset));
}

/** Deterministic sprinkles across the top surface of the cake (an ellipse). */
export function sprinkleField(count = 42) {
  const colours = [
    "#EC008C",
    "#FFD34D",
    "#51C4DC",
    "#7BD389",
    "#FFFFFF",
    "#B47AE0",
    "#FF8A3D",
  ];
  return Array.from({ length: count }, (_, index) => {
    // Golden-angle spiral gives an even, natural-looking scatter.
    const angle = index * 2.39996;
    const radius = Math.sqrt((index + 0.5) / count);
    return {
      index,
      x: Math.cos(angle) * radius * 0.15,
      y: Math.sin(angle) * radius * 0.042,
      rotate: (index * 47) % 180,
      colour: colours[index % colours.length],
      delay: (index % 14) * 28,
    };
  });
}

/** Longer messages get a wider plaque, within what fits on the cake. */
export function plaqueWidth(message: string, printSize: number) {
  const length = message.trim().length;
  return Math.max(72, Math.min(printSize * 0.52, printSize * (0.3 + 0.008 * length)));
}

/**
 * Accepts placement from storage or an order snapshot. Anything malformed
 * falls back to the default spot rather than throwing.
 */
export function parsePlacement(value: unknown): Placement {
  const point = (candidate: unknown, fallback: Point): Point => {
    const p = candidate as { x?: unknown; y?: unknown } | null;
    return p && typeof p.x === "number" && typeof p.y === "number"
      ? clampPoint({ x: p.x, y: p.y })
      : fallback;
  };
  const v = (value && typeof value === "object" ? value : {}) as {
    plaque?: unknown;
    topper?: unknown;
  };
  return {
    plaque: point(v.plaque, DEFAULT_PLACEMENT.plaque),
    topper: point(v.topper, DEFAULT_PLACEMENT.topper),
  };
}

/** Rounded to 3 places so orders and saved designs stay compact and stable. */
export function placementPayload(placement: Placement) {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    plaque: { x: r(placement.plaque.x), y: r(placement.plaque.y) },
    topper: { x: r(placement.topper.x), y: r(placement.topper.y) },
  };
}
