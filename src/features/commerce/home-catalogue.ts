import { plainText, productPrice, type StoreProduct } from "./contracts";

/** Category membership is separate from app stock and payment availability. */
export function isDealsAndSteals(product: StoreProduct) {
  return product.categories.some(
    (category) =>
      category.id === 206 ||
      category.slug === "deals-and-steals" ||
      plainText(category.name).toLowerCase().replace(/&/g, "and") ===
        "deals and steals",
  );
}

/** Only real Deals & Steals records belong in this carousel. */
export function dealCarouselProducts(products: readonly StoreProduct[]) {
  return products
    .filter(
      (product) => isDealsAndSteals(product) && productPrice(product) !== null,
    )
    .sort(
      (a, b) =>
        Number(
          !/caramel|chocolate|vanilla|velvet|forest|strawberry|blueberry|lemon|coffee|biscoff|lotus/i.test(
            a.name,
          ),
        ) -
        Number(
          !/caramel|chocolate|vanilla|velvet|forest|strawberry|blueberry|lemon|coffee|biscoff|lotus/i.test(
            b.name,
          ),
        ),
    );
}

export function carouselProductTitle(product: StoreProduct) {
  const name = plainText(product.name)
    .replace(/\s*[-–·]?\s*OFFERS?\s*$/i, "")
    .trim();
  const flavours = product.attributes
    .filter((a) => /flavou?r/i.test(a.name))
    .flatMap((a) => a.terms.map((t) => plainText(t.name)));
  return flavours.length === 1 &&
    !name.toLowerCase().includes(flavours[0].toLowerCase())
    ? `${flavours[0]} · ${name}`
    : name;
}
