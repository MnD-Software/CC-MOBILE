import { z } from "zod";
import { branchSchema } from "./contracts";
const design = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.string(),
  selections: z.record(z.string(), z.array(z.string())),
  message: z.string(),
  updated_at: z.string(),
});
const strings = z.array(z.string()).max(100);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function validEntries<T>(
  value: unknown,
  schema: z.ZodType<T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([owner, candidate]) => {
      const result = schema.safeParse(candidate);
      return result.success ? [[owner, result.data]] : [];
    }),
  );
}
/** Old or interrupted device writes must never crash login/profile/DIY rendering. */
export function validatedPreferences(value: unknown) {
  const saved = record(value);
  const branch = branchSchema.nullable().safeParse(saved.branch);
  return {
    savedProductSlugs: strings.safeParse(saved.savedProductSlugs).data ?? [],
    recentSearches: strings.safeParse(saved.recentSearches).data ?? [],
    recentSlugsByOwner: validEntries(saved.recentSlugsByOwner, strings),
    profileAvatars: validEntries(
      saved.profileAvatars,
      z.object({ kind: z.enum(["photo", "preset"]), value: z.string() }),
    ),
    designs: Object.fromEntries(
      Object.entries(record(saved.designs)).map(([owner, items]) => [
        owner,
        Array.isArray(items)
          ? items
              .flatMap((item) => {
                const result = design.safeParse(item);
                return result.success ? [result.data] : [];
              })
              .slice(0, 20)
          : [],
      ]),
    ),
    branch: branch.success ? branch.data : null,
  };
}
