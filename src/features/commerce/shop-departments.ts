import { appMedia } from "./app-media";
import { plainText, type StoreProduct } from "./contracts";

export const shopDepartments = [
  {
    id: "all",
    name: "All",
    categories: [],
    image: appMedia(
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Straw-gateau-Photoroom-2.avif",
    ),
    filters: [{ id: "all", label: "All cakes" }],
  },
  {
    id: "vanilla",
    name: "Vanilla",
    categories: [169, 170],
    image: appMedia(
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Lotus-biscoff-Photoroom.avif",
    ),
    filters: [
      { id: "all", label: "All vanilla cakes" },
      { id: "sponge", label: "Vanilla sponge", note: "Made to order" },
      { id: "pound", label: "Vanilla pound cake", note: "Order 1 day ahead" },
    ],
  },
  {
    id: "signature",
    name: "Signature",
    categories: [229],
    image: appMedia(
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Straw-gateau-Photoroom-2.avif",
    ),
    filters: [
      { id: "all", label: "All signature cakes" },
      { id: "vanilla", label: "Vanilla sponge" },
      { id: "chocolate", label: "Chocolate sponge" },
      { id: "pound", label: "Pound cake", note: "Order 1 day ahead" },
    ],
  },
  {
    id: "chocolate",
    name: "Chocolate",
    categories: [168, 170],
    image: appMedia(
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Black-forest-Photoroom.avif",
    ),
    filters: [
      { id: "all", label: "All chocolate cakes" },
      { id: "pound", label: "Chocolate pound cake", note: "Order 1 day ahead" },
      { id: "sponge", label: "Chocolate sponge", note: "Made to order" },
    ],
  },
  {
    id: "cheesecakes",
    name: "Cheesecakes",
    categories: [171],
    image: appMedia(
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/caramel-cheese-4.webp?fit=1024%2C1024&ssl=1",
    ),
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
    image: appMedia(
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/09/DSC04146-Photoroom.jpg?fit=520%2C520&ssl=1",
    ),
    filters: [
      { id: "all", label: "All cupcakes" },
      { id: "filled", label: "Filled cupcakes" },
      { id: "plain", label: "Plain cupcakes" },
      { id: "frosted", label: "Frosted cupcakes" },
    ],
  },
  {
    id: "pound",
    name: "Pound Cakes",
    categories: [170],
    image: appMedia(
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/Rainbow-Magic-Photoroom-4.webp?fit=640%2C640&ssl=1",
    ),
    filters: [{ id: "all", label: "All pound cakes" }],
  },
  {
    id: "custom",
    name: "Custom Cakes",
    categories: [123],
    image: appMedia(
      "https://cakecity.co.ke/wp-content/uploads/2025/08/GRAD-4.avif",
    ),
    filters: [{ id: "all", label: "All custom cakes" }],
  },
  {
    id: "deals",
    name: "Deals & Steals",
    categories: [206, 98],
    image: appMedia(
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2026/10/WhatsApp-Image-2026-10-06-at-13.24.30.webp?fit=1254%2C1254&ssl=1",
    ),
    filters: [{ id: "all", label: "All deals & steals" }],
  },
  {
    id: "accessories",
    name: "Accessories",
    categories: [],
    image: appMedia(
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/party.jpg?fit=520%2C520&ssl=1",
    ),
    filters: [
      { id: "all", label: "Party essentials" },
      { id: "candles", label: "Candles & sparklers" },
      { id: "toppers", label: "Cake toppers" },
      { id: "balloons", label: "Balloons & decor" },
      { id: "tableware", label: "Party tableware" },
    ],
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
        170: "pound",
        123: "custom",
        171: "cheesecakes",
        110: "cupcakes",
        206: "deals",
        98: "deals",
        109: "accessories",
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
    return filter === "all"
      ? has(169) || (has(170) && /vanilla/.test(name))
      : filter === "pound"
        ? has(170) && /vanilla/.test(name)
        : has(169);
  if (department === "chocolate")
    return filter === "all"
      ? has(168) || (has(170) && /choco/.test(name))
      : filter === "pound"
        ? has(170) && /choco/.test(name)
        : has(168);
  if (department === "signature")
    return (
      has(229) &&
      (filter === "all" ||
        has(filter === "vanilla" ? 169 : filter === "chocolate" ? 168 : 170))
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
  if (department === "deals") return has(206) || has(98);
  if (department === "accessories")
    return (
      filter === "all" ||
      new RegExp(
        filter === "candles"
          ? "candle|sparkler"
          : filter === "toppers"
            ? "topper"
            : filter === "balloons"
              ? "balloon|banner|decor"
              : "plate|cup|napkin|table|cutlery",
        "i",
      ).test(details)
    );
  if (department === "custom") return has(123);
  if (department === "pound") return has(170);
  return true;
}
