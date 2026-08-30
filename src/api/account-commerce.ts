import { api } from './client';

export type AccountOrderSummaryResponse = {
  reference: string;
  state: string;
  total: string;
  currency: string;
  fulfilment: string;
  delivery_slot: string | null;
  created_at: string;
};

export type RewardsOverviewResponse = {
  points_balance: number;
  lifetime_points: number;
  lifetime_spend: string;
  tier: 'silver' | 'gold' | 'diamond' | 'platinum';
  benefits: string[];
  next_tier: null | {
    name: 'gold' | 'diamond' | 'platinum';
    spend_required: string;
  };
  wallet: { balance: string; currency: string };
  referral: { code: string; completed: number; reward_points: number };
};

export type RewardsActivityResponse = {
  points: Array<{
    id: string;
    points: number;
    description: string;
    balance_after: number;
    created_at: string;
  }>;
  wallet: Array<{
    id: string;
    amount: string;
    description: string;
    balance_after: string;
    created_at: string;
  }>;
};

/** Account commerce endpoints exposed by the current Cake City API. */
export const accountCommerceApi = {
  getOrders(options?: { signal?: AbortSignal }) {
    return api.get<AccountOrderSummaryResponse[]>('/v1/account/orders', {
      auth: true,
      signal: options?.signal,
    });
  },

  getRewards(options?: { signal?: AbortSignal }) {
    return api.get<RewardsOverviewResponse>('/v1/account/rewards', {
      auth: true,
      signal: options?.signal,
    });
  },

  getRewardsActivity(limit = 30, options?: { signal?: AbortSignal }) {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    return api.get<RewardsActivityResponse>(`/v1/account/rewards/activity?limit=${safeLimit}`, {
      auth: true,
      signal: options?.signal,
    });
  },
};
