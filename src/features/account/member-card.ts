import JsBarcode from "jsbarcode";

const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Public member identifier only; never a payment or redemption credential. */
export function memberBarcode(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error("Invalid member identifier");
  const hex = id.replace(/-/g, "");
  const bytes = Array.from({ length: 16 }, (_, index) =>
    parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index],
      b = bytes[index + 1],
      c = bytes[index + 2];
    encoded += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) encoded += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) encoded += alphabet[c & 63];
  }
  return `CC1:${encoded}`;
}

export function barcodeModules(value: string) {
  const output: { encodings?: { data: string }[] } = {};
  JsBarcode(output, value, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
  });
  return (
    "0000000000" +
    output.encodings!.map((entry) => entry.data).join("") +
    "0000000000"
  );
}

export const membershipPalettes = {
  Bronze: {
    gradient: ["#F5D9BF", "#CE9B71", "#F1D1AF"],
    ink: "#442A1A",
    muted: "#5C3D29",
    accent: "#825331",
  },
  Silver: {
    gradient: ["#F3F5F8", "#BAC3D0", "#E8EDF2"],
    ink: "#263242",
    muted: "#455365",
    accent: "#52657D",
  },
  Gold: {
    gradient: ["#FFF1BC", "#E4BC57", "#F9E6A1"],
    ink: "#49330D",
    muted: "#604B24",
    accent: "#75500F",
  },
  Diamond: {
    gradient: ["#E8FBFF", "#A7D9EF", "#D1E7FF"],
    ink: "#15384D",
    muted: "#31586F",
    accent: "#17698F",
  },
  Platinum: {
    gradient: ["#343D50", "#121A2A", "#59657B"],
    ink: "#FFFFFF",
    muted: "#E0E7F3",
    accent: "#D4E6FF",
  },
} as const;

export function membershipPalette(tier: string) {
  return (
    Object.entries(membershipPalettes).find(
      ([name]) => name.toLowerCase() === tier.toLowerCase(),
    )?.[1] ?? membershipPalettes.Silver
  );
}

export function membershipPagePalette(tier: string, dark: boolean) {
  const palette = membershipPalette(tier);
  const blend = (colour: string, target: string, weight: number) =>
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(colour.slice(i, i + 2), 16) * (1 - weight) +
            parseInt(target.slice(i, i + 2), 16) * weight,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const metallic = palette.gradient[1];
  const light =
    tier.toLowerCase() === "platinum" ? "#B7C2D6" : palette.gradient[0];
  const accent =
    (
      {
        bronze: "#49301D",
        silver: "#283A50",
        gold: "#523704",
        diamond: "#164353",
        platinum: "#27374D",
      } as Record<string, string>
    )[tier.toLowerCase()] || "#283A50";
  return {
    background: dark
      ? blend(metallic, "#141015", 0.84)
      : blend(metallic, light, tier.toLowerCase() === "platinum" ? 0.88 : 0.32),
    surface: dark
      ? blend(metallic, "#171319", 0.86)
      : blend(light, "#FFFFFF", 0.5),
    surfaceRaised: dark ? blend(metallic, "#211B24", 0.78) : light,
    border: dark
      ? blend(metallic, "#403240", 0.6)
      : blend(metallic, "#654719", 0.22),
    ink: dark ? "#FFF8EB" : "#302313",
    muted: dark ? "#E9DCC7" : "#49351F",
    mutedSoft: dark ? "#E9DCC7" : "#49351F",
    cocoa: dark ? "#FFF8EB" : "#302313",
    brandStrong: dark
      ? tier.toLowerCase() === "platinum"
        ? "#D4E6FF"
        : palette.gradient[0]
      : accent,
    brandLight: dark ? blend(metallic, "#211B24", 0.75) : light,
    action: accent,
    onAction: "#FFFFFF",
    success: dark ? "#9CE7BD" : "#075334",
    error: dark ? "#FFABB7" : "#852039",
    warning: dark ? "#FFD890" : "#523704",
  };
}

/** Subtle tier tint preserves the current theme's readable foregrounds, including Platinum. */
export function membershipSurface(tier: string, background: string) {
  const tint = membershipPalette(tier).gradient[1];
  const blend = [1, 3, 5].map((i) =>
    Math.round(
      parseInt(background.slice(i, i + 2), 16) * 0.94 +
        parseInt(tint.slice(i, i + 2), 16) * 0.06,
    )
      .toString(16)
      .padStart(2, "0"),
  );
  return "#" + blend.join("");
}
