/** Cached, prefetched and background screens must never create viewing history. */
export function shouldRememberProduct(
  active: boolean,
  lookup: string,
  product: { id: number; slug: string },
) {
  return active && (lookup === product.slug || lookup === String(product.id));
}
