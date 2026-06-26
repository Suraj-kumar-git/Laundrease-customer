// lib/cart-store.ts
// Pure helpers for the client-side shared cart (see components/cart-provider.tsx).
// The cart lives in localStorage for everyone (guest or signed-in) and is only
// pushed to the server (POST /api/customer/cart) at two specific moments:
//   1. Right after a guest logs in, if they have local items pending.
//   2. When "Place Order" is clicked while signed in, right before navigating
//      into /customer/orders/create?resume=1.
// No polling, no per-keystroke API calls.

import type { CartLineItem } from '@/types/pricing'

export const CART_STORAGE_KEY = 'laundrease_cart_v1'

export function makeCartItemKey(productTypeId: number, serviceId: number) {
  return `${productTypeId}_${serviceId}`
}

export function loadCartFromStorage(): CartLineItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCartToStorage(items: CartLineItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore quota/serialization errors — cart just won't persist this time
  }
}

export function clearCartStorage() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CART_STORAGE_KEY)
}

export function calcLineTotal(
  item: Pick<CartLineItem, 'pricing_model' | 'unit_price' | 'quantity' | 'weight_kg' | 'is_express' | 'express_multiplier'>
) {
  const base =
    item.pricing_model === 'per_kg'
      ? item.unit_price * item.weight_kg
      : item.unit_price * item.quantity
  return item.is_express ? base * item.express_multiplier : base
}

// Maps GET /api/customer/cart's `items` rows back into CartLineItem — used
// to hydrate local state from a cart that already exists server-side (e.g.
// built earlier via the full order-creation flow).
export function serverItemsToCartLineItems(items: any[]): CartLineItem[] {
  return items.map(item => ({
    product_type_id:    item.product_type_id,
    product_type_name:  item.product_type_name,
    pricing_model:      item.pricing_model,
    icon:                item.icon,
    service_id:          item.service_id,
    service_name:        item.service_name,
    unit_price:          item.unit_price,
    quantity:            item.quantity ?? 1,
    weight_kg:           item.weight_kg ?? 1,
    is_express:          item.is_express,
    express_multiplier:  item.express_multiplier,
    line_total:          item.line_total,
  }))
}

// Shape expected by POST /api/customer/cart's `selected_services` field
// (see app/api/customer/orders/create's SelectedService / cart route.ts).
export function cartItemsToSelectedServices(items: CartLineItem[]) {
  return items.map(item => ({
    type:               item.pricing_model,
    service_id:         item.service_id,
    service_name:       item.service_name,
    product_type_id:    item.product_type_id,
    product_type_name:  item.product_type_name,
    icon:               item.icon,
    quantity:           item.quantity,
    weight_kg:          item.weight_kg,
    unit_price:         item.unit_price,
    line_total:         item.line_total,
    is_express:         item.is_express,
    express_multiplier: item.express_multiplier,
  }))
}
