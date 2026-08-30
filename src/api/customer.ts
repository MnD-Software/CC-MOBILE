import { api } from './client';
import type {
  Address,
  AppNotification,
  Celebration,
  CustomCakeRequest,
  LoyaltyAccount,
  LoyaltyTransaction,
  NotificationPreference,
  Product,
  Reward,
  SupportConversation,
} from '@/domain/commerce';

export const accountApi = {
  async getAddresses(): Promise<Address[]> {
    return api.get<Address[]>('/v1/addresses', { auth: true });
  },

  async createAddress(input: Omit<Address, 'id' | 'is_default'> & { is_default?: boolean }): Promise<Address> {
    return api.post<Address>('/v1/addresses', input, { auth: true });
  },

  async updateAddress(id: string, input: Partial<Address>): Promise<Address> {
    return api.patch<Address>(`/v1/addresses/${id}`, input, { auth: true });
  },

  async deleteAddress(id: string): Promise<void> {
    return api.delete<void>(`/v1/addresses/${id}`, { auth: true });
  },

  async getFavorites(): Promise<Product[]> {
    return api.get<Product[]>('/v1/favorites', { auth: true });
  },

  async addFavorite(productId: string): Promise<void> {
    return api.post<void>('/v1/favorites', { product_id: productId }, { auth: true });
  },

  async removeFavorite(productId: string): Promise<void> {
    return api.delete<void>(`/v1/favorites/${productId}`, { auth: true });
  },

  async getCelebrations(): Promise<Celebration[]> {
    return api.get<Celebration[]>('/v1/celebrations', { auth: true });
  },

  async createCelebration(input: Omit<Celebration, 'id'>): Promise<Celebration> {
    return api.post<Celebration>('/v1/celebrations', input, { auth: true });
  },

  async updateCelebration(id: string, input: Partial<Celebration>): Promise<Celebration> {
    return api.patch<Celebration>(`/v1/celebrations/${id}`, input, { auth: true });
  },

  async deleteCelebration(id: string): Promise<void> {
    return api.delete<void>(`/v1/celebrations/${id}`, { auth: true });
  },
};

export const loyaltyApi = {
  async getAccount(): Promise<LoyaltyAccount> {
    return api.get<LoyaltyAccount>('/v1/loyalty', { auth: true });
  },

  async getTransactions(): Promise<LoyaltyTransaction[]> {
    return api.get<LoyaltyTransaction[]>('/v1/loyalty/transactions', { auth: true });
  },

  async getRewards(): Promise<Reward[]> {
    return api.get<Reward[]>('/v1/rewards', { auth: true });
  },

  async redeemReward(rewardId: string): Promise<{ points: number; message: string }> {
    return api.post<{ points: number; message: string }>('/v1/rewards/redeem', { reward_id: rewardId }, { auth: true });
  },
};

export const notificationApi = {
  async getNotifications(): Promise<AppNotification[]> {
    return api.get<AppNotification[]>('/v1/notifications', { auth: true });
  },

  async getPreferences(): Promise<NotificationPreference> {
    return api.get<NotificationPreference>('/v1/notifications/preferences', { auth: true });
  },

  async updatePreferences(input: Partial<NotificationPreference>): Promise<NotificationPreference> {
    return api.patch<NotificationPreference>('/v1/notifications/preferences', input, { auth: true });
  },

  async markRead(notificationId: string): Promise<void> {
    return api.post<void>(`/v1/notifications/${notificationId}/read`, {}, { auth: true });
  },

  async registerPushToken(token: string): Promise<void> {
    return api.post<void>('/v1/notifications/push-token', { token }, { auth: true });
  },
};

export const customCakeApi = {
  async createRequest(input: {
    occasion: string;
    cake_size: string;
    flavour?: string;
    eggless: boolean;
    design_style?: string;
    colors?: string;
    message?: string;
    reference_image_url?: string;
    delivery_date: string;
    delivery_location?: string;
    budget: number;
    special_instructions?: string;
  }): Promise<CustomCakeRequest> {
    return api.post<CustomCakeRequest>('/v1/custom-cakes', input, { auth: true });
  },

  async getRequests(): Promise<CustomCakeRequest[]> {
    return api.get<CustomCakeRequest[]>('/v1/custom-cakes', { auth: true });
  },

  async cancelRequest(id: string): Promise<CustomCakeRequest> {
    return api.post<CustomCakeRequest>(`/v1/custom-cakes/${id}/cancel`, {}, { auth: true });
  },
};

export const supportApi = {
  async getConversations(): Promise<SupportConversation[]> {
    return api.get<SupportConversation[]>('/v1/support', { auth: true });
  },

  async createConversation(input: { topic: string; message: string }): Promise<SupportConversation> {
    return api.post<SupportConversation>('/v1/support', input, { auth: true });
  },

  async sendMessage(conversationId: string, body: string): Promise<SupportConversation> {
    return api.post<SupportConversation>(`/v1/support/${conversationId}/messages`, { body }, { auth: true });
  },
};