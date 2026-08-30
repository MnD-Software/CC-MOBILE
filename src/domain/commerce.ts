// Domain models for the Cake City mobile commerce platform.
// These mirror the authoritative API contracts from the Cake City FastAPI platform.

export type Money = number; // KSh (minor-unit-free representation)

export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image?: string | null;
};

export type ProductVariant = {
  id: string;
  name: string; // e.g. "1kg", "1.5kg", "2kg"
  price: Money;
  compare_at_price?: Money | null;
  eggless: boolean;
  available: boolean;
  preparation_minutes: number;
};

export type ProductImage = {
  id: string;
  src: string;
  alt?: string;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description?: string;
  category_id: string | null;
  category_name?: string;
  images: ProductImage[];
  primary_image?: string | null;
  variants: ProductVariant[];
  min_price: Money;
  max_price: Money;
  rating_avg?: number | null;
  review_count?: number;
  available: boolean;
  badge?: string | null;
  attributes: Record<string, string | number | boolean>;
  addons?: AddOn[];
  branch_availability: string[]; // branch IDs
  delivery_eligible: boolean;
  preparation_minutes: number;
  created_at: string;
  updated_at: string;
};

export type AddOn = {
  id: string;
  name: string;
  price: Money;
  description?: string;
};

export type ProductQueryParams = {
  search?: string;
  category?: string;
  branch?: string;
  min_price?: number;
  max_price?: number;
  eggless?: boolean;
  available?: boolean;
  size?: string;
  min_rating?: number;
  page?: number;
  page_size?: number;
};

export type ProductPage = {
  items: Product[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
};

export type Branch = {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  operating_hours: Record<string, string>;
  delivery_zones: string[];
  distance_km?: number;
  estimated_delivery_minutes?: number;
};

export type DeliverySlot = {
  id: string;
  branch_id: string;
  date: string;
  start_time: string;
  end_time: string;
  available: boolean;
};

export type AddOnSelection = {
  addon_id: string;
  name: string;
  price: Money;
};

export type CartItem = {
  product_id: string;
  product_name: string;
  image?: string | null;
  variant_id: string;
  variant_name: string;
  unit_price: Money;
  compare_at_price?: Money | null;
  eggless: boolean;
  quantity: number;
  cake_message?: string;
  addons: AddOnSelection[];
  line_total: Money;
};

export type CartTotals = {
  subtotal: Money;
  delivery_fee: Money;
  discount: Money;
  loyalty_credit: Money;
  tax: Money;
  total: Money;
};

export type Cart = {
  id: string;
  items: CartItem[];
  totals: CartTotals;
  coupon_code?: string | null;
  branch_id?: string | null;
  delivery_date?: string | null;
  delivery_slot_id?: string | null;
  delivery_address_id?: string | null;
};

export type Address = {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  phone: string;
  latitude?: number | null;
  longitude?: number | null;
  is_default: boolean;
};

export type DeliveryMethod = 'delivery' | 'pickup';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'ASSIGNED_TO_DRIVER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type OrderItem = {
  product_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: Money;
  line_total: Money;
  image?: string | null;
};

export type Order = {
  id: string;
  reference: string;
  status: OrderStatus;
  branch_name?: string;
  delivery_method: DeliveryMethod;
  delivery_address?: string | null;
  items: OrderItem[];
  subtotal: Money;
  delivery_fee: Money;
  discount: Money;
  loyalty_credit: Money;
  tax: Money;
  total: Money;
  payment_method?: string;
  payment_status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  placed_at: string;
  estimated_delivery?: string | null;
  tracking_events?: OrderTrackingEvent[];
};

export type OrderTrackingEvent = {
  status: OrderStatus;
  label: string;
  occurred_at: string;
  note?: string | null;
};

export type LoyaltyAccount = {
  points_balance: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  points_to_next_tier: number;
  lifetime_points: number;
};

export type LoyaltyTransaction = {
  id: string;
  type: 'EARN' | 'REDEEM' | 'ADJUST' | 'EXPIRE';
  points: number;
  description: string;
  created_at: string;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  image?: string | null;
  active: boolean;
};

export type Celebration = {
  id: string;
  person_name: string;
  occasion: 'BIRTHDAY' | 'ANNIVERSARY' | 'OTHER';
  event_date: string;
  favorite_cake?: string | null;
  preferred_size?: string | null;
  delivery_address_id?: string | null;
  notes?: string | null;
};

export type NotificationPreference = {
  order_updates: boolean;
  delivery: boolean;
  promotions: boolean;
  rewards: boolean;
  birthdays: boolean;
  abandoned_cart: boolean;
  recommendations: boolean;
};

export type AppNotification = {
  id: string;
  type: 'ORDER' | 'DELIVERY' | 'PROMOTION' | 'REWARD' | 'BIRTHDAY' | 'CART' | 'OPERATIONAL';
  title: string;
  body: string;
  deep_link?: string | null;
  read: boolean;
  created_at: string;
};

export type CustomCakeRequest = {
  id: string;
  occasion: string;
  cake_size: string;
  flavour?: string | null;
  eggless: boolean;
  design_style?: string | null;
  colors?: string | null;
  message?: string | null;
  reference_image_url?: string | null;
  delivery_date: string;
  delivery_location?: string | null;
  budget: Money;
  special_instructions?: string | null;
  status: 'REQUESTED' | 'UNDER_REVIEW' | 'QUOTE_SENT' | 'CUSTOMER_APPROVED' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY' | 'DELIVERED' | 'CANCELLED';
  created_at: string;
};

export type SupportConversation = {
  id: string;
  topic: string;
  status: 'OPEN' | 'WAITING_CUSTOMER' | 'WAITING_STAFF' | 'RESOLVED';
  messages: SupportMessage[];
  created_at: string;
};

export type SupportMessage = {
  id: string;
  role: 'customer' | 'agent' | 'ai';
  body: string;
  created_at: string;
};

export type PromotionalBanner = {
  id: string;
  title: string;
  subtitle?: string;
  image?: string | null;
  deep_link?: string | null;
  active: boolean;
};

export type Review = {
  id: string;
  product_id: string;
  product_name: string;
  rating: number;
  title?: string;
  body: string;
  cake_quality?: number;
  delivery_rating?: number;
  packaging_rating?: number;
  branch_service?: number;
  customer_name: string;
  order_id?: string;
  created_at: string;
};

export function formatMoney(value: Money) {
  return `KSh ${value.toLocaleString('en-KE')}`;
}