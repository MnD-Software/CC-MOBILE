export type PurchaseMilestones = {
  purchases: number;
  milestones?: { purchases: number; name: string }[];
  next_tier: { name: string; purchases_remaining: number } | null;
};
export type MilestoneProgress = {
  current: number;
  total: number;
  target: string;
  next: string;
};

export function milestoneProgress(
  value?: PurchaseMilestones,
): MilestoneProgress | undefined {
  if (!value) return;
  const final = value.milestones?.reduce<
    { purchases: number; name: string } | undefined
  >(
    (last, row) => (!last || row.purchases > last.purchases ? row : last),
    undefined,
  );
  if (!final || final.purchases <= 0) return;
  return {
    current: Math.max(0, Math.min(value.purchases, final.purchases)),
    total: final.purchases,
    target: final.name,
    next: value.next_tier
      ? `${value.next_tier.purchases_remaining} more purchase${value.next_tier.purchases_remaining === 1 ? "" : "s"} to ${value.next_tier.name}`
      : `${final.name} unlocked — every milestone complete!`,
  };
}

const ranks: Record<string, number> = {
  Bronze: 0,
  Silver: 1,
  Gold: 2,
  Diamond: 3,
  Platinum: 4,
};

/** Establish a baseline on sign-in; never replay a tier on refresh or refund recovery. */
export class MilestoneTracker {
  private owner = "";
  private highest = -1;
  update(value: { owner: string; tier: string } | null): string | null {
    if (!value) {
      this.owner = "";
      this.highest = -1;
      return null;
    }
    const rank = Object.hasOwn(ranks, value.tier) ? ranks[value.tier] : -1;
    if (rank < 0) return null;
    if (this.owner !== value.owner) {
      this.owner = value.owner;
      this.highest = rank;
      return null;
    }
    if (rank <= this.highest) return null;
    this.highest = rank;
    return value.tier;
  }
}
