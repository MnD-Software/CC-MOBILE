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
  return products.filter(
    (product) => isDealsAndSteals(product) && productPrice(product) !== null,
  );
}
