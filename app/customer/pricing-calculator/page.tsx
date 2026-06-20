'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, MapPin, ChevronRight, Plus, Minus,
  Zap, Clock, ShoppingBag, Trash2, ArrowRight,
  CheckCircle2, AlertCircle, Loader2, RefreshCw,
  Info, Star,
} from 'lucide-react'
import { FooterPageLayout, PageSection } from '@/components/layout/footer-page-layout'
import { cn } from '@/lib/utils'
import type {
  AreaPricingData, ServiceWithProducts, PricingProductType,
  CartLineItem, PricingModel, ServiceCategory,
} from '@/types/pricing'
import { CATEGORY_LABELS, SERVICE_CATEGORY_LABELS } from '@/types/pricing'

// ---- Helpers ------------------------------------------------
function formatINR(amount: number) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function calcLineTotal(
  item: Pick<CartLineItem, 'pricing_model' | 'unit_price' | 'quantity' | 'weight_kg' | 'is_express' | 'express_multiplier'>
) {
  const base =
    item.pricing_model === 'per_kg'
      ? item.unit_price * item.weight_kg
      : item.unit_price * item.quantity
  return item.is_express ? base * item.express_multiplier : base
}

function makeLineItemKey(productTypeId: number, serviceId: number) {
  return `${productTypeId}_${serviceId}`
}

// ---- Sub-components -----------------------------------------

function AreaSearchStep({
  onResult,
}: {
  onResult: (data: AreaPricingData) => void
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
      const param = isPincode ? `pincode=${val}` : `city=${encodeURIComponent(val)}`
      const res = await fetch(`/api/customer/public/pricing/services-by-area?${param}`)
      if (!res.ok) throw new Error('Request failed')
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed')

      if (!json.data.covered) {
        setUncoveredArea(val)
      } else {
        onResult(json.data as AreaPricingData)
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
      <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Enter your area</h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll show services and pricing available near you
            </p>
          </div>
        </div>

        <div className="flex gap-3">
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
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50"
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
      <span className="text-2xl">{product.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
        <p className="text-xs text-muted-foreground">{priceLabel}</p>
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
}: {
  cartItems: CartLineItem[]
  isExpress: boolean
  onToggleExpress: () => void
  areaData: AreaPricingData
  onClear: () => void
}) {
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
              <Link
                href="/customer/auth/register"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
              >
                Sign Up & Book Now
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/quick-pickup"
                className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Zap className="h-4 w-4" />
                Request Quick Pickup Instead
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---- Main calculator ----------------------------------------
function PricingCalculator({ areaData, onReset }: { areaData: AreaPricingData; onReset: () => void }) {
  const [activeServiceId, setActiveServiceId] = useState<number>(
    areaData.services[0]?.service.id ?? 0
  )
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [cartItems, setCartItems] = useState<Map<string, CartLineItem>>(new Map())
  const [isExpress, setIsExpress] = useState(false)

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
      const key = makeLineItemKey(product.id, serviceId)
      setCartItems((prev) => {
        const next = new Map(prev)
        const quantity = 1
        const weight_kg = 1
        const line_total = calcLineTotal({
          pricing_model: product.pricing_model,
          unit_price: product.unit_price,
          quantity,
          weight_kg,
          is_express: isExpress,
          express_multiplier: expressMultiplier,
        })
        next.set(key, {
          product_type_id: product.id,
          product_type_name: product.name,
          pricing_model: product.pricing_model,
          icon: product.icon,
          service_id: serviceId,
          service_name: serviceName,
          unit_price: product.unit_price,
          quantity,
          weight_kg,
          is_express: isExpress,
          express_multiplier: expressMultiplier,
          line_total,
        })
        return next
      })
    },
    [isExpress]
  )

  const handleUpdate = useCallback(
    (key: string, field: 'quantity' | 'weight_kg', value: number) => {
      setCartItems((prev) => {
        const next = new Map(prev)
        const item = next.get(key)
        if (!item) return prev
        const updated = { ...item, [field]: value }
        updated.line_total = calcLineTotal(updated)
        next.set(key, updated)
        return next
      })
    },
    []
  )

  const handleRemove = useCallback((key: string) => {
    setCartItems((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  // Recalculate all totals when express toggled
  const handleToggleExpress = useCallback(() => {
    setIsExpress((prev) => {
      const next = !prev
      setCartItems((items) => {
        const updated = new Map(items)
        updated.forEach((item, key) => {
          const updatedItem = { ...item, is_express: next }
          updatedItem.line_total = calcLineTotal(updatedItem)
          updated.set(key, updatedItem)
        })
        return updated
      })
      return next
    })
  }, [])

  const cartArray = Array.from(cartItems.values())

  return (
    <div>
      {/* Area info bar */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {areaData.city || areaData.pincode}
          </span>
          {areaData.pincode && areaData.city && (
            <span className="text-muted-foreground">· {areaData.pincode}</span>
          )}
          <span className="text-xs text-muted-foreground">
            · {areaData.provider_count} provider{areaData.provider_count !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Change area
        </button>
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
                  cartItem={cartItems.get(makeLineItemKey(product.id, activeService.service.id))}
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
            onClear={() => setCartItems(new Map())}
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
export default function PricingCalculatorPage() {
  const [areaData, setAreaData] = useState<AreaPricingData | null>(null)

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Pricing Calculator' }]}>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <PageSection className="relative py-16 md:py-20">
          <div className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <Star className="h-3 w-3" />
              Transparent Pricing
            </span>
            <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
              Calculate Your Laundry Cost
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Enter your pincode to see available services and get an instant estimate — no sign-up needed.
            </p>
          </div>
        </PageSection>
      </div>

      <PageSection>
        {!areaData ? (
          <AreaSearchStep onResult={setAreaData} />
        ) : (
          <PricingCalculator
            areaData={areaData}
            onReset={() => setAreaData(null)}
          />
        )}
      </PageSection>

      {/* How pricing works */}
      {!areaData && (
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
