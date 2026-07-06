'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  MapPin, Store, Calendar, Package, Receipt, Tag, CreditCard,
  Wallet, Banknote, Check, X, Loader2,
  Shield, ChevronDown, ChevronUp, AlertCircle, Zap, Edit3, Lock, Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SelectedService } from '../../types'
import { AppliedCoupon, GatewayInfo, OrderFlowState } from '@/types/order-types'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveProductIconSrc } from '@/lib/product-icons'

interface CheckoutStepProps {
  orderState:             OrderFlowState
  onCouponApply:          (coupon: AppliedCoupon | null) => void
  onSpecialInstructions:  (val: string) => void
  onExpressToggle:        (isExpress: boolean, updatedServices: SelectedService[]) => void
  onEditServices:         () => void
  onSubmit:               (paymentMethod: string, walletAmount: number) => Promise<void>
  isSubmitting:           boolean
}

interface FeeRow { code: string; display_name: string; amount: number; is_free: boolean }
interface FeeBreakdown {
  subtotal: number; fees: FeeRow[]; grand_total: number
}
interface WalletInfo { balance: number; has_wallet: boolean; wallet_id: number | null }
interface AvailableCoupon {
  code: string; name: string; discount_type: string; discount_value: number
  max_discount: number | null; min_order_amount: number; discount_display: string
  eligible: boolean; ineligible_reason: string | null
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}
function formatDate(d: string) {
  return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function CheckoutStep({
  orderState, onCouponApply, onSpecialInstructions, onExpressToggle, onEditServices, onSubmit, isSubmitting,
}: CheckoutStepProps) {
  const currentIsExpress    = orderState.selected_services.some(s => s.is_express)
  const hasAnyExpressCapable= orderState.selected_services.some(s => s.express_multiplier > 1)

  const subtotal = useMemo(
    () => orderState.selected_services.reduce((s, i) => s + i.line_total, 0),
    [orderState.selected_services]
  )

  // Display-only — total MRP discount across line items, never used in checkout math
  const totalMrpSavings = useMemo(
    () => orderState.selected_services.reduce((s, i) => {
      if (!i.mrp || i.mrp <= i.unit_price) return s
      const qty = i.type === 'per_kg' ? i.weight_kg : i.quantity
      return s + (i.mrp - i.unit_price) * qty
    }, 0),
    [orderState.selected_services]
  )

  // Fees
  const [feeBreakdown,    setFeeBreakdown]    = useState<FeeBreakdown | null>(null)
  const [feesLoading,     setFeesLoading]     = useState(true)
  const [expressToggling, setExpressToggling] = useState(false)
  // Wallet
  const [walletInfo,      setWalletInfo]      = useState<WalletInfo | null>(null)
  const [walletLoading,   setWalletLoading]   = useState(true)
  const [useWallet,       setUseWallet]       = useState(false)
  // Gateway
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null)
  const [gatewayLoading,  setGatewayLoading]  = useState(true)
  // Coupon
  const [couponOpen,      setCouponOpen]      = useState(false)
  const [couponCode,      setCouponCode]      = useState('')
  const [couponLoading,   setCouponLoading]   = useState(false)
  const [couponError,     setCouponError]     = useState<string | null>(null)
  // BUG 1: warning shown when an applied coupon becomes invalid due to subtotal change
  const [couponWarning,   setCouponWarning]   = useState<string | null>(null)
  const [availableCoupons,setAvailableCoupons]= useState<AvailableCoupon[]>([])
  const [selectedMethod, setSelectedMethod] = useState<'cod' | 'online' | null>(null)
  // Instructions
  const [instructions,   setInstructions]   = useState(orderState.special_instructions ?? '')
  const [editingInstr,   setEditingInstr]   = useState(false)
  // Estimated delivery date preview
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState<string | null>(null)
  const [estimateLoading,       setEstimateLoading]       = useState(false)
  const expressCache = useRef<Map<boolean, {
    services: SelectedService[]
    feeBreakdown: FeeBreakdown
  }>>(new Map())
  // ---- Fees (re-fetch on subtotal or express change) -----------
  useEffect(() => {
    // if (initialFeesLoaded.current) return  // Only load once on mount
    // initialFeesLoaded.current = true
    setFeesLoading(true)
    fetch(`/api/customer/orders/fees?subtotal=${subtotal}&is_express=${currentIsExpress}`)
      .then(r => r.json())
            .then(json => {
        if (json.success) {
          setFeeBreakdown(json.data)
          expressCache.current.set(currentIsExpress, {
            services:     orderState.selected_services,
            feeBreakdown: json.data,
          })
        }
      })
      .catch(() => {})
      .finally(() => setFeesLoading(false))
  }, [subtotal, currentIsExpress])

  // ---- Estimated delivery date preview --------------------------
  const providerId = orderState.selected_provider?.id
  const servicesKey = useMemo(
    () => JSON.stringify(orderState.selected_services.map(s => ({ id: s.service_id, x: s.is_express }))),
    [orderState.selected_services]
  )
  useEffect(() => {
    if (!providerId || !orderState.pickup_date || orderState.selected_services.length === 0) {
      setEstimatedDeliveryDate(null)
      return
    }
    setEstimateLoading(true)
    fetch('/api/customer/orders/estimate-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        laundry_profile_id: providerId,
        pickup_date: orderState.pickup_date,
        services: orderState.selected_services.map(s => ({ service_id: s.service_id, is_express: s.is_express })),
      }),
    })
      .then(r => r.json())
      .then(json => { if (json.success) setEstimatedDeliveryDate(json.data.estimated_delivery_date) })
      .catch(() => {})
      .finally(() => setEstimateLoading(false))
  }, [providerId, orderState.pickup_date, servicesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Wallet + Gateway + Available coupons (once on mount) ----
  useEffect(() => {
    fetch('/api/customer/wallet/balance', { credentials: 'include' })
      .then(r => r.json()).then(j => { if (j.success) setWalletInfo(j.data) }).catch(() => {})
      .finally(() => setWalletLoading(false))

    fetch('/api/customer/payments/gateway-info')
      .then(r => r.json()).then(j => { if (j.success) setGatewayInfo(j.data) }).catch(() => {})
      .finally(() => setGatewayLoading(false))
  }, [])

  // ---- Available coupons: re-fetch on subtotal change ----------
  // This ensures the ineligible_reason ("Add ₹X more") stays accurate
  useEffect(() => {
    if (subtotal <= 0) return
    fetch(`/api/customer/coupons/available?order_amount=${subtotal}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setAvailableCoupons(j.data?.coupons ?? []) })
      .catch(() => {})
  }, [subtotal])
  const prevSubtotalRef = useRef(subtotal)
  useEffect(() => {
    const prevSubtotal = prevSubtotalRef.current
    prevSubtotalRef.current = subtotal

    const appliedCoupon = orderState.applied_coupon
    if (!appliedCoupon) { setCouponWarning(null); return }

    const found = availableCoupons.find(c => c.code === appliedCoupon.code)
    if (!found) return // not loaded yet, skip check

    if (!found.eligible) {
      // Coupon is no longer valid — auto-remove and warn user
      onCouponApply(null)
      setCouponWarning(
        found.ineligible_reason
          ? `Coupon "${appliedCoupon.code}" removed: ${found.ineligible_reason}`
          : `Coupon "${appliedCoupon.code}" is no longer valid and has been removed`
      )
      // Persist removal
      fetch('/api/customer/cart/coupon', { method: 'DELETE', credentials: 'include' }).catch(() => {})
    } else {
      // Coupon still valid — recompute discount against new subtotal
      const { discount_type, discount_value, max_discount } = found
      let newDiscount = discount_type === 'percent'
        ? (subtotal * discount_value) / 100
        : discount_value
      if (max_discount) newDiscount = Math.min(newDiscount, max_discount)
      newDiscount = Math.min(Math.round(newDiscount * 100) / 100, subtotal)

      // Only update if the discount amount actually changed
      if (Math.abs(newDiscount - appliedCoupon.discount_amount) > 0.001) {
        onCouponApply({ ...appliedCoupon, discount_amount: newDiscount })
      }
      setCouponWarning(null)
    }
  }, [subtotal, availableCoupons]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Express toggle ------------------------------------------
  const handleExpressToggle = useCallback(async () => {
    const newIsExpress = !currentIsExpress
    // Check cache first
    const cached = expressCache.current.get(newIsExpress)
    if (cached) {
      onExpressToggle(newIsExpress, cached.services)
      setFeeBreakdown(cached.feeBreakdown)
      return
    }
    setExpressToggling(true)
    try {
      const res = await fetch('/api/customer/orders/express-toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ is_express: !currentIsExpress, services: orderState.selected_services }),
      })
      const json = await res.json()
      if (json.success) {
          const newFeeBreakdown: FeeBreakdown = {
          subtotal:    json.data.subtotal,
          fees:        json.data.fees,
          grand_total: json.data.grand_total,
        }
        // Store in cache
        expressCache.current.set(newIsExpress, {
          services:     json.data.services,
          feeBreakdown: newFeeBreakdown,
        })
        onExpressToggle(json.data.is_express, json.data.services)
        setFeeBreakdown({
          subtotal: json.data.subtotal, fees: json.data.fees, grand_total: json.data.grand_total,
        })
      }
    } catch (err) {
      console.error('[CheckoutStep] Express toggle error:', err)
    } finally {
      setExpressToggling(false)
    }
  }, [currentIsExpress, orderState.selected_services, onExpressToggle])

  // ---- Coupon apply --------------------------------------------
  const persistCouponToCart = async (code: string) => {
    try {
      await fetch('/api/customer/cart/coupon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ coupon_code: code }),
      })
    } catch { /* non-fatal */ }
  }

  const handleApplyCoupon = async (code: string) => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setCouponLoading(true); setCouponError(null); setCouponWarning(null)
    try {
      const res  = await fetch('/api/customer/coupons/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ coupon_code: trimmed, order_amount: subtotal }),
      })
      const json = await res.json()
      if (json.success && json.data?.valid) {
        const c = json.data.coupon
        let discount = c.discount_type === 'percent'
          ? (subtotal * c.discount_value) / 100 : c.discount_value
        if (c.max_discount) discount = Math.min(discount, c.max_discount)
        discount = Math.round(Math.min(discount, subtotal) * 100) / 100
        onCouponApply({
          code: c.code, name: c.name, discount_type: c.discount_type,
          discount_value: c.discount_value, discount_amount: discount,description: '',
          starts_at: '',
          ends_at: '',
          is_active: false
        })
        setCouponCode(''); setCouponOpen(false)
        await persistCouponToCart(c.code)
      } else {
        setCouponError(json.data?.message ?? json.message ?? 'Invalid coupon code')
      }
    } catch {
      setCouponError('Failed to validate. Please try again.')
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = async () => {
    onCouponApply(null); setCouponCode(''); setCouponWarning(null)
    try { await fetch('/api/customer/cart/coupon', { method: 'DELETE', credentials: 'include' }) } catch { }
  }

  // ---- Totals --------------------------------------------------
  const discountAmount = orderState.applied_coupon?.discount_amount ?? 0
  const grossTotal     = feeBreakdown
    ? Math.max(0, feeBreakdown.grand_total - discountAmount)
    : subtotal
  const walletContribution = useWallet && walletInfo?.balance
    ? Math.min(walletInfo.balance, grossTotal) : 0
  const walletContributionRounded = Math.round(walletContribution * 100) / 100
  const amountAfterWallet  = Math.max(0, Math.round((grossTotal - walletContributionRounded) * 100) / 100)
  const walletCoversAll    = walletContributionRounded >= grossTotal
  const onlinePaymentAvailable = Boolean(
    gatewayInfo?.gateway_configured && ['payu', 'cashfree', 'razorpay'].includes(gatewayInfo.provider)
  )
  const codCheckAmount = walletCoversAll ? 0 : amountAfterWallet
  const codAvailable = Boolean(
    gatewayInfo?.cod_enabled &&
    codCheckAmount <= (gatewayInfo?.cod_max_amount ?? 5000)
  )
  const canPlace = walletCoversAll || selectedMethod === 'cod' || (selectedMethod === 'online' && onlinePaymentAvailable)

  // The order is always created first via onSubmit (cod/wallet/online alike).
  // For 'online', the parent (page.tsx) creates the order, then calls the
  // order-bound /pay endpoint and launches the active gateway's checkout —
  // CheckoutStep no longer talks to any payment-gateway API directly.
  const handlePlace = async () => {
    if (!canPlace) return
    try {
      if (walletCoversAll) {
        await onSubmit('wallet', walletContributionRounded)
        return
      }
      if (selectedMethod === 'cod') {
        const method = walletContributionRounded > 0 ? 'wallet+cod' : 'cod'
        await onSubmit(method, walletContributionRounded)
        return
      }
      if (selectedMethod === 'online') {
        const method = walletContributionRounded > 0 ? 'wallet+online' : 'online'
        await onSubmit(method, walletContributionRounded)
        return
      }
    } catch (error) {
      console.error('[CheckoutStep] Place order failed:', error)
    }
  }

  const expressFeeRow = feeBreakdown?.fees.find(f => f.code === 'express_surcharge')

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* ---- Left: Summary ---- */}
      <div className="space-y-3 lg:col-span-3">
        <h2 className="text-base font-semibold text-foreground">Order Review</h2>

        {/* BUG 1: Coupon warning banner */}
        {couponWarning && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-400">{couponWarning}</p>
            <button type="button" onClick={() => setCouponWarning(null)} className="ml-auto text-amber-500 hover:text-amber-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Address + Provider */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 bg-card p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Address</span>
            </div>
            {orderState.pickup_address && (
              <div className="text-sm">
                <p className="font-semibold text-foreground">{orderState.pickup_address.label}</p>
                <p className="text-xs text-muted-foreground">{orderState.pickup_address.address_line1}</p>
                <p className="text-xs text-muted-foreground">
                  {orderState.pickup_address.city} - {orderState.pickup_address.postal_code}
                </p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border/50 bg-card p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provider & Schedule</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{orderState.selected_provider?.business_name}</p>
            {orderState.pickup_date && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(orderState.pickup_date)}
                {orderState.pickup_time_slot && ` · ${orderState.pickup_time_slot}`}
              </p>
            )}
            {estimateLoading ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Estimating delivery date…
              </p>
            ) : estimatedDeliveryDate && (
              <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                <Truck className="h-3 w-3" /> Estimated delivery: {formatDate(estimatedDeliveryDate)}
              </p>
            )}
          </div>
        </div>

        {/* Services */}
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected Services</span>
            </div>
            <button type="button" onClick={onEditServices}
              className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          </div>
          <div className="space-y-1.5">
            {orderState.selected_services.map((svc, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-foreground">
                    {svc.type === 'per_unit' ? (svc as any).product_type_name : svc.service_name}
                  </span>
                  {svc.type === 'per_unit' && (
                    <span className="shrink-0 text-xs text-muted-foreground">({svc.service_name})</span>
                  )}
                  {svc.is_express && (
                    <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 dark:bg-amber-500" title="Express">
                      <Zap className="h-2.5 w-2.5 text-white fill-white" />
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs">
                  <span className="text-muted-foreground mr-2">
                    {svc.type === 'per_kg' ? `${(svc as any).weight_kg}kg` : `×${(svc as any).quantity}`}
                  </span>
                  <span className="font-semibold text-foreground">{formatINR(svc.line_total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Special instructions */}
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Edit3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Special Instructions</span>
            </div>
            <button type="button" onClick={() => setEditingInstr(v => !v)}
              className="text-xs text-primary hover:underline">
              {editingInstr ? 'Done' : 'Edit'}
            </button>
          </div>
          {editingInstr ? (
            <textarea value={instructions}
              onChange={e => { setInstructions(e.target.value); onSpecialInstructions(e.target.value) }}
              rows={3} maxLength={500} placeholder="Handle with care, separate colours, no bleach…"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          ) : (
            <p className="text-sm text-muted-foreground">{instructions || <span className="italic">None</span>}</p>
          )}
        </div>

        {/* Price breakdown */}
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Price Breakdown</span>
          </div>
          {feesLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Calculating…</span>
            </div>
          ) : (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Services subtotal</span>
                <span className="flex items-center gap-1.5">
                  {totalMrpSavings > 0 && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatINR(subtotal + totalMrpSavings)}
                    </span>
                  )}
                  <span className="font-medium text-foreground">{formatINR(subtotal)}</span>
                </span>
              </div>
              {feeBreakdown?.fees.map(fee => (
                <div key={fee.code} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{fee.display_name}</span>
                  </div>
                  <span className={cn('font-medium', fee.is_free ? 'text-emerald-600' : 'text-foreground')}>
                    {fee.is_free ? 'FREE' : formatINR(fee.amount)}
                  </span>
                </div>
              ))}
              {hasAnyExpressCapable && (
                <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Zap className={cn('h-4 w-4', currentIsExpress ? 'text-amber-500' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium text-foreground">Express Delivery</p>
                      <p className="text-xs text-muted-foreground">
                        {currentIsExpress ? 'Faster turnaround — express surcharge applied' : 'Switch to faster turnaround'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExpressToggle}
                    disabled={expressToggling}
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors duration-200 disabled:opacity-50',
                      currentIsExpress ? 'bg-amber-500' : 'bg-muted-foreground/30'
                    )}
                  >
                    <div className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                      currentIsExpress ? 'translate-x-[18px]' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>
              )}
              {/* {feeBreakdown && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({Math.round((feeBreakdown.tax_rate ?? 0.18) * 100)}%)</span>
                  <span className="font-medium text-foreground">{formatINR(feeBreakdown.tax_amount)}</span>
                </div>
              )} */}
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" /> Coupon ({orderState.applied_coupon?.code})
                  </span>
                  <span className="font-semibold">-{formatINR(discountAmount)}</span>
                </div>
              )}
              {walletContributionRounded > 0 && (
                <div className="flex justify-between text-violet-600 dark:text-violet-400">
                  <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Wallet</span>
                  <span className="font-semibold">-{formatINR(walletContributionRounded)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/40 pt-1.5">
                <span className="font-bold text-foreground">
                  {walletContributionRounded > 0 && !walletCoversAll ? 'Remaining to Pay' : 'Total'}
                </span>
                <span className="text-lg font-bold text-primary">
                  {formatINR(walletCoversAll ? grossTotal : amountAfterWallet)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Right: Wallet + Coupon + Payment ---- */}
      <div className="space-y-3 lg:col-span-2">

        {/* Wallet */}
        {!walletLoading && walletInfo?.has_wallet && walletInfo.balance > 0 && (
          <div className={cn(
            'rounded-xl border p-3 transition-all',
            useWallet ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30' : 'border-border/50 bg-card'
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                  useWallet ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground')}>
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Laundrease Wallet</p>
                  <p className="text-xs text-muted-foreground">
                    Available: <span className="font-semibold text-violet-600">{formatINR(walletInfo.balance)}</span>
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setUseWallet(v => !v)}
                className={cn('relative h-5 w-9 rounded-full transition-colors duration-200',
                  useWallet ? 'bg-violet-600' : 'bg-muted-foreground/30')}>
                <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  useWallet ? 'translate-x-[18px]' : 'translate-x-0.5')} />
              </button>
            </div>
            {useWallet && (
              <div className="mt-2 rounded-lg bg-violet-100/50 px-3 py-1.5 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {walletCoversAll
                  ? `✓ Wallet covers the full amount of ${formatINR(grossTotal)}`
                  : `${formatINR(walletContributionRounded)} from wallet · ${formatINR(amountAfterWallet)} remaining via another method`}
              </div>
            )}
          </div>
        )}

        {/* Coupon */}
        <div className="rounded-xl border border-border/50 bg-card">
          <button type="button" onClick={() => setCouponOpen(v => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {orderState.applied_coupon ? `${orderState.applied_coupon.code} applied` : 'Apply Coupon'}
              </span>
              {orderState.applied_coupon && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  -{formatINR(discountAmount)}
                </span>
              )}
            </div>
            {couponOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {couponOpen && (
            <div className="border-t border-border/40 p-3 space-y-2.5">
              {orderState.applied_coupon ? (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        {orderState.applied_coupon.code}
                      </p>
                      <p className="text-xs text-emerald-600">Saved {formatINR(discountAmount)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={handleRemoveCoupon}
                    className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input type="text" value={couponCode}
                      onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null) }}
                      onKeyDown={e => e.key === 'Enter' && handleApplyCoupon(couponCode)}
                      placeholder="Enter coupon code"
                      className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    <button type="button" onClick={() => handleApplyCoupon(couponCode)}
                      disabled={couponLoading || !couponCode.trim()}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {couponError}
                    </p>
                  )}

                  {/* Available coupons — only show eligible ones */}
                  {availableCoupons.some(c => c.eligible) && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Available for you</p>
                      {availableCoupons.filter(c => c.eligible).map(c => (
                        <div
                          key={c.code}
                          onClick={() => handleApplyCoupon(c.code)}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-border/40 bg-muted/30 px-3 py-2.5 transition-colors hover:border-primary/30"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold font-mono text-foreground">{c.code}</p>
                            <p className="text-[11px] text-muted-foreground">{c.name}</p>
                          </div>
                          <span className="shrink-0 ml-2 text-xs font-semibold text-primary">
                            {c.discount_display}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Payment */}
        {!walletCoversAll && (
          <div className="rounded-xl border border-border/50 bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {walletContributionRounded > 0 ? `Pay Remaining ${formatINR(amountAfterWallet)}` : 'Payment Method'}
              </span>
            </div>
            {gatewayLoading ? (
              <div className="flex items-center gap-2 py-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading payment options…</span>
              </div>
            ) : (
              <div className="space-y-3">
                {onlinePaymentAvailable && (
                  <button
                    type="button"
                    onClick={() => setSelectedMethod(selectedMethod === 'online' ? null : 'online')}
                    disabled={feesLoading}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                      selectedMethod === 'online'
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border/50 hover:border-border'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        selectedMethod === 'online'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <CreditCard className="h-4 w-4" />
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Pay Online</p>
                      <p className="text-xs text-muted-foreground">
                        Secure payment via {gatewayInfo?.provider?.toUpperCase() ?? 'payment gateway'}
                      </p>
                    </div>

                    {selectedMethod === 'online' ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <span className="shrink-0 text-sm font-bold text-primary">{formatINR(amountAfterWallet)}</span>
                    )}
                  </button>
                )}

                {codAvailable && (
                  <button
                    type="button"
                    onClick={() => setSelectedMethod(selectedMethod === 'cod' ? null : 'cod')}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all',
                      selectedMethod === 'cod'
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border/50 hover:border-border'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        selectedMethod === 'cod'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Banknote className="h-4 w-4" />
                    </div>

                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        Cash on Delivery
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available up to {formatINR(gatewayInfo?.cod_max_amount ?? 5000)}
                      </p>
                    </div>

                    {selectedMethod === 'cod' && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                )}

                {!onlinePaymentAvailable && !codAvailable && (
                  <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    No payment methods available. Please contact support.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* COD limit notice */}
        {gatewayInfo && gatewayInfo.cod_enabled && amountAfterWallet > (gatewayInfo.cod_max_amount ?? 5000) && !walletCoversAll && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 dark:bg-amber-950/30">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              COD not available above {formatINR(gatewayInfo.cod_max_amount ?? 5000)}
            </p>
          </div>
        )}

        {/* Security note */}
        <div className="flex items-start gap-2 rounded-xl bg-muted/30 px-3.5 py-2.5">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p className="text-xs text-muted-foreground">256-bit encrypted · We never store card details</p>
        </div>

        {/* Place order */}
        {(walletCoversAll || selectedMethod === 'cod' || selectedMethod === 'online') && (
        <button type="button" onClick={handlePlace}
          disabled={!canPlace || isSubmitting || feesLoading}
          className="w-full rounded-2xl bg-gradient-to-r from-primary to-violet-700 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50">
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Processing...
            </span>
          ) : walletCoversAll ? (
            <span>Pay with Wallet · {formatINR(grossTotal)}</span>
          ) : selectedMethod === 'cod' ? (
            <span>
              Place COD Order · {formatINR(amountAfterWallet)}
              {walletContributionRounded > 0 && (
                <span className="ml-1 text-sm font-normal opacity-80">(+{formatINR(walletContributionRounded)} wallet)</span>
              )}
            </span>
          ) : selectedMethod === 'online' ? (
            <span>
              Proceed to Pay · {formatINR(amountAfterWallet)}
              {walletContributionRounded > 0 && (
                <span className="ml-1 text-sm font-normal opacity-80">(+{formatINR(walletContributionRounded)} wallet)</span>
              )}
            </span>
          ) : null}
        </button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          By placing this order, you agree to our{' '}
          <a href="/terms-of-service" className="text-primary hover:underline">Terms of Service</a>
        </p>
      </div>
    </div>
  )
}