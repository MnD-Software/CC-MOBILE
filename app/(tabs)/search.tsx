import { ShopScreen } from "@/features/commerce/ShopScreen";

/**
 * Search is deliberately its own primary destination. It shares the live
 * catalogue boundary with Shop, while giving keyboard-first discovery and
 * recent-search recovery a predictable place in the navigation model.
 */
export default function SearchTab() {
  return <ShopScreen searchOnly />;
}
