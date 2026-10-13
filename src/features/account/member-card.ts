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
    gradient: ["#FFFFFF", "#F5F6F9", "#FFFFFF"],
    ink: "#263242",
    muted: "#455365",
    accent: "#52657D",
  },
  Gold: {
    gradient: ["#FFFFFF", "#FFFBF1", "#FFFFFF"],
    ink: "#49330D",
    muted: "#604B24",
    accent: "#75500F",
  },
  Diamond: {
    gradient: ["#FFFFFF", "#F2FAFD", "#FFFFFF"],
    ink: "#15384D",
    muted: "#31586F",
    accent: "#17698F",
  },
  Platinum: {
    gradient: ["#FFFFFF", "#EFF1F5", "#FFFFFF"],
    ink: "#222B3B",
    muted: "#4D586B",
    accent: "#495A78",
  },
} as const;

export function membershipPalette(tier: string) {
  const key = (
    Object.keys(membershipPalettes) as Array<keyof typeof membershipPalettes>
  ).find((name) => name.toLowerCase() === tier.trim().toLowerCase());
  return key ? membershipPalettes[key] : membershipPalettes.Silver;
}
