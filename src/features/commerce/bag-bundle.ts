import { bagLineSchema, lineKey, type BagLine } from "./contracts";

/** A cake and its extras enter the bag together, or nothing changes. */
export function appendBagBundle(
  current: BagLine[],
  additions: BagLine[],
): BagLine[] | null {
  if (!additions.length) return null;
  const result = current.map((line) => ({ ...line }));
  for (const raw of additions) {
    const parsed = bagLineSchema.safeParse(raw);
    if (!parsed.success) return null;
    const line = parsed.data;
    const key = lineKey(line.slug, line.selection);
    const index = result.findIndex((item) => item.key === key);
    const quantity = line.quantity + (index < 0 ? 0 : result[index].quantity);
    if (quantity > 20) return null;
    if (index < 0) result.push({ ...line, key });
    else result[index] = { ...line, key, quantity };
    if (result.length > 30) return null;
  }
  return result;
}
