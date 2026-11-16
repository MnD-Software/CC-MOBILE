import { useEffect, useState } from "react";
import { Dimensions, PixelRatio, Platform } from "react-native";

/**
 * "full" runs every effect. "lite" keeps the same look with cheaper
 * techniques (gradients instead of live blur, fewer particles, a lower
 * WebGL resolution) so older or budget phones stay smooth.
 */
export type DeviceTier = "full" | "lite";

type Signals = {
  os: string;
  version: number | string;
  pixelRatio: number;
  width: number;
  height: number;
  cores?: number;
  memoryGb?: number;
};

/** First guess from what every phone exposes, before any measurement. */
export function guessTier(s: Signals): DeviceTier {
  if (s.os === "android") {
    const api = typeof s.version === "number" ? s.version : Number(s.version);
    // Android 9 and older, or small low-density screens, are budget class.
    if (!Number.isFinite(api) || api < 29) return "lite";
    if (s.pixelRatio < 2 && Math.min(s.width, s.height) < 400) return "lite";
    return "full";
  }
  if (s.os === "ios") {
    const major = parseInt(String(s.version), 10);
    return Number.isFinite(major) && major < 15 ? "lite" : "full";
  }
  if ((s.cores && s.cores <= 2) || (s.memoryGb && s.memoryGb <= 2))
    return "lite";
  return "full";
}

/** Average frame rate over a short sample; below 45 fps means "lite". */
export function tierFromFrames(intervals: number[]): DeviceTier | null {
  const usable = intervals.filter((ms) => ms > 0 && ms < 1000);
  if (usable.length < 20) return null;
  const sorted = [...usable].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return 1000 / median < 45 ? "lite" : "full";
}

function signals(): Signals {
  const { width, height } = Dimensions.get("window");
  const nav =
    typeof navigator === "object"
      ? (navigator as { hardwareConcurrency?: number; deviceMemory?: number })
      : {};
  return {
    os: Platform.OS,
    version: Platform.Version,
    pixelRatio: PixelRatio.get(),
    width,
    height,
    cores: Platform.OS === "web" ? nav.hardwareConcurrency : undefined,
    memoryGb: Platform.OS === "web" ? nav.deviceMemory : undefined,
  };
}

function initialTier(): DeviceTier {
  try {
    return guessTier(signals());
  } catch {
    return "full";
  }
}

let current: DeviceTier = initialTier();
let probed = false;
const listeners = new Set<(tier: DeviceTier) => void>();

/** Samples one second of frames once per app run; only ever downgrades. */
function probe() {
  if (probed || current === "lite" || typeof requestAnimationFrame !== "function")
    return;
  probed = true;
  const intervals: number[] = [];
  let last = 0;
  const started = Date.now();
  const step = (now: number) => {
    if (last) intervals.push(now - last);
    last = now;
    if (Date.now() - started < 1200) {
      requestAnimationFrame(step);
      return;
    }
    if (tierFromFrames(intervals) === "lite") {
      current = "lite";
      listeners.forEach((listener) => listener(current));
    }
  };
  // Let the screen's own mount work finish before measuring.
  setTimeout(() => requestAnimationFrame(step), 1500);
}

export function deviceTier() {
  return current;
}

export function useDeviceTier() {
  const [tier, setTier] = useState(current);
  useEffect(() => {
    listeners.add(setTier);
    probe();
    setTier(current);
    return () => {
      listeners.delete(setTier);
    };
  }, []);
  return tier;
}
