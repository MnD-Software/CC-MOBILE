export type ShopBrowseParams = {
  page?: number;
  perPage?: number;
  search?: string;
  categories?: readonly number[];
  minimumKes?: number;
  maximumKes?: number;
};

export function parseBudget(minimum: string, maximum: string) {
  const parse = (value: string) => {
    if (!value.trim()) return undefined;
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
      throw new Error("Enter a positive amount in KSh, without commas.");
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)
      throw new Error("Enter an amount between KSh 0 and 1,000,000.");
    return amount;
  };
  const minimumKes = parse(minimum);
  const maximumKes = parse(maximum);
  if (
    minimumKes !== undefined &&
    maximumKes !== undefined &&
    minimumKes > maximumKes
  )
    throw new Error("Your maximum budget must be at least your minimum.");
  return { minimumKes, maximumKes };
}

/** Woo Store API takes prices in minor units. Never sort a partial local page. */
export function shopBrowseQuery(params: ShopBrowseParams) {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 16;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 100
  )
    throw new Error("Invalid catalogue page.");
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
    orderby: "price",
    order: "asc",
  });
  if (params.search?.trim())
    query.set("search", params.search.trim().slice(0, 120));
  if (params.categories?.length) {
    if (params.categories.some((id) => !Number.isSafeInteger(id) || id < 1))
      throw new Error("Invalid category.");
    query.set("category", [...new Set(params.categories)].join(","));
    query.set("category_operator", "in");
  }
  const budget = parseBudget(
    params.minimumKes === undefined ? "" : String(params.minimumKes),
    params.maximumKes === undefined ? "" : String(params.maximumKes),
  );
  if (budget.minimumKes !== undefined)
    query.set("min_price", String(Math.round(budget.minimumKes * 100)));
  if (budget.maximumKes !== undefined)
    query.set("max_price", String(Math.round(budget.maximumKes * 100)));
  return query;
}
