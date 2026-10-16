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
    membershipPalettes[tier as keyof typeof membershipPalettes] ??
    membershipPalettes.Silver
  );
}
