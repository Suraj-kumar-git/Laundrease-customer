'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Search, MapPin, Plus, Minus,
  Zap, Clock, ShoppingBag, Trash2, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Info, Star, Home, Globe, Store, ArrowLeftRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { FooterPageLayout, PageSection } from '@/components/layout/footer-page-layout'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { ProviderPicker, type PickableProvider } from './components/ProviderPicker'
import { MyAddressStep } from './components/MyAddressStep'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveProductIconSrc } from '@/lib/product-icons'
import { calcLineTotal, cartItemsToSelectedServices, CALC_PENDING_CHECKOUT_KEY } from '@/lib/cart-store'
import type {
  AreaPricingData, PricingProductType,
  CartLineItem, PricingModel, ServiceCategory,
} from '@/types/pricing'
import { CATEGORY_LABELS, SERVICE_CATEGORY_LABELS } from '@/types/pricing'
import { useFeatureFlags } from '@/components/feature-flags'

// ---- Isolated "calculator cart" ------------------------------
// Deliberately NOT the shared useCart()/CartProvider — items picked here
// are just for estimating a price, not a real cart, so they must never
// show up in the header's cart icon/sheet. Kept in sessionStorage (not the
// shared cart's localStorage key) so it survives opening/closing the real
// CartSheet (which is an overlay, not a navigation) without ever touching
// the real cart — only "Place Order" below pushes these into the real cart.
const CALC_CART_STORAGE_KEY = 'laundrease_pricing_calc_cart_v1'

// Set when a signed-OUT visitor hits "Place Order". Survives the round trip
// through login/register (same tab), so the moment they come back
// authenticated we can push exactly what they'd picked — items, provider and
// address — into their real server cart instead of dropping it on the floor
// (which is what used to happen: they'd land back on a reset calculator with
// their selection apparently gone).
//
// The key itself lives in lib/cart-store.ts because the cart provider also
// reads it: while a flush is pending it must skip its own guest→server push,
// which would otherwise race this one and clobber the provider/address here.

interface PendingCheckout {
  items:      CartLineItem[]
  isExpress:  boolean
  providerId: number | null
  addressId:  number | null
}

/** Provider/address the calculator resolved, carried into the server cart. */
interface PlaceOrderContext {
  providerId: number | null
  addressId:  number | null
}

function savePendingCheckout(p: PendingCheckout) {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(CALC_PENDING_CHECKOUT_KEY, JSON.stringify(p)) } catch {}
}

function loadPendingCheckout(): PendingCheckout | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(CALC_PENDING_CHECKOUT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return Array.isArray(p?.items) && p.items.length > 0 ? p as PendingCheckout : null
  } catch { return null }
}

function clearPendingCheckout() {
  if (typeof window === 'undefined') return
  try { window.sessionStorage.removeItem(CALC_PENDING_CHECKOUT_KEY) } catch {}
}

function loadCalcCart(): { items: CartLineItem[]; isExpress: boolean } {
  if (typeof window === 'undefined') return { items: [], isExpress: false }
  try {
    const raw = window.sessionStorage.getItem(CALC_CART_STORAGE_KEY)
    if (!raw) return { items: [], isExpress: false }
    const parsed = JSON.parse(raw)
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      isExpress: !!parsed.isExpress,
    }
  } catch {
    return { items: [], isExpress: false }
  }
}

function saveCalcCart(items: CartLineItem[], isExpress: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CALC_CART_STORAGE_KEY, JSON.stringify({ items, isExpress }))
  } catch { /* ignore quota/serialization errors */ }
}

function usePricingCalculatorCart() {
  const router = useRouter()
  const { user } = useAuth()
  // Lazy initializers — read sessionStorage exactly once, on first render.
  const [items, setItems] = useState<CartLineItem[]>(() => loadCalcCart().items)
  const [isExpress, setIsExpress] = useState<boolean>(() => loadCalcCart().isExpress)
  const [placing, setPlacing] = useState(false)

  const persist = useCallback((nextItems: CartLineItem[], nextExpress: boolean) => {
    saveCalcCart(nextItems, nextExpress)
  }, [])

  const addItem = useCallback((item: Omit<CartLineItem, 'line_total' | 'is_express' | 'express_multiplier'> & { express_multiplier?: number }) => {
    setItems(prev => {
      const key = `${item.product_type_id}_${item.service_id}`
      const expressMultiplier = item.express_multiplier ?? 1.5
      const lineTotal = calcLineTotal({
        pricing_model: item.pricing_model,
        unit_price: item.unit_price,
        quantity: item.quantity,
        weight_kg: item.weight_kg,
        is_express: isExpress,
        express_multiplier: expressMultiplier,
      })
      const next = prev.filter(i => `${i.product_type_id}_${i.service_id}` !== key)
      next.push({ ...item, is_express: isExpress, express_multiplier: expressMultiplier, line_total: lineTotal })
      persist(next, isExpress)
      return next
    })
  }, [isExpress, persist])

  const updateItem = useCallback((key: string, field: 'quantity' | 'weight_kg', value: number) => {
    setItems(prev => {
      const next = prev.map(item => {
        if (`${item.product_type_id}_${item.service_id}` !== key) return item
        const updated = { ...item, [field]: value }
        updated.line_total = calcLineTotal(updated)
        return updated
      })
      persist(next, isExpress)
      return next
    })
  }, [isExpress, persist])

  const removeItem = useCallback((key: string) => {
    setItems(prev => {
      const next = prev.filter(item => `${item.product_type_id}_${item.service_id}` !== key)
      persist(next, isExpress)
      return next
    })
  }, [isExpress, persist])

  const clear = useCallback(() => {
    setItems([])
    persist([], isExpress)
  }, [isExpress, persist])

  const toggleExpress = useCallback(() => {
    setIsExpress(prev => {
      const next = !prev
      setItems(current => {
        const updatedItems = current.map(item => {
          const updated = { ...item, is_express: next }
          updated.line_total = calcLineTotal(updated)
          return updated
        })
        persist(updatedItems, next)
        return updatedItems
      })
      return next
    })
  }, [persist])

  // Pushes the calculator's selection into the real server cart, carrying the
  // provider (and the address, when the visitor reached here via "Use my
  // saved address") so the order flow can resume as deep as possible.
  //
  // Sending provider_id matters beyond convenience: the order flow's
  // "switch provider?" guard is gated on cart.provider being set, so a cart
  // pushed WITHOUT it let a customer pick a different provider at step 1 and
  // silently carry over services that provider may not even offer.
  const pushToServerCart = useCallback(async (ctx: PlaceOrderContext, itemsToPush: CartLineItem[], express: boolean) => {
    await fetch('/api/customer/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        selected_services: cartItemsToSelectedServices(itemsToPush),
        is_express:        express,
        provider_id:       ctx.providerId ?? undefined,
        address_id:        ctx.addressId  ?? undefined,
        // Provider + address + services are all settled, so the flow can pick
        // up at Schedule Pickup. Without an address it has to fall back to
        // step 1 to collect one — the order can't be placed without it.
        current_step:      ctx.addressId != null ? 3 : 1,
      }),
    })
  }, [])

  const placeOrder = useCallback(async (ctx: PlaceOrderContext) => {
    if (items.length === 0) return

    // Signed out: stash the whole intent (items + provider + address) and send
    // them to sign in. The calculator page flushes it to the server cart the
    // moment they come back authenticated — see the pending-checkout effect in
    // PricingCalculatorPage.
    if (!user) {
      savePendingCheckout({ items, isExpress, providerId: ctx.providerId ?? null, addressId: ctx.addressId ?? null })
      router.push('/customer/auth/login?returnTo=/customer/pricing-calculator')
      return
    }

    setPlacing(true)
    try {
      await pushToServerCart(ctx, items, isExpress)
      // Now that they're committed to ordering, clear the calculator's local
      // copy — the real cart (pushed above) is the source of truth from here.
      clear()
      router.push('/customer/orders/create?resume=1')
    } finally {
      setPlacing(false)
    }
  }, [user, items, isExpress, router, clear, pushToServerCart])

  return { items, isExpress, toggleExpress, addItem, updateItem, removeItem, clear, placeOrder, placing, pushToServerCart }
}

// ---- Helpers ------------------------------------------------
function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function makeLineItemKey(productTypeId: number, serviceId: number) {
  return `${productTypeId}_${serviceId}`
}

// ---- Sub-components -----------------------------------------

function AreaSearchStep({
  onResult,
}: {
  // Was (data: AreaPricingData) — see handleSearch below for why this no
  // longer round-trips through services-by-area on this step.
  onResult: (result: { pincode?: string; city?: string; providers: PickableProvider[] }) => void
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notified, setNotified] = useState(false)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [uncoveredArea, setUncoveredArea] = useState<string | null>(null)

  const isPincode = /^\d{6}$/.test(input.trim())
  const isCity = input.trim().length >= 3

  const handleSearch = async () => {
    const val = input.trim()
    if (!val) return
    if (!isPincode && !isCity) {
      setError('Enter a 6-digit pincode or city name (min 3 characters)')
      return
    }
    setError(null)
    setLoading(true)
    setUncoveredArea(null)

    try {
      // laundry-providers/search's own coverage check (provider_service_areas
      // for a pincode, city ILIKE for a city) is the exact same query
      // services-by-area runs to produce its 'covered' flag — so calling
      // services-by-area here first was a second round trip just to re-learn
      // "are there zero providers", immediately followed by this same search
      // call to actually list them. Calling search directly gets both answers
      // in one request, and the providers it returns are handed straight to
      // the picker step instead of being fetched again there.
      const res = await fetch(`/api/customer/laundry-providers/search?location=${encodeURIComponent(val)}`)
      if (!res.ok) throw new Error('Request failed')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed')

      const providers: PickableProvider[] = (json.data.providers ?? []).map((p: any) => ({
        id: p.id,
        name: p.business_name,
        subtitle: p.business_address ?? p.city ?? '',
        rating: p.rating,
        ratingCount: p.rating_count,
        minPriceKg: p.min_price_kg,
      }))

      if (providers.length === 0) {
        setUncoveredArea(val)
      } else {
        onResult({ pincode: isPincode ? val : undefined, city: isPincode ? undefined : val, providers })
      }
    } catch {
      setError('Could not fetch pricing data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleNotify = async () => {
    if (!notifyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) return
    setNotifyLoading(true)
    try {
      await fetch('/api/customer/public/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: notifyEmail, source: 'area_waitlist' }),
      })
      setNotified(true)
    } finally {
      setNotifyLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Search */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Enter your area</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              We&apos;ll show services and pricing available near you
            </p>
          </div>
        </div>

        {/* Stacks on very narrow screens so the Check button never squeezes
            the input down to a few characters. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Pincode (411045) or city (Pune)"
              className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || (!isPincode && !isCity)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Checking...' : 'Check'}
          </button>
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
      </div>

      {/* Uncovered area state */}
      {uncoveredArea && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="mb-3 flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                We don&apos;t serve {uncoveredArea} yet
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                We&apos;re expanding fast. Leave your email and we&apos;ll notify you when Laundrease launches in your area.
              </p>
            </div>
          </div>
          {!notified ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 rounded-xl border border-amber-200 bg-white/80 px-4 py-2.5 text-sm outline-none focus:border-amber-400 dark:border-amber-800 dark:bg-amber-950/50"
              />
              <button
                onClick={handleNotify}
                disabled={notifyLoading}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {notifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Notify Me'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <CheckCircle2 className="h-4 w-4" />
              Got it! We&apos;ll email you when we launch in your area.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Item row -----------------------------------------------
function ItemRow({
  product,
  serviceId,
  serviceName,
  expressMultiplier,
  isExpressEnabled,
  cartItem,
  onAdd,
  onUpdate,
  onRemove,
}: {
  product: PricingProductType
  serviceId: number
  serviceName: string
  expressMultiplier: number
  isExpressEnabled: boolean
  cartItem: CartLineItem | undefined
  onAdd: (product: PricingProductType, serviceId: number, serviceName: string, expressMultiplier: number) => void
  onUpdate: (key: string, field: 'quantity' | 'weight_kg', value: number) => void
  onRemove: (key: string) => void
}) {
  const key = makeLineItemKey(product.id, serviceId)
  const inCart = !!cartItem

  const displayPrice = isExpressEnabled
    ? product.unit_price * expressMultiplier
    : product.unit_price

  const priceLabel =
    product.pricing_model === 'per_kg'
      ? `${formatINR(displayPrice)}/kg`
      : `${formatINR(displayPrice)}/pc`

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border px-4 py-3 transition-all',
        inCart
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/40 bg-card hover:border-border'
      )}
    >
      <ProductIcon
        src={resolveProductIconSrc(product.name)}
        fallbackEmoji={product.icon}
        alt={product.name}
        size={40}
        className="shrink-0 rounded-lg"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          {product.mrp && product.mrp > product.unit_price && (
            <span className="line-through mr-1">{formatINR(product.mrp)}</span>
          )}
          {priceLabel}
        </p>
      </div>

      {!inCart ? (
        <button
          onClick={() => onAdd(product, serviceId, serviceName, expressMultiplier)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {product.pricing_model === 'per_unit' ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (cartItem.quantity <= 1) onRemove(key)
                  else onUpdate(key, 'quantity', cartItem.quantity - 1)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-semibold">
                {cartItem.quantity}
              </span>
              <button
                onClick={() => onUpdate(key, 'quantity', cartItem.quantity + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            // Per-kg: weight input with 0.5 kg steps
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const next = Math.max(0.5, cartItem.weight_kg - 0.5)
                  if (next <= 0) onRemove(key)
                  else onUpdate(key, 'weight_kg', next)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-12 text-center text-sm font-semibold">
                {cartItem.weight_kg} kg
              </span>
              <button
                onClick={() => onUpdate(key, 'weight_kg', cartItem.weight_kg + 0.5)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => onRemove(key)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ---- Summary panel ------------------------------------------
function SummaryPanel({
  cartItems,
  isExpress,
  onToggleExpress,
  areaData,
  onClear,
  onPlaceOrder,
  placing,
}: {
  cartItems: CartLineItem[]
  isExpress: boolean
  onToggleExpress: () => void
  areaData: AreaPricingData
  onClear: () => void
  onPlaceOrder: () => void
  placing: boolean
}) {
  const { quickPickup } = useFeatureFlags()
  const total = cartItems.reduce((sum, item) => sum + item.line_total, 0)
  const itemCount = cartItems.reduce(
    (sum, item) =>
      item.pricing_model === 'per_unit' ? sum + item.quantity : sum + 1,
    0
  )

  // Group by service name for summary
  const byService = cartItems.reduce<Record<string, CartLineItem[]>>(
    (acc, item) => {
      acc[item.service_name] = acc[item.service_name] ?? []
      acc[item.service_name].push(item)
      return acc
    },
    {}
  )

  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/50 bg-primary/5 px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Your Estimate</h3>
          {cartItems.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Clear all
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {areaData.city || areaData.pincode} · {areaData.provider_count} provider
          {areaData.provider_count !== 1 ? 's' : ''}
        </p>
      </div>

      {cartItems.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <ShoppingBag className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            Add items to see your estimate
          </p>
        </div>
      ) : (
        <>
          {/* Express toggle */}
          <div className="border-b border-border/50 px-5 py-3">
            <button
              onClick={onToggleExpress}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all',
                isExpress
                  ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <span className="flex items-center gap-2">
                <Zap className={cn('h-4 w-4', isExpress ? 'text-amber-500' : '')} />
                Express Service
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  1.5x
                </span>
              </span>
              <div
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  isExpress ? 'bg-amber-500' : 'bg-muted-foreground/30'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                    isExpress ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </div>
            </button>
            {isExpress && (
              <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5" />
                Delivery within 12 hrs · 1.5x standard price
              </p>
            )}
          </div>

          {/* Items */}
          <div className="max-h-64 overflow-y-auto px-5 py-3">
            {Object.entries(byService).map(([serviceName, items]) => (
              <div key={serviceName} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {serviceName}
                </p>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <div
                      key={`${item.product_type_id}_${item.service_id}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-1.5 text-foreground/80">
                        <span>{item.icon}</span>
                        <span className="truncate max-w-[130px]">{item.product_type_name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.pricing_model === 'per_unit'
                            ? `×${item.quantity}`
                            : `${item.weight_kg}kg`}
                        </span>
                      </span>
                      <span className="font-medium text-foreground">
                        {formatINR(item.line_total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="border-t border-border/50 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Estimated total
                <span className="ml-1 text-xs">({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
              </span>
              <span className="text-xl font-bold text-foreground">{formatINR(total)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              * Final price may vary by provider
            </p>

            <div className="mt-4 space-y-2">
              <button
                onClick={onPlaceOrder}
                disabled={placing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-60"
              >
                {placing ? 'Placing...' : 'Place Order'}
                <ArrowRight className="h-4 w-4" />
              </button>
              {quickPickup && (
                <Link
                  href="/customer/quick-pickup"
                  className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <Zap className="h-4 w-4" />
                  Request Quick Pickup Instead
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Main calculator ----------------------------------------
function PricingCalculator({
  areaData, cart, selectedAddressId, switchNotice, onDismissNotice,
  onReset, onSwitchProvider, onUseBaseRates,
}: {
  areaData: AreaPricingData
  /** Saved-address id, when known — lets Place Order skip the address step. */
  selectedAddressId: number | null
  /** Set when a provider change dropped the previous selection. */
  switchNotice: string | null
  onDismissNotice: () => void
  // Lifted to the page level (not created here) so the provider-switch guard
  // in PricingCalculatorPage can inspect item count / clear it BEFORE this
  // component ever re-renders with a different provider's areaData.
  cart: ReturnType<typeof usePricingCalculatorCart>
  onReset: () => void
  // Shown when currently on base rates — lets the visitor pick a specific
  // provider to see exact pricing instead.
  onSwitchProvider?: () => void
  // Shown when currently viewing a specific provider's rates — switches
  // back to platform base rates for the same area.
  onUseBaseRates?: () => void
}) {
  const [activeServiceId, setActiveServiceId] = useState<number>(
    areaData.services[0]?.service.id ?? 0
  )
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const { isExpress } = cart

  const cartItemsByKey = useMemo(() => {
    const map = new Map<string, CartLineItem>()
    for (const item of cart.items) map.set(makeLineItemKey(item.product_type_id, item.service_id), item)
    return map
  }, [cart.items])

  const activeService = areaData.services.find((s) => s.service.id === activeServiceId)

  // Categories available for the active service
  const categories = useMemo(() => {
    if (!activeService) return []
    const cats = Array.from(
      new Set(activeService.product_types.map((p) => p.display_category))
    )
    return cats
  }, [activeService])

  const filteredProducts = useMemo(() => {
    if (!activeService) return []
    return activeCategory === 'all'
      ? activeService.product_types
      : activeService.product_types.filter((p) => p.display_category === activeCategory)
  }, [activeService, activeCategory])

  const handleAdd = useCallback(
    (product: PricingProductType, serviceId: number, serviceName: string, expressMultiplier: number) => {
      cart.addItem({
        product_type_id: product.id,
        product_type_name: product.name,
        pricing_model: product.pricing_model,
        icon: product.icon,
        service_id: serviceId,
        service_name: serviceName,
        unit_price: product.unit_price,
        mrp: product.mrp ?? null,
        quantity: 1,
        weight_kg: 1,
        express_multiplier: expressMultiplier,
      })
    },
    [cart]
  )

  const handleUpdate = cart.updateItem
  const handleRemove = cart.removeItem
  const handleToggleExpress = cart.toggleExpress
  const cartArray = cart.items

  return (
    <div>
      {/* Replaces the old confirm dialog: state the consequence after the
          fact instead of interrupting to ask about a selection we can't
          show them. Dismissible, and auto-irrelevant once they re-add. */}
      {switchNotice && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{switchNotice}</span>
          <button type="button" onClick={onDismissNotice}
            className="shrink-0 font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Area / provider info bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {areaData.provider ? areaData.provider.name : (areaData.city || areaData.pincode)}
          </span>
          {areaData.pincode && areaData.city && (
            <span className="text-muted-foreground">· {areaData.city}</span>
          )}
          {!areaData.provider && (
            <span className="text-xs text-muted-foreground">
              · {areaData.provider_count} provider{areaData.provider_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Change area
        </button>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5 text-xs">
        {areaData.provider ? (
          <>
            <Store className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="flex-1 text-foreground">
              Showing exact rates for <span className="font-semibold">{areaData.provider.name}</span>
            </span>
            {onUseBaseRates && (
              <button onClick={onUseBaseRates} className="flex items-center gap-1 font-semibold text-primary hover:underline">
                <ArrowLeftRight className="h-3 w-3" /> Use base rates
              </button>
            )}
          </>
        ) : (
          <>
            <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="flex-1 text-foreground">Showing platform base rates for this area</span>
            {onSwitchProvider && (
              <button onClick={onSwitchProvider} className="flex items-center gap-1 font-semibold text-primary hover:underline">
                <ArrowLeftRight className="h-3 w-3" /> See exact pricing from a provider
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left: service selector + items */}
        <div className="space-y-6 lg:col-span-2">
          {/* Service tabs */}
          <div className="flex flex-wrap gap-2">
            {areaData.services.map(({ service }) => (
              <button
                key={service.id}
                onClick={() => {
                  setActiveServiceId(service.id)
                  setActiveCategory('all')
                }}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-medium transition-all',
                  activeServiceId === service.id
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'border border-border/50 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
                )}
              >
                {service.name}
              </button>
            ))}
          </div>

          {/* Service info */}
          {activeService && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Standard: {activeService.service.turnaround_hours}hrs
              </span>
              {activeService.service.is_express_available && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <Zap className="h-3.5 w-3.5" />
                  Express available · {activeService.service.express_multiplier}x
                </span>
              )}
              <span className="flex items-center gap-1">
                <Info className="h-3.5 w-3.5" />
                {activeService.product_types.length} items available
              </span>
            </div>
          )}

          {/* Category filter pills */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory('all')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-all',
                  activeCategory === 'all'
                    ? 'bg-foreground text-background'
                    : 'border border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    activeCategory === cat
                      ? 'bg-foreground text-background'
                      : 'border border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}
                </button>
              ))}
            </div>
          )}

          {/* Product grid */}
          {activeService && (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredProducts.map((product) => (
                <ItemRow
                  key={product.id}
                  product={product}
                  serviceId={activeService.service.id}
                  serviceName={activeService.service.name}
                  expressMultiplier={activeService.service.express_multiplier}
                  isExpressEnabled={isExpress}
                  cartItem={cartItemsByKey.get(makeLineItemKey(product.id, activeService.service.id))}
                  onAdd={handleAdd}
                  onUpdate={handleUpdate}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: summary */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <SummaryPanel
            cartItems={cartArray}
            isExpress={isExpress}
            onToggleExpress={handleToggleExpress}
            areaData={areaData}
            onClear={cart.clear}
            onPlaceOrder={() => cart.placeOrder({
              providerId: areaData.provider?.id ?? null,
              addressId:  selectedAddressId,
            })}
            placing={cart.placing}
          />

          {/* Pricing note */}
          <div className="mt-4 rounded-xl border border-border/50 bg-card p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Prices shown are platform base rates. Final pricing may vary slightly by provider.
            </p>
            <p className="flex items-start gap-1.5">
              <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              Express service is 1.5× the standard price with delivery within 12 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Page ---------------------------------------------------

type PricingContext = { pincode?: string; city?: string }

export default function PricingCalculatorPage() {
  const { user } = useAuth()
  const router = useRouter()

  // 'pick_path'    — choose "my address" (auth only) vs "search any area"
  // 'my_address'   — pick a saved address (auth only)
  // 'area_search'  — pincode/city input (anyone)
  // 'pick_provider'— choose a specific provider for exact pricing
  // 'calculator'   — showing AreaPricingData (base or provider-specific)
  const [step, setStep] = useState<'pick_path' | 'my_address' | 'area_search' | 'pick_provider' | 'calculator'>(
    user ? 'pick_path' : 'area_search'
  )
  const [pricingContext, setPricingContext] = useState<PricingContext>({})
  const [providers, setProviders] = useState<PickableProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [allowSkip, setAllowSkip] = useState(true)
  const [areaData, setAreaData] = useState<AreaPricingData | null>(null)
  // Lifted here (rather than inside PricingCalculator, which unmounts on
  // every step change) so a provider switch can be intercepted BEFORE
  // areaData is overwritten — see selectProvider below.
  const cart = usePricingCalculatorCart()
  // Saved-address id, kept only when the visitor came in via "Use my saved
  // address". That's the one path where the calculator actually knows WHICH
  // address they mean (the area-search path only ever yields a pincode), and
  // it's what lets Place Order resume straight at Schedule Pickup.
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)
  // Shown after selections are dropped because the provider changed.
  const [switchNotice, setSwitchNotice] = useState<string | null>(null)

  // A signed-out visitor who hit "Place Order" was bounced to sign in with
  // their selection stashed (see savePendingCheckout). They're back and
  // authenticated now — push it into their real cart and carry straight on
  // into the order flow, so the trip through login is invisible to them
  // rather than dumping them on a reset calculator with their work gone.
  const flushedPending = useRef(false)
  useEffect(() => {
    if (!user || flushedPending.current) return
    const pending = loadPendingCheckout()
    if (!pending) return
    flushedPending.current = true

    ;(async () => {
      try {
        await cart.pushToServerCart(
          { providerId: pending.providerId, addressId: pending.addressId },
          pending.items,
          pending.isExpress,
        )
        clearPendingCheckout()
        cart.clear()
        router.push('/customer/orders/create?resume=1')
      } catch {
        // Leave the pending blob in place so a retry (or a reload) can still
        // recover it rather than silently losing their selection again.
        flushedPending.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function resetAll() {
    setAreaData(null)
    setPricingContext({})
    setProviders([])
    setStep(user ? 'pick_path' : 'area_search')
  }

  // Area search resolved — AreaSearchStep already fetched the provider list
  // itself (see its handleSearch), so just take it. areaData stays null
  // until the visitor actually lands on a real catalog — either by picking
  // a provider (selectProvider) or hitting "Skip" (skipToBaseRates), both
  // below — never pre-fetched here on the chance "Skip" gets used.
  function handleAreaResult(result: { pincode?: string; city?: string; providers: PickableProvider[] }) {
    setPricingContext({ pincode: result.pincode, city: result.city })
    setProviders(result.providers)
    setAllowSkip(true)
    setStep('pick_provider')
  }

  async function handleAddressSelected(address: { id: number; postal_code: string; city: string }) {
    setPricingContext({ pincode: address.postal_code, city: address.city })
    // Keep the id, not just the pincode — this is what lets Place Order skip
    // the order flow's address step entirely.
    setSelectedAddressId(address.id)
    await loadProviders({ pincode: address.postal_code, city: address.city })
    setAllowSkip(false)
    setStep('pick_provider')
  }

  async function loadProviders(ctx: PricingContext) {
    setProvidersLoading(true)
    try {
      const param = ctx.pincode ? `location=${ctx.pincode}` : `location=${encodeURIComponent(ctx.city ?? '')}`
      const res = await fetch(`/api/customer/laundry-providers/search?${param}`)
      const json = await res.json()
      if (json.success) {
        setProviders(json.data.providers.map((p: any) => ({
          id: p.id,
          name: p.business_name,
          subtitle: p.business_address ?? p.city ?? '',
          rating: p.rating,
          ratingCount: p.rating_count,
          minPriceKg: p.min_price_kg,
        })))
      } else {
        setProviders([])
      }
    } catch {
      setProviders([])
    } finally {
      setProvidersLoading(false)
    }
  }

  // Every path that swaps the catalog under an existing selection runs through
  // here. A selection only ever means anything against the catalog it was
  // built from — carrying it into a different provider's (or the area's base)
  // catalog, priced or not, is carrying over a choice the customer never
  // actually made against what they're now looking at. So this clears rather
  // than reprices: leaving the calculator's current provider context, for any
  // reason, means starting the selection over against whatever catalog is
  // shown next.
  //
  // Unconditional on "did the provider id change" — clearing an already-empty
  // cart, or one already built from this exact catalog, is a no-op — so there
  // is no tracked-id guard left to fall out of sync. That guard's earlier
  // failure mode is exactly why reaching this step via Back / "Change area"
  // used to leave stale, wrongly-priced items sitting in the estimate panel:
  // resetAll() cleared the tracked id while the cart kept its items, so the
  // old guard saw null and silently skipped the clear.
  function applyCatalogToCart(data: AreaPricingData) {
    if (cart.items.length === 0) { setSwitchNotice(null); return }
    cart.clear()
    const rates = data.provider ? `${data.provider.name}'s rates` : "this area's base rates"
    setSwitchNotice(`Your earlier selection was cleared — please choose services again for ${rates}.`)
  }

  async function selectProvider(providerId: number) {
    setProvidersLoading(true)
    try {
      const res = await fetch(`/api/customer/public/pricing/services-by-area?provider_id=${providerId}`)
      const json = await res.json()
      if (json.success && json.data.covered) {
        const data = json.data as AreaPricingData
        applyCatalogToCart(data)
        setAreaData(data)
        setStep('calculator')
      }
    } finally {
      setProvidersLoading(false)
    }
  }

  async function skipToBaseRates() {
    // areaData is no longer pre-fetched on every search (see handleAreaResult)
    // — fetch the base-rate catalog now, only because the visitor actually
    // asked for it. Same lazy fetch switchToBaseRates() below does when
    // "Use base rates" is clicked from inside the calculator itself.
    setProvidersLoading(true)
    try {
      await switchToBaseRates()
      setStep('calculator')
    } finally {
      setProvidersLoading(false)
    }
  }

  async function switchToBaseRates() {
    const param = pricingContext.pincode
      ? `pincode=${pricingContext.pincode}`
      : `city=${encodeURIComponent(pricingContext.city ?? '')}`
    const res = await fetch(`/api/customer/public/pricing/services-by-area?${param}`)
    const json = await res.json()
    if (json.success) {
      const data = json.data as AreaPricingData
      // Dropping from a provider's catalog to the area's base rates changes
      // every price too, so this path needs the same repricing.
      applyCatalogToCart(data)
      setAreaData(data)
    }
  }

  async function switchToProviderPicker() {
    await loadProviders(pricingContext)
    setAllowSkip(true)
    setStep('pick_provider')
  }

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Pricing Calculator' }]}>
      {/* Hero — compact */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        {/* Centred and compact — the step content (search box, then results)
            renders immediately below, so a tall left-aligned banner pushed
            the actual input toward the middle of the viewport with dead
            space around it. */}
        <PageSection className="relative py-6 text-center md:py-8">
          <div className="mx-auto max-w-2xl">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
              <Star className="h-3 w-3" />
              Transparent Pricing
            </span>
            <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              Calculate Your Laundry Cost
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              See available services and get an instant estimate for your area
            </p>
          </div>
        </PageSection>
      </div>

      {/* Tight top padding so search + results sit high on the page rather
          than starting a screen-height down (PageSection defaults to
          py-16 md:py-24). */}
      <PageSection className="py-6 md:py-8">
        {step === 'pick_path' && (
          <div className="mx-auto max-w-md">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setStep('my_address')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-6 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <Home className="h-6 w-6 text-primary" />
                <span className="text-sm font-semibold text-foreground">Use my saved address</span>
                <span className="text-xs text-muted-foreground">See exact rates near you</span>
              </button>
              <button
                onClick={() => setStep('area_search')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-6 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <Globe className="h-6 w-6 text-primary" />
                <span className="text-sm font-semibold text-foreground">Search any location</span>
                <span className="text-xs text-muted-foreground">Check pricing anywhere</span>
              </button>
            </div>
          </div>
        )}

        {step === 'my_address' && (
          <MyAddressStep
            onAddressSelected={handleAddressSelected}
            onBack={() => setStep(user ? 'pick_path' : 'area_search')}
          />
        )}

        {step === 'area_search' && (
          <AreaSearchStep onResult={handleAreaResult} />
        )}

        {step === 'pick_provider' && (
          <ProviderPicker
            providers={providers}
            loading={providersLoading}
            allowSkip={allowSkip}
            searchedArea={pricingContext.pincode || pricingContext.city || undefined}
            onSelect={selectProvider}
            onSkip={allowSkip ? skipToBaseRates : undefined}
            onBack={() => setStep(user ? 'pick_path' : 'area_search')}
          />
        )}

        {step === 'calculator' && areaData && (
          <PricingCalculator
            areaData={areaData}
            cart={cart}
            selectedAddressId={selectedAddressId}
            switchNotice={switchNotice}
            onDismissNotice={() => setSwitchNotice(null)}
            onReset={resetAll}
            onSwitchProvider={switchToProviderPicker}
            onUseBaseRates={areaData.provider ? switchToBaseRates : undefined}
          />
        )}
      </PageSection>

      {/* How pricing works */}
      {step !== 'calculator' && (
        <div className="border-t border-border/50 bg-muted/20">
          <PageSection tight>
            <h2 className="mb-8 text-2xl font-bold text-foreground text-center">
              How Our Pricing Works
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: '⚖️',
                  title: 'Per kg for everyday laundry',
                  body: 'Regular clothes like t-shirts, trousers, and innerwear are washed together and charged by weight. Starting at ₹49/kg.',
                },
                {
                  icon: '👔',
                  title: 'Per piece for special items',
                  body: 'Sarees, suits, lehengas, curtains, and household items are charged per piece. Each item gets individual attention.',
                },
                {
                  icon: '⚡',
                  title: 'Express for urgent needs',
                  body: 'Need it back in 12 hours? Express service is available at 1.5× the standard rate. Toggle it in the calculator.',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/50 bg-card p-6 text-center">
                  <div className="mb-3 text-4xl">{item.icon}</div>
                  <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </PageSection>
        </div>
      )}
    </FooterPageLayout>
  )
}
