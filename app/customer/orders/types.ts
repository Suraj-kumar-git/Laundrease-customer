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
 
export interface LaundryProvider {
  id: number
  user_id: number
  business_name: string
  business_address: string
  service_area: string
  capacity: number
  city: string
  rating_count: number
  operating_hours: Record<string, { open: string; close: string } | 'closed'>
  certifications: string[]
  services_offered: string[]
  rating: number
  distance?: number // calculated on frontend
  estimated_delivery_time?: string // calculated based on turnaround
}
 
export interface Service {
  id: number
  name: string
  description: string
  category: string
  base_price: number
  price_per_kg: number | null
  turnaround_hours: number
  is_express_available: boolean
  express_multiplier: number
  // Provider-specific overrides (if any)
  provider_price?: number
  provider_price_per_kg?: number
  provider_turnaround?: number
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
 
export interface TimeSlot {
  id: string
  label: string
  start_time: string
  end_time: string
  available: boolean
}
 
export interface OrderSummary {
  services: SelectedService[]
  subtotal: number
  delivery_fee: number
  tax_amount: number
  discount_amount: number
  coupon_code?: string
  total_amount: number
}
 
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
 
export interface PaymentMethod {
  id: string
  name: string
  type: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod'
  icon: string
  enabled: boolean
  details?: string
}
 
export interface CreateOrderData {
  customer_id: number
  laundry_profile_id: number
  pickup_address: string // Serialized address
  delivery_address: string // Serialized address
  pickup_date: string
  pickup_time_slot: string
  delivery_date?: string
  special_instructions?: string
  is_express: boolean
  services: SelectedService[]
  payment_method: string
  coupon_code?: string
}
 
export interface OrderResponse {
  success: boolean
  order_id?: number
  order_number?: string
  message?: string
  payment_required?: boolean
  payment_url?: string
}
 
// Order Flow State Management
export interface OrderFlowState {
  order_id?: number
  order_number?: string
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  same_address?: boolean
  pickup_address?: Address
  delivery_address?: Address
  selected_provider?: LaundryProvider
  selected_services: SelectedService[]
  pickup_date?: string
  pickup_time_slot?: string
  order_summary?: OrderSummary
  applied_coupon?: AppliedCoupon
  payment_method?: string
  special_instructions?: string
  is_express?: boolean
  draft_order_number?: string
}
 
// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
 
export interface AddressListResponse {
  addresses: Address[]
  default_address?: Address
}
 
export interface ProviderListResponse {
  providers: LaundryProvider[]
  total: number
}
 
export interface ServiceListResponse {
  services: Service[]
  provider_id: number
}
 
export interface CouponValidationResponse {
  valid: boolean
  coupon?: AppliedCoupon
  message?: string
  discount_amount?: number
}
 
export interface PriceCalculationRequest {
  provider_id: number
  services: Array<{
    service_id: number
    weight_kg: number
    is_express: boolean
  }>
  postal_code: string
  coupon_code?: string
}
 
export interface PriceCalculationResponse {
  subtotal: number
  delivery_fee: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  breakdown: Array<{
    service_name: string
    weight_kg: number
    unit_price: number
    line_total: number
    is_express: boolean
  }>
}

export interface GatewayInfo {
  gateway_configured: boolean
  provider: 'payu' | 'razorpay' | 'cashfree'
  cod_enabled: boolean
  cod_max_amount: number
  environment?: 'sandbox' | 'prod'
}