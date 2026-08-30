import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem } from '@/domain/commerce';

type CartState = {
  /** Device-local draft cart items shown while the server cart is loading. */
  localItems: CartItem[];
  serverCartId: string | null;
  couponCode: string | null;
  branchId: string | null;
  deliveryDate: string | null;
  deliverySlotId: string | null;
  deliveryAddressId: string | null;
  deliveryMethod: 'delivery' | 'pickup';
  addLocalItem: (item: CartItem) => void;
  removeLocalItem: (productId: string, variantId: string) => void;
  updateLocalQuantity: (productId: string, variantId: string, quantity: number) => void;
  clearLocal: () => void;
  setServerCart: (cartId: string | null) => void;
  setCoupon: (code: string | null) => void;
  setBranch: (branchId: string | null) => void;
  setDelivery: (input: { date?: string | null; slotId?: string | null; addressId?: string | null; method?: 'delivery' | 'pickup' }) => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      localItems: [],
      serverCartId: null,
      couponCode: null,
      branchId: null,
      deliveryDate: null,
      deliverySlotId: null,
      deliveryAddressId: null,
      deliveryMethod: 'delivery',

      addLocalItem: (item) =>
        set((state) => {
          const existing = state.localItems.find(
            (i) => i.product_id === item.product_id && i.variant_id === item.variant_id,
          );
          if (existing) {
            return {
              localItems: state.localItems.map((i) =>
                i.product_id === item.product_id && i.variant_id === item.variant_id
                  ? { ...i, quantity: i.quantity + item.quantity, line_total: i.line_total + item.line_total }
                  : i,
              ),
            };
          }
          return { localItems: [...state.localItems, item] };
        }),

      removeLocalItem: (productId, variantId) =>
        set((state) => ({
          localItems: state.localItems.filter(
            (i) => !(i.product_id === productId && i.variant_id === variantId),
          ),
        })),

      updateLocalQuantity: (productId, variantId, quantity) =>
        set((state) => ({
          localItems: state.localItems.map((i) =>
            i.product_id === productId && i.variant_id === variantId
              ? { ...i, quantity, line_total: i.unit_price * quantity }
              : i,
          ),
        })),

      clearLocal: () => set({ localItems: [], serverCartId: null, couponCode: null }),
      setServerCart: (cartId) => set({ serverCartId: cartId }),
      setCoupon: (code) => set({ couponCode: code }),
      setBranch: (branchId) => set({ branchId }),
      setDelivery: (input) =>
        set((state) => ({
          deliveryDate: input.date !== undefined ? input.date : state.deliveryDate,
          deliverySlotId: input.slotId !== undefined ? input.slotId : state.deliverySlotId,
          deliveryAddressId: input.addressId !== undefined ? input.addressId : state.deliveryAddressId,
          deliveryMethod: input.method ?? state.deliveryMethod,
        })),
    }),
    {
      name: 'cakecity.cart',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);