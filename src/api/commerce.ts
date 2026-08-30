import { api } from './client';
import type { Cart, Order } from '@/domain/commerce';

export const cartApi = {
  async getCart(): Promise<Cart> {
    return api.get<Cart>('/v1/cart', { auth: true });
  },

  async addItem(input: {
    product_id: string;
    variant_id: string;
    quantity: number;
    cake_message?: string;
    addon_ids?: string[];
  }): Promise<Cart> {
    return api.post<Cart>('/v1/cart/items', input, { auth: true });
  },

  async updateItem(itemId: string, input: { quantity: number }): Promise<Cart> {
    return api.patch<Cart>(`/v1/cart/items/${itemId}`, input, { auth: true });
  },

  async removeItem(itemId: string): Promise<Cart> {
    return api.delete<Cart>(`/v1/cart/items/${itemId}`, { auth: true });
  },

  async applyCoupon(code: string): Promise<Cart> {
    return api.post<Cart>('/v1/cart/coupon', { code }, { auth: true });
  },

  async setBranch(branchId: string): Promise<Cart> {
    return api.post<Cart>('/v1/cart/branch', { branch_id: branchId }, { auth: true });
  },

  async setDelivery(input: {
    delivery_date?: string;
    delivery_slot_id?: string;
    delivery_address_id?: string;
    delivery_method?: 'delivery' | 'pickup';
  }): Promise<Cart> {
    return api.post<Cart>('/v1/cart/delivery', input, { auth: true });
  },
};

export const checkoutApi = {
  async createOrder(input: {
    payment_method: 'mpesa' | 'card';
    order_note?: string;
    coupon_code?: string;
    use_loyalty_points?: boolean;
    contact_phone?: string;
  }): Promise<Order> {
    return api.post<Order>('/v1/checkout', input, { auth: true });
  },

  // (Activation required: M-Pesa credentials must be configured server-side.)
  async initiateMpesaPayment(orderId: string, phone: string): Promise<{ checkout_request_id: string; message: string }> {
    return api.post<{ checkout_request_id: string; message: string }>(
      '/v1/payments/mpesa/initiate',
      { order_id: orderId, phone },
      { auth: true },
    );
  },

  // (Activation required: Card provider credentials must be configured server-side.)
  async initiateCardPayment(orderId: string): Promise<{ payment_url: string; checkout_request_id: string }> {
    return api.post<{ payment_url: string; checkout_request_id: string }>(
      '/v1/payments/card/initiate',
      { order_id: orderId },
      { auth: true },
    );
  },
};

export const orderApi = {
  async getOrders(params: { status?: string; page?: number; page_size?: number } = {}): Promise<{
    items: Order[];
    total: number;
    has_more: boolean;
  }> {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    query.set('page', String(params.page ?? 1));
    query.set('page_size', String(params.page_size ?? 20));
    return api.get<{ items: Order[]; total: number; has_more: boolean }>(`/v1/orders?${query.toString()}`, {
      auth: true,
    });
  },

  async getOrder(id: string): Promise<Order> {
    return api.get<Order>(`/v1/orders/${id}`, { auth: true });
  },

  async cancelOrder(id: string, reason?: string): Promise<Order> {
    return api.post<Order>(`/v1/orders/${id}/cancel`, { reason }, { auth: true });
  },

  async reorder(orderId: string): Promise<Cart> {
    return api.post<Cart>(`/v1/orders/${orderId}/reorder`, {}, { auth: true });
  },
};