import { storeProductSchema, type StoreProduct } from "./contracts";

/** Merchandising content supplied by the owner in the September 14 UI reference.
 * These display records never establish stock, purchasability or checkout prices.
 * A matching backend product and a current checkout quote are required to order.
 */
export const referenceCategories = [
  { id: -1, name: "Birthday", slug: "birthday", parent: 0, count: 5 },
  { id: -2, name: "Anniversary", slug: "anniversary", parent: 0, count: 5 },
  { id: -3, name: "Kids", slug: "kids", parent: 0, count: 3 },
  { id: -4, name: "Chocolate", slug: "chocolate", parent: 0, count: 2 },
];

const entries = [
  {
    id: -101,
    name: "Chocolate Fudge Delight",
    slug: "chocolate-fudge-delight",
    price: 3200,
    categories: [-1, -2, -3, -4],
  },
  {
    id: -102,
    name: "Red Velvet Dream",
    slug: "red-velvet-dream",
    price: 3500,
    categories: [-1, -2],
  },
  {
    id: -103,
    name: "Lotus Biscoff Cheesecake",
    slug: "lotus-biscoff-cheesecake",
    price: 3800,
    categories: [-1, -2],
  },
  {
    id: -104,
    name: "Vanilla Berry Bliss",
    slug: "vanilla-berry-bliss",
    price: 3200,
    categories: [-1, -2, -3],
  },
  {
    id: -105,
    name: "Black Forest Delight",
    slug: "black-forest-delight",
    price: 3200,
    categories: [-1, -2, -3, -4],
  },
] as const;

export const referenceCakes: StoreProduct[] = entries.map((entry) =>
  storeProductSchema.parse({
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    type: "reference",
    description:
      "Made for your celebration. Cake design, selected options and availability are confirmed by Cake City when ordering.",
    is_in_stock: false,
    is_purchasable: false,
    prices: {
      price: String(entry.price * 100),
      regular_price: String(entry.price * 100),
      currency_code: "KES",
      currency_minor_unit: 2,
    },
    images: [
      { id: entry.id, src: "cakecity-artwork:" + entry.slug, alt: entry.name },
    ],
    categories: referenceCategories.filter((category) =>
      (entry.categories as readonly number[]).includes(category.id),
    ),
  }),
);

export const referenceBestsellers = [-102, -103, -105].map(
  (id) => referenceCakes.find((cake) => cake.id === id)!,
);
export function referenceCake(id: string | number) {
  return referenceCakes.find(
    (cake) => String(cake.id) === String(id) || cake.slug === id,
  );
}
export function referenceBackendSlug(id: number) {
  return entries.find((entry) => entry.id === id)?.slug ?? null;
}
