export const cardPages = [
  { id: "home", label: "Home" },
  { id: "shop", label: "Shop & cake details" },
  { id: "orders", label: "Orders & tracking" },
  { id: "profile", label: "Profile" },
  { id: "diy", label: "DIY & inspiration" },
  { id: "checkout", label: "Bag & checkout" },
  { id: "forYou", label: "For you & celebrations" },
] as const;
export type CardPage = (typeof cardPages)[number]["id"];
export function cardPageForPath(path: string): CardPage | null {
  const route = path.replace(/^\/\(tabs\)/, "") || "/";
  if (["/", "/index", "/home"].includes(route)) return "home";
  if (/^\/(shop|product)(\/|$)/.test(route)) return "shop";
  if (/^\/(orders|order|track-order)(\/|$)/.test(route)) return "orders";
  if (/^\/(profile|account)(\/|$)/.test(route)) return "profile";
  if (/^\/(studio|diy|custom|custom-cake)(\/|$)/.test(route)) return "diy";
  if (/^\/(cart|checkout|payment)(\/|$)/.test(route)) return "checkout";
  if (/^\/(for-you|celebrations|celebration-builder)(\/|$)/.test(route))
    return "forYou";
  return null;
}
export function parseCardPages(
  value: string | null,
): Partial<Record<CardPage, boolean>> {
  try {
    const parsed = JSON.parse(value || "{}");
    return Object.fromEntries(
      cardPages.filter((p) => parsed?.[p.id] === true).map((p) => [p.id, true]),
    );
  } catch {
    return {};
  }
}
