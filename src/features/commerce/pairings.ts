import { plainText, productPrice, type StoreProduct } from "./contracts";

function context(product: StoreProduct) {
  return plainText(
    [product.name, ...product.categories.map((c) => c.name)].join(" "),
  ).toLowerCase();
}

function kind(product: StoreProduct) {
  const text = context(product);
  if (/\bcandles?\b|\btoppers?\b/.test(text)) return "accessory";
  if (
    /\bcupcakes?\b|\bcookies?\b|\bbrownies?\b|\bdoughnuts?\b|\bdonuts?\b/.test(
      text,
    )
  )
    return "treat";
  if (/\bcakes?\b/.test(text)) return "cake";
  return "other";
}

/** Rank real catalogue records only. Checkout still verifies all availability. */
export function rankPairings(
  product: StoreProduct,
  candidates: StoreProduct[],
  limit = 6,
  curatedIds: number[] = [],
) {
  const sourceKind = kind(product);
  const sourceText = context(product);
  const seen = new Set<number>();
  return candidates
    .flatMap((candidate) => {
      if (
        candidate.id === product.id ||
        seen.has(candidate.id) ||
        !candidate.is_in_stock ||
        !candidate.is_purchasable ||
        productPrice(candidate) === null
      )
        return [];
      seen.add(candidate.id);
      const candidateKind = kind(candidate);
      let score = 0;
      let reason = "A little extra for your celebration";
      if (sourceKind === "cake" && candidateKind === "accessory") {
        score = 100;
        reason = "Finish your cake celebration";
      } else if (sourceKind === "cake" && candidateKind === "treat") {
        score = 80;
        reason = "Extra treats to share";
      } else if (
        (sourceKind === "accessory" || sourceKind === "treat") &&
        candidateKind === "cake"
      ) {
        score = 90;
        reason = "Make a cake the centrepiece";
      } else if (sourceKind === "treat" && candidateKind === "accessory") {
        score = 60;
        reason = "Add a celebration finishing touch";
      }
      const curatedIndex = curatedIds.indexOf(candidate.id);
      if (curatedIndex >= 0) {
        score = 1000 - curatedIndex;
        reason = "Selected by Cake City for this item";
      }
      if (!score) return [];
      for (const flavour of [
        "chocolate",
        "vanilla",
        "velvet",
        "lemon",
        "strawberry",
      ]) {
        if (
          sourceText.includes(flavour) &&
          context(candidate).includes(flavour)
        )
          score += 10;
      }
      return [{ product: candidate, reason, score }];
    })
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id)
    .slice(0, limit);
}
