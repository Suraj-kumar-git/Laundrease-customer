// ============================================================
// Pricing Calculator & Quick Pickup — Type Definitions
// ============================================================

// ---- Pricing ------------------------------------------------

// per_sqft: priced by measured area (carpets). The measurement does not exist
// until the delivery partner takes it at pickup, so a per_sqft line is worth
// ₹0 in the cart and at checkout — the customer is shown the rate instead.
export type PricingModel = 'per_kg' | 'per_unit' | 'per_sqft'
export type DisplayCategory = 'everyday' | 'ethnic_formal' | 'household' | 'specialty'
export type ServiceCategory =
  | 'wash_fold'
  | 'dry_cleaning'
  | 'steam_ironing'
  | 'wash_iron'
  | 'stain_removal'
  | 'shoe_cleaning'

export const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  everyday:      'Everyday Clothes',
  ethnic_formal: 'Ethnic & Formal',
  household:     'Household Items',
  specialty:     'Specialty Items',
}

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  wash_fold:     'Wash & Fold',
  dry_cleaning:  'Dry Cleaning',
  steam_ironing: 'Steam Ironing',
  wash_iron:     'Wash & Iron',
  stain_removal: 'Stain Removal',
  shoe_cleaning: 'Shoe Cleaning',
}

// A service as returned by the API
export interface PricingService {
  id: number
  name: string
  description: string
  category: ServiceCategory
  turnaround_hours: number
  is_express_available: boolean
  express_multiplier: number
}

// A product type with its price for a specific service
export interface PricingProductType {
  id: number
  name: string
  description: string | null
  pricing_model: PricingModel
  display_category: DisplayCategory
  icon: string
  sort_order: number
  unit_price: number   // selling price for this (product, service) combo
  // Provider-set MRP, only present when the provider has overridden their
  // price for this combo. Null = no strikethrough, behave as before.
  mrp?: number | null
}

// Grouped by service: service → available product types with prices
export interface ServiceWithProducts {
  service: PricingService
  product_types: PricingProductType[]
}

// Full API response from GET /api/customer/public/pricing/services-by-area
export interface AreaPricingData {
  covered: boolean
  pincode: string
  city: string | null
  provider_count: number
  // Set when pricing was resolved for one specific provider (via ?provider_id=)
  // rather than the platform base price across the whole area.
  provider: { id: number; name: string } | null
  services: ServiceWithProducts[]
}

// ---- Calculator state ---------------------------------------

// One line item in the calculator
export interface CartLineItem {
  product_type_id: number
  product_type_name: string
  pricing_model: PricingModel
  icon: string
  service_id: number
  service_name: string
  unit_price: number
  // Provider-set MRP (strikethrough display only — never used in math).
  // Null = no strikethrough.
  mrp?: number | null
  // For per_unit: quantity; for per_kg: weight in kg
  quantity: number   // per_unit count
  weight_kg: number  // per_kg weight
  is_express: boolean
  express_multiplier: number
  line_total: number
}

// ---- Provider (for Quick Pickup) ----------------------------

export interface NearbyProvider {
  id: number
  business_name: string
  city: string | null
  postal_code: string | null
  rating: number
  services_offered: string[] | null
  contact_person_name: string | null
  contact_person_phone: string | null
  address_line1: string | null
  landmark: string | null
}

export interface ProvidersNearbyData {
  covered: boolean
  pincode: string
  city: string | null
  providers: NearbyProvider[]
}

// ---- Quick Pickup Form --------------------------------------

export type ServiceType = 'standard' | 'express'
export type RequestMode = 'callback' | 'direct_call'

export interface QuickPickupFormData {
  full_name: string
  phone: string
  email: string
  pincode: string
  city: string
  service_type: ServiceType
  services_interested: string[]
  notes: string
  request_mode: RequestMode
  preferred_provider_id?: number | null
  source: string
}
