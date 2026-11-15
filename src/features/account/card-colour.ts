export const cardColours = ["Silver", "Gold", "Diamond", "Platinum"] as const;
export type CardColour = (typeof cardColours)[number];

export function parseCardColour(value: unknown): CardColour | undefined {
  return cardColours.find((colour) => colour === value);
}

export function hasFinalCard(tier?: string) {
  return tier?.toLowerCase() === "platinum";
}

/** Appearance only: always retain the server tier for benefits and milestones. */
export function cardColourTier(tier: string | undefined, choice: unknown) {
  return (hasFinalCard(tier) && parseCardColour(choice)) || tier;
}
