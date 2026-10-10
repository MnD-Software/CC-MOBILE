import {
  plainText,
  productPrice,
  type StoreProduct,
} from "@/features/commerce/contracts";

export function nextCelebration(month: number, day: number, now = new Date()) {
  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > new Date(2000, month, 0).getDate()
  )
    throw new Error("Invalid celebration date");
  const date = (year: number) =>
    new Date(
      year,
      month - 1,
      Math.min(day, new Date(year, month, 0).getDate()),
    );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = date(now.getFullYear());
  return thisYear >= today ? thisYear : date(now.getFullYear() + 1);
}
export function confirmedServings(product: StoreProduct) {
  const attribute = product.attributes.find((item) =>
    /serving|portion|people/i.test(item.name),
  );
  return attribute ? attribute.terms.map((term) => term.name).join(", ") : null;
}
export function planningRecommendations(
  products: StoreProduct[],
  flavour: string,
  budget: number,
  guests: number,
) {
  return products
    .filter((product) => {
      const price = productPrice(product);
      return (
        product.is_in_stock &&
        product.is_purchasable &&
        price !== null &&
        price <= budget &&
        /cake|sponge|forest|velvet|lotus|biscoff/i.test(
          `${plainText(product.name)} ${(product.categories ?? []).map((category) => category.name).join(" ")}`,
        ) &&
        !/cupcake|candle|topper|stand/i.test(plainText(product.name))
      );
    })
    .map((product) => {
      const name = plainText(product.name).toLowerCase();
      const flavours =
        `${name} ${product.attributes.map((item) => item.terms.map((term) => term.name).join(" ")).join(" ")}`.toLowerCase();
      const matches =
        flavour === "Surprise me" || flavours.includes(flavour.toLowerCase());
      const servings = confirmedServings(product);
      const numbers = servings?.match(/\d+/g)?.map(Number);
      const fits = !!numbers?.length && Math.max(...numbers) >= guests;
      return {
        product,
        score: (matches ? 10 : 0) + (fits ? 3 : 0),
        explanation: `${matches ? (flavour === "Surprise me" ? "A little inspiration" : `${flavour} pick`) : "Another flavour to explore"} · ${servings ? `${servings} servings` : "Confirm servings with the bakery"}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id)
    .slice(0, 12);
}
export function combinedPlanTotal(
  cakePrice: number | null,
  extras: StoreProduct[],
) {
  if (cakePrice === null || !Number.isFinite(cakePrice) || cakePrice < 0)
    return null;
  const prices = extras.map(productPrice);
  if (prices.some((value) => value === null)) return null;
  return (
    Math.round(
      (cakePrice + prices.reduce<number>((sum, value) => sum + value!, 0)) *
        100,
    ) / 100
  );
}

export function suggestedOrderDate(
  celebration: string,
  preparationHours: number | null,
) {
  const date = Date.parse(celebration);
  if (
    !Number.isFinite(date) ||
    preparationHours === null ||
    preparationHours < 0 ||
    !Number.isFinite(preparationHours)
  )
    return null;
  return new Date(date - preparationHours * 3600000);
}
