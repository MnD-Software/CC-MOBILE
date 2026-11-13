import { plainText, type StoreProduct } from "./contracts";
import { selectionWeight } from "./checkout-success";

type ProductEvidence = Pick<StoreProduct, "name" | "categories">;
export function catalogueKind(
  product: ProductEvidence,
): "cake" | "accessory" | "cookie" | "cupcake" {
  const categories = product.categories;
  if (
    categories.some((c) => c.id === 110 || /cupcakes?/i.test(c.name)) ||
    /cupcakes?/i.test(plainText(product.name))
  )
    return "cupcake";
  if (
    categories.some(
      (c) => c.id === 109 || /accessor|party item|tableware/i.test(c.name),
    )
  )
    return "accessory";
  if (
    categories.some(
      (c) => c.id === 111 || /^cookies?$|^biscuits?$/i.test(c.name),
    )
  )
    return "cookie";
  const name = plainText(product.name);
  // A balloons cake or cookies-and-cream cake is still a cake.
  if (
    /\bcakes?\b|cupcakes?|cheesecakes?|gateau/i.test(name) ||
    categories.some((c) => /cakes?|gateau/i.test(c.name))
  )
    return "cake";
  if (/\bcookies?\b|\bbiscuits?\b/i.test(name)) return "cookie";
  return /candle|candel|sparkler|balloon|ballon|topper|napkin|paper plate|party (?:banner|popper|hat|plate|whistle|mask)|face mask|cutlery|confetti/i.test(
    name,
  )
    ? "accessory"
    : "cake";
}

export function isPinkSimbaPackage(
  product: Pick<StoreProduct, "name" | "slug">,
) {
  return /pink[-\s]+simba/i.test(`${product.name} ${product.slug}`);
}

export function catalogueSelectionSize(
  product: ProductEvidence & Pick<StoreProduct, "slug">,
  selectedLabel?: string | null,
) {
  if (isPinkSimbaPackage(product)) return "3kg";
  const kind = catalogueKind(product);
  return kind === "cookie"
    ? "Pack"
    : kind === "accessory"
      ? "Item"
      : selectionWeight(selectedLabel ?? plainText(product.name));
}
