import { plainText, type StoreProduct } from "./contracts";

export const shopDepartments = [
  {
    id: "all",
    name: "All",
    categories: [229, 168, 169, 170, 171, 72, 110, 112, 206, 98],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Straw-gateau-Photoroom-2.avif",
    filters: [{ id: "all", label: "All cakes" }],
  },
  {
    id: "vanilla",
    name: "Vanilla",
    categories: [169, 170],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Lotus-biscoff-Photoroom.avif",
    filters: [
      { id: "sponge", label: "Vanilla sponge", note: "Ready now" },
      { id: "pound", label: "Vanilla pound cake", note: "Order 1 day ahead" },
    ],
  },
  {
    id: "signature",
    name: "Signature",
    categories: [229],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Straw-gateau-Photoroom-2.avif",
    filters: [
      { id: "vanilla", label: "Vanilla sponge" },
      { id: "chocolate", label: "Chocolate sponge" },
      { id: "pound", label: "Pound cake", note: "Order 1 day ahead" },
    ],
  },
  {
    id: "chocolate",
    name: "Chocolate",
    categories: [168, 170],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Black-forest-Photoroom.avif",
    filters: [
      { id: "pound", label: "Chocolate pound cake", note: "Order 1 day ahead" },
      { id: "sponge", label: "Chocolate sponge", note: "Ready now" },
    ],
  },
  {
    id: "cheesecakes",
    name: "Cheesecakes",
    categories: [171],
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/caramel-cheese-4.webp?fit=1024%2C1024&ssl=1",
    filters: [
      { id: "all", label: "All cheesecakes" },
      { id: "24", label: "Order 1 day ahead" },
      { id: "48", label: "Order 2 days ahead" },
    ],
  },
  {
    id: "cupcakes",
    name: "Cupcakes",
    categories: [110],
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/09/DSC04146-Photoroom.jpg?fit=520%2C520&ssl=1",
    filters: [
      { id: "all", label: "All cupcakes" },
      { id: "filled", label: "Filled cupcakes" },
      { id: "plain", label: "Plain cupcakes" },
      { id: "frosted", label: "Frosted cupcakes" },
    ],
  },
  {
    id: "offers",
    name: "Offers",
    categories: [206, 98],
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2026/10/WhatsApp-Image-2026-10-06-at-13.24.30.webp?fit=1254%2C1254&ssl=1",
    filters: [{ id: "all", label: "All offers" }],
  },
] as const;
export type ShopDepartmentId = (typeof shopDepartments)[number]["id"];

export function departmentForCategory(id?: number): ShopDepartmentId {
  return (
    (
      {
        169: "vanilla",
        168: "chocolate",
        229: "signature",
        170: "all",
        171: "cheesecakes",
        110: "cupcakes",
        206: "offers",
        98: "offers",
      } as Record<number, ShopDepartmentId>
    )[id ?? 0] ?? "all"
  );
}

/** Only published category/name/attribute evidence determines membership. */
export function matchesShopSelection(
  product: StoreProduct,
  department: ShopDepartmentId,
  filter: string,
) {
  const has = (id: number) => product.categories.some((c) => c.id === id);
  const name = plainText(product.name).toLowerCase();
  const attributes = product.attributes
    .map((a) => `${a.name} ${a.terms.map((t) => t.name).join(" ")}`)
    .join(" ")
    .toLowerCase();
  const details =
    `${name} ${plainText(product.description)} ${plainText(product.short_description)} ${product.categories.map((c) => plainText(c.name)).join(" ")} ${attributes}`.toLowerCase();
  if (department === "vanilla")
    return filter === "pound" ? has(170) && /vanilla/.test(name) : has(169);
  if (department === "chocolate")
    return filter === "pound" ? has(170) && /choco/.test(name) : has(168);
  if (department === "signature")
    return (
      has(229) &&
      has(filter === "vanilla" ? 169 : filter === "chocolate" ? 168 : 170)
    );
  if (department === "cheesecakes")
    return (
      has(171) &&
      (filter === "all" ||
        new RegExp(`\\b${filter}\\s*(?:hours?|hrs?)\\b`, "i").test(details))
    );
  if (department === "cupcakes")
    return (
      has(110) &&
      (filter === "all" || new RegExp(`\\b${filter}\\b`, "i").test(details))
    );
  if (department === "offers") return has(206) || has(98);
  return true;
}
