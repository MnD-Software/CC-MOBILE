/**
 * Visual navigation only. These are Cake City-hosted category images, not a
 * product catalogue or source of price/stock. Every tile opens the live Shop
 * query for its category.
 */
export const homeCollections = [
  {
    id: "vanilla-base",
    name: "Vanilla Base Sponge",
    lookup: ["vanilla base sponge", "vanilla sponge cakes"],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Lotus-biscoff-Photoroom.avif",
    tint: "#FFF4F5",
  },
  {
    id: "chocolate-base",
    name: "Chocolate Base Sponge",
    lookup: ["chocolate base sponge", "chocolate sponge cakes"],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Black-forest-Photoroom.avif",
    tint: "#F8F1E8",
  },
  {
    id: "pound-cakes",
    name: "Pound Cakes",
    lookup: ["pound cakes", "pound cakes collections"],
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/Rainbow-Magic-Photoroom-4.webp?fit=640%2C640&ssl=1",
    tint: "#EFF9FC",
  },
  {
    id: "cheese-cakes",
    name: "Cheese Cakes",
    lookup: ["cheese cakes"],
    image:
      "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2024/08/caramel-cheese-4.webp?fit=640%2C640&ssl=1",
    tint: "#FFF8E8",
  },
  {
    id: "custom-cakes",
    name: "Custom Cakes",
    lookup: ["custom cakes"],
    image: "https://cakecity.co.ke/wp-content/uploads/2025/08/GRAD-4.avif",
    tint: "#F6F0FF",
  },
  {
    id: "signature-cakes",
    name: "Signature Cakes",
    lookup: ["signature cakes", "signature cake"],
    image:
      "https://cakecity.co.ke/wp-content/uploads/2025/08/Straw-gateau-Photoroom-2.avif",
    tint: "#FFF1F5",
  },
] as const;
