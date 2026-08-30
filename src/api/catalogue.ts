import { api } from './client';
import type {
  AddOn,
  Branch,
  DeliverySlot,
  Product,
  ProductCategory,
  ProductPage,
  ProductQueryParams,
  PromotionalBanner,
  Review,
} from '@/domain/commerce';

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const catalogueApi = {
  async getProducts(params: ProductQueryParams = {}): Promise<ProductPage> {
    return api.get<ProductPage>(
      `/v1/products${buildQuery({
        search: params.search,
        category: params.category,
        branch: params.branch,
        min_price: params.min_price,
        max_price: params.max_price,
        eggless: params.eggless === undefined ? undefined : params.eggless ? 'true' : 'false',
        available: params.available === undefined ? undefined : params.available ? 'true' : 'false',
        size: params.size,
        min_rating: params.min_rating,
        page: params.page ?? 1,
        page_size: params.page_size ?? 24,
      })}`,
    );
  },

  async getProduct(id: string): Promise<Product> {
    return api.get<Product>(`/v1/products/${id}`);
  },

  async getCategories(): Promise<ProductCategory[]> {
    return api.get<ProductCategory[]>('/v1/categories');
  },

  async getBanners(): Promise<PromotionalBanner[]> {
    return api.get<PromotionalBanner[]>('/v1/promotions/banners');
  },

  async getProductReviews(productId: string): Promise<Review[]> {
    return api.get<Review[]>(`/v1/products/${productId}/reviews`);
  },

  async getAddOns(productId: string): Promise<AddOn[]> {
    return api.get<AddOn[]>(`/v1/products/${productId}/addons`);
  },
};

export const branchApi = {
  async getBranches(): Promise<Branch[]> {
    return api.get<Branch[]>('/v1/branches');
  },

  async getNearbyBranches(latitude: number, longitude: number): Promise<Branch[]> {
    return api.get<Branch[]>(`/v1/branches/nearby?lat=${latitude}&lng=${longitude}`);
  },

  async getDeliverySlots(branchId: string, date: string): Promise<DeliverySlot[]> {
    return api.get<DeliverySlot[]>(`/v1/branches/${branchId}/delivery-slots?date=${date}`);
  },
};