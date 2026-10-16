import { productPrice, type BagLine, type StoreProduct } from "./contracts";
import { rankPairings } from "./pairings";

export function cartSuggestions(
  lines: (Pick<BagLine, "product_id" | "name"> &
    Partial<Pick<BagLine, "slug">>)[],
  offers: StoreProduct[],
  popular: StoreProduct[],
  extras: StoreProduct[] = [],
) {
  const excluded = new Set(
    lines.flatMap((line) =>
      line.product_id === undefined ? [] : [line.product_id],
    ),
  );
  const excludedSlugs = new Set(
    lines.flatMap((line) => (line.slug ? [line.slug] : [])),
  );
  const seen = new Set<number>(excluded);
  const eligible = (products: StoreProduct[], limit = 6) =>
    products
      .filter((product) => {
        if (
          seen.has(product.id) ||
          excludedSlugs.has(product.slug) ||
          !product.is_in_stock ||
          !product.is_purchasable ||
          productPrice(product) === null
        )
          return false;
        return true;
      })
      .filter(
        (product, index, all) =>
          all.findIndex((item) => item.id === product.id) === index,
      )
      .slice(0, limit)
      .map((product) => {
        seen.add(product.id);
        return product;
      });

  // Popular records retain WooCommerce's sales ordering; never infer sales
  // from ratings or a partial catalogue page.
  const offerProducts = eligible(
    offers.filter(
      (product) =>
        product.on_sale ||
        product.categories.some((category) => category.id === 206),
    ),
  );
  const popularProducts = eligible(popular);
  const candidates = [...extras, ...offers, ...popular].filter(
    (product) => !excluded.has(product.id) && !excludedSlugs.has(product.slug),
  );
  const ranked = lines
    .flatMap((line) =>
      rankPairings(
        { id: line.product_id ?? 0, name: line.name, categories: [] },
        candidates,
      ),
    )
    .sort((a, b) => b.score - a.score);
  const pairedIds = new Set<number>();
  const pairings = ranked
    .filter(({ product }) => {
      if (pairedIds.has(product.id)) return false;
      pairedIds.add(product.id);
      return true;
    })
    .slice(0, 6)
    .map(({ product }) => product);
  return { offers: offerProducts, popular: popularProducts, pairings };
}
