// app/customer/orders/types.ts

// ---- Address ------------------------------------------------
export interface Address {
  id: number
  label: string
  address_line1: string
  address_line2?: string
  landmark?: string
  neighborhood?: string
  city: string
  state?: string
  postal_code: string
  country_code: string
  latitude?: number
  longitude?: number
  instructions?: string
  contact_name?: string
  contact_phone?: string
  is_default: boolean
  validated: boolean
  position: {
    lat: number;
    lng: number;
  };
}

// ---- Provider -----------------------------------------------

// Delivery-fee preview shown on a provider card, before any items are
// selected (no subtotal known yet) — derived server-side from two
// calculate_order_fees() calls (worst-case and MOV-met subtotals). See
// app/api/customer/laundry-providers/search/route.ts.
export interface DeliveryFeePreview {
  state: 'free' | 'free_above' | 'fee'
  amount: number | null            // 0 for 'free'; low-subtotal fee for 'free_above' (subtitle use); guaranteed min fee for 'fee'
  free_above_amount: number | null // populated only for 'free_above'
}

export interface LaundryProvider {
  id: number
  user_id: number
  business_name: string
  /**
   * Which branch of that business, e.g. "Wakad".
   *
   * A provider with several branches appears once per branch, each with its
   * own distance, delivery fee and rating. Null for older rows that never got
   * a label.
   */
  branch_name?: string | null
  business_address: string
  service_area: string
  capacity: number
  city: string
  postal_code?: string
  rating_count: number
  operating_hours: Record<string, { open: string; close: string } | 'closed'>
  certifications: string[]
  services_offered: string[]
  rating: number
  distance_km?: number | null // server-calculated, from the customer's selected address
  delivery_fee_preview?: DeliveryFeePreview | null
  estimated_delivery_time?: string // calculated based on turnaround
  is_verified: boolean
  logo_url?: string | null
}

// ---- Services -----------------------------------------------

// Per-kg service (Tab 1)
export interface KgService {
  service_id: number
  service_name: string
  category: string
  description: string | null
  price_per_kg: number          // provider override > base price (selling price)
  mrp_per_kg?: number | null    // provider-set MRP — strikethrough display only
  is_express_available: boolean
  express_multiplier: number
  turnaround_hours: number
}

// Per-unit product type (Tab 2)
export interface UnitProduct {
  product_type_id: number
  product_type_name: string
  display_category: string
  icon: string
  service_id: number
  service_name: string
  unit_price: number            // provider override > base price (selling price)
  mrp?: number | null           // provider-set MRP — strikethrough display only
  is_express_available: boolean
  express_multiplier: number
}

// A selected per-kg line item
/**
 * A product charged by measured area (carpets).
 *
 * Carries a RATE, not a price — the amount only exists once the delivery
 * partner measures the item at pickup, which is why this cannot be folded into
 * UnitProduct: a per-unit line can be totalled in the cart and this one cannot.
 */
export interface SqftProduct {
  product_type_id: number
  product_type_name: string
  display_category: string | null
  icon: string | null
  service_id: number
  service_name: string
  price_per_sqft: number
  mrp_per_sqft: number | null
  is_express_available: boolean
  express_multiplier: number
}

export interface SelectedService {
  // null for per_kg items — they aren't tied to a single garment type;
  // the backend resolves the shared "mixed load" product type instead.
  product_type_id: number | null
  express_multiplier: number
  service_id: number
  service_name: string
  weight_kg: number
  unit_price: number
  mrp?: number | null
  is_express: boolean
  line_total: number
  quantity: number
  product_type_name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any
  type: string
}

// ---- Schedule -----------------------------------------------
export interface TimeSlot {
  id: string
  label: string
  start_time: string
  end_time: string
  available: boolean
}

// ---- Coupon -------------------------------------------------
export interface Coupon {
  code: string
  name: string
  description: string
  discount_type: 'flat' | 'percent'
  discount_value: number
  max_discount?: number
  min_order_amount?: number
  starts_at: string
  ends_at: string
  is_active: boolean
}

export interface AppliedCoupon extends Coupon {
  discount_amount: number
}

// ---- Order summary ------------------------------------------
export interface OrderPriceSummary {
  subtotal: number
  delivery_fee: number
  tax_amount: number
  discount_amount: number
  coupon_code?: string
  total_amount: number
}

// ---- Payment ------------------------------------------------
export interface GatewayInfo {
  gateway_configured: boolean
  provider: 'payu' | 'razorpay' | 'cashfree'
  cod_enabled: boolean
  cod_max_amount: number
  environment?: 'sandbox' | 'prod'
}

// ---- Cart (DB-backed) ---------------------------------------
export interface CartSummary {
  item_count: number
  subtotal: number
  has_active_cart: boolean
}

// ---- Full order flow state ----------------------------------
// Step 1: Address + Provider
// Step 2: Services (per-kg + per-unit)
// Step 3: Schedule
// Step 4: Checkout (Summary + Coupon + Payment)
// Step 5: Confirmation (not counted as a "step")

export type OrderFlowStep = 1 | 2 | 3 | 4

export interface OrderSummary {
  services: SelectedService[]
  subtotal: number
  delivery_fee: number
  tax_amount: number
  discount_amount: number
  coupon_code?: string
  total_amount: number
}

export interface OrderFlowState {
  step: OrderFlowStep
  // Step 1
  pickup_address?: Address
  delivery_address?: Address
  same_address: boolean
  selected_provider?: LaundryProvider
  // Step 2
  selected_services: SelectedService[]
  // Step 3
  pickup_date?: string
  pickup_time_slot?: string
  // Step 4
  applied_coupon?: AppliedCoupon
  payment_method?: string
  special_instructions?: string
  customer_gstin?: string
  order_summary?: OrderSummary
  // Post-submit
  order_id?: string
  order_number?: string
  is_express?: boolean
  draft_order_number?: string
}
