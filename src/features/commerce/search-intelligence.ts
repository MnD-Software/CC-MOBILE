const directCorrections: Record<string, string> = {
  bday: "birthday",
  choclate: "chocolate",
  choclatee: "chocolate",
  chcolate: "chocolate",
  velvett: "velvet",
  custome: "custom",
};

function normaliseToken(token: string) {
  return token.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A deliberately small, transparent safety net for common Cake City search
 * typos and abbreviations. It never invents product matches: the corrected
 * phrase is still sent to the live catalogue boundary for real results.
 */
export function suggestedSearchTerm(value: string) {
  const original = value.trim().replace(/\s+/g, " ");
  if (!original) return null;
  const corrected = original
    .split(" ")
    .map((token) => {
      const replacement = directCorrections[normaliseToken(token)];
      return replacement ?? token;
    })
    .join(" ");
  return corrected.toLocaleLowerCase() === original.toLocaleLowerCase()
    ? null
    : corrected;
}

export const browseSearchIdeas = [
  "Chocolate cake",
  "Birthday cake",
  "Red velvet",
  "Custom cake",
] as const;
