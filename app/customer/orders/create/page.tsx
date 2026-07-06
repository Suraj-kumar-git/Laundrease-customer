'use client'
// app/customer/orders/create/page.tsx
// Changes from previous version:
//  - On mount: fetches existing cart
//    - If cart has items AND user landed here fresh (not from CartSheet):
//      shows "You have an existing cart" popup with options
//    - If user chose "continue journey" (via ?resume=1 URL param from CartSheet):
//      restores full state from cart and jumps to saved step
//  - Passes draft_order_number to order create API (idempotency)
//  - saveCartStep now also returns draft_order_number and stores it in state
//  - On successful order, cart is cleared by API (no double clear)

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, ShoppingBag, Calendar, CreditCard,
  CheckCircle, ArrowLeft, X, Loader2,
  AlertCircle, ShoppingCart, Trash2, ArrowRight,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { useToast } from '@/hooks/use-toast'
import { useCart } from '@/components/cart-provider'

import { AddressProviderStep } from './components/AddressProviderStep'
import { ServiceSelectionStep } from './components/ServiceSelectionStep'
import { SchedulePickup } from './components/SchedulePickup'
import { CheckoutStep } from './components/CheckoutStep'
import { OrderConfirmation } from './components/OrderConfirmation'

import { cn } from '@/lib/utils'
import { Address, KgService, LaundryProvider, OrderFlowState, SelectedService, UnitProduct } from '@/types/order-types'
import type { CartLineItem } from '@/types/pricing'
import { SearchParamProvider } from '@/components/common/searchParamProvider'
import { launchGatewayCheckout } from '@/lib/payment-client'

const STEPS = [
  { number: 1, title: 'Address & Provider', icon: MapPin },
  { number: 2, title: 'Services',           icon: ShoppingBag },
  { number: 3, title: 'Schedule',           icon: Calendar },
  { number: 4, title: 'Checkout',           icon: CreditCard },
] as const

// ---- Existing cart popup ----------------------------------------------------
function ExistingCartModal({
  cartStep, providerName, itemCount, onContinue, onStartNew, onClose,
}: {
  cartStep: number; providerName?: string | null; itemCount: number
  onContinue: () => void; onStartNew: () => void; onClose: () => void
}) {
  const stepLabels = ['', 'Address & Provider', 'Services', 'Schedule', 'Checkout']
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <ShoppingCart className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">You have an existing cart</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {providerName
            ? `${itemCount} item${itemCount !== 1 ? 's' : ''} selected with ${providerName}.`
            : `${itemCount} item${itemCount !== 1 ? 's' : ''} in your cart.`}
          {' '}Paused at <span className="font-semibold text-foreground">{stepLabels[cartStep]}</span>.
        </p>

        <div className="mt-5 space-y-3">
          <button type="button" onClick={onContinue}
            className="flex w-full items-center gap-3 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <ArrowRight className="h-5 w-5" />
            <div className="text-left">
              <p>Continue your order</p>
              <p className="text-xs font-normal text-primary-foreground/80">
                Resume from {stepLabels[cartStep]}
              </p>
            </div>
          </button>
          <button type="button" onClick={onStartNew}
            className="flex w-full items-center gap-3 rounded-2xl border border-destructive/30 px-5 py-3.5 text-sm font-medium text-destructive hover:bg-destructive/10">
            <Trash2 className="h-5 w-5" />
            <div className="text-left">
              <p>Start a new order</p>
              <p className="text-xs font-normal text-muted-foreground">
                Your current cart will be cleared
              </p>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Confirm clear popup ----------------------------------------------------
function ConfirmClearModal({
  onConfirm, onCancel, loading,
}: { onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCancel} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-sm rounded-3xl bg-background p-6 shadow-2xl"
      >
        <AlertCircle className="mb-3 h-10 w-10 text-amber-500" />
        <h3 className="text-base font-bold text-foreground">Clear existing cart?</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          All your saved items, services, and provider selection will be removed. This cannot be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-border/50 py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear & Start New
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Helpers ----------------------------------------------------------------

// The wizard pushes service selections straight to the server cart (saveCartStep)
// without going through the shared cart-provider context — so the header badge
// must be told explicitly via syncFromServer, otherwise it only catches up once
// the cart sheet is opened.
function toCartLineItems(services: SelectedService[]): CartLineItem[] {
  return services.map(s => ({
    product_type_id:    s.product_type_id ?? 0,
    product_type_name:  s.product_type_name,
    pricing_model:      s.weight_kg > 0 ? 'per_kg' : 'per_unit',
    icon:               s.icon,
    service_id:         s.service_id,
    service_name:       s.service_name,
    unit_price:         s.unit_price,
    mrp:                s.mrp,
    quantity:           s.quantity,
    weight_kg:          s.weight_kg,
    is_express:         s.is_express,
    express_multiplier: s.express_multiplier,
    line_total:         s.line_total,
  }))
}

// Restores OrderFlowState from cart API response
function cartToFlowState(cartData: any, items: any[]): Partial<OrderFlowState> {
  const cart     = cartData.cart
  const address  = cart.address
  const provider = cart.provider

  // Rebuild selected_services from cart items (for step 2 resume)
  const selected_services: SelectedService[] = items.map((item: any) => ({
    type:              item.weight_kg != null ? 'per_kg' : 'per_unit',
    service_id:        item.service_id,
    service_name:      item.service_name,
    service_category:  item.service_category,
    product_type_id:   item.product_type_id,
    product_type_name: item.product_type_name,
    quantity:          item.quantity,
    weight_kg:         item.weight_kg,
    unit_price:        item.unit_price,
    mrp:               item.mrp,
    line_total:        item.line_total,
    is_express:        item.is_express,
    express_multiplier:item.express_multiplier,
  }))

  return {
    step:              cart.current_step ?? 1,
    pickup_address:    address ?? undefined,
    delivery_address:  address ?? undefined,
    selected_provider: provider ?? undefined,
    selected_services,
    pickup_date:       cart.pickup_date ?? undefined,
    pickup_time_slot:  cart.pickup_time_slot ?? undefined,
    is_express:        cart.is_express,
    draft_order_number:cart.draft_order_number ?? undefined,
  }
}

function PageContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const resumeMode   = searchParams.get('resume') === '1'
  const { user, isLoading: authLoading } = useAuth()
  const { toast } = useToast()
  const { clear: clearGuestCart, syncFromServer } = useCart()

  const [state, setState] = useState<OrderFlowState & { draft_order_number?: string }>({
    step: 1, same_address: true, selected_services: [],
  })
  const [prefetchedServices, setPrefetchedServices] = useState<{
    per_kg_services: KgService[]; per_unit_products: UnitProduct[]
  }>({ per_kg_services: [], per_unit_products: [] })

  const [isSubmitting,       setIsSubmitting]       = useState(false)
  const [gatewayRedirecting, setGatewayRedirecting] = useState(false)
  const [confirmed,    setConfirmed]    = useState(false)

  // Ref so pageshow/popstate handlers always read the latest state without
  // being re-registered on every render.
  const gatewayStateRef = useRef<{ active: boolean; orderId: string | null }>({ active: false, orderId: null })
  useEffect(() => {
    gatewayStateRef.current = { active: gatewayRedirecting, orderId: (state as any).order_id ?? null }
  }, [gatewayRedirecting, state])

  // pageshow fires when the browser restores a bfcache snapshot (PayU/Cashfree
  // redirect away then user presses back). Show the confirm dialog here too.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (!e.persisted || !gatewayStateRef.current.active) return
      const cancel = window.confirm('Are you sure you want to cancel the payment? You can retry or switch to Cash on Delivery.')
      setGatewayRedirecting(false)
      if (cancel) {
        const { orderId } = gatewayStateRef.current
        if (orderId) router.push(`/customer/orders/payment/failure?order_id=${orderId}`)
      }
      // "No" keeps them on the checkout page (can't navigate forward back to payment partner)
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // popstate fires when the dummy history entry is popped (Razorpay modal case
  // where the page never actually navigated away).
  useEffect(() => {
    if (!gatewayRedirecting) return
    window.history.pushState({ gatewayRedirecting: true }, '')
    const handlePopState = () => {
      const cancel = window.confirm('Are you sure you want to cancel the payment? You can retry or switch to Cash on Delivery.')
      if (cancel) {
        setGatewayRedirecting(false)
        const { orderId } = gatewayStateRef.current
        if (orderId) router.push(`/customer/orders/payment/failure?order_id=${orderId}`)
      } else {
        window.history.pushState({ gatewayRedirecting: true }, '')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayRedirecting])
  const [cartLoading,  setCartLoading]  = useState(true)

  // Modal state
  const [showExistingCart, setShowExistingCart] = useState(false)
  const [showConfirmClear, setShowConfirmClear] = useState(false)
  const [clearingCart,     setClearingCart]     = useState(false)
  const [existingCartMeta, setExistingCartMeta] = useState<{
    step: number; providerName?: string | null; itemCount: number
  } | null>(null)

  // Stored for resuming after modal decision
  const pendingCartData = useRef<any>(null)

  useEffect(() => {
    if (!authLoading && !user)
      router.push('/customer/auth/login?returnTo=/customer/orders/create')
  }, [user, authLoading, router])

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [state.step])

  // ---- On mount: check for existing cart ----------------------------------
  useEffect(() => {
    if (!user) return
    const checkCart = async () => {
      setCartLoading(true)
      try {
        const res  = await fetch('/api/customer/cart', { credentials: 'include' })
        const json = await res.json()
        if (!json.success || !json.data?.has_items) {
          setCartLoading(false)
          return // No cart with items → start fresh
        }

        const { cart, items } = json.data
        pendingCartData.current = json.data

        if (resumeMode) {
          // Came from CartSheet "Continue" button — restore immediately
          const restored = cartToFlowState(json.data, items)
          setState(prev => ({ ...prev, ...restored }))
          setCartLoading(false)
        } else {
          // Landed here directly — show popup
          setExistingCartMeta({
            step:         cart.current_step ?? 1,
            providerName: cart.provider?.business_name,
            itemCount:    json.data.item_count,
          })
          setShowExistingCart(true)
          setCartLoading(false)
        }
      } catch {
        setCartLoading(false)
      }
    }
    checkCart()
  }, [user, resumeMode])

  const handleContinueExisting = () => {
    if (!pendingCartData.current) return
    const { items } = pendingCartData.current
    const restored = cartToFlowState(pendingCartData.current, items)
    setState(prev => ({ ...prev, ...restored }))
    setShowExistingCart(false)
  }

  const handleStartNew = () => {
    setShowExistingCart(false)
    setShowConfirmClear(true)
  }

  const handleConfirmClear = async () => {
    setClearingCart(true)
    try {
      await fetch('/api/customer/cart', { method: 'DELETE', credentials: 'include' })
      setState({ step: 1, same_address: true, selected_services: [] })
      syncFromServer([])
      pendingCartData.current = null
    } catch { /* silent */ }
    finally { setClearingCart(false); setShowConfirmClear(false) }
  }

  // ---- Save cart step (fire-and-forget, returns draft_order_number) --------
  const saveCartStep = useCallback(async (step: number, data: {
    providerId?: number; addressId?: number; services?: SelectedService[]
    pickupDate?: string; pickupTimeSlot?: string; isExpress?: boolean
  }): Promise<string | undefined> => {
    try {
      const res = await fetch('/api/customer/cart', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          current_step:      step,
          provider_id:       data.providerId  ?? null,
          address_id:        data.addressId   ?? null,
          selected_services: data.services    ?? undefined,
          pickup_date:       data.pickupDate  ?? null,
          pickup_time_slot:  data.pickupTimeSlot ?? null,
          is_express:        data.isExpress   ?? false,
        }),
      })
      const json = await res.json()
      return json.data?.draft_order_number
    } catch { return undefined }
  }, [])

  // ---- Step handlers -------------------------------------------------------
  const handleStep1Complete = useCallback(async (
    address: Address, delivery: Address, provider: LaundryProvider,
    prefetched: { per_kg_services: KgService[]; per_unit_products: UnitProduct[] }
  ) => {
    setPrefetchedServices(prefetched)
    setState(prev => ({ ...prev, step: 2, pickup_address: address, delivery_address: delivery, selected_provider: provider }))
    const draftNum = await saveCartStep(2, { providerId: provider.id, addressId: address.id })
    if (draftNum) setState(prev => ({ ...prev, draft_order_number: draftNum }))
  }, [saveCartStep])

  const handleStep2Complete = useCallback(async (services: SelectedService[]) => {
    setState(prev => ({ ...prev, step: 3, selected_services: services }))
    syncFromServer(toCartLineItems(services))
    const draftNum = await saveCartStep(3, {
      services, isExpress: services.some(s => s.is_express),
      providerId: state.selected_provider?.id, addressId: state.pickup_address?.id,
    })
    if (draftNum) setState(prev => ({ ...prev, draft_order_number: draftNum }))
  }, [saveCartStep, state.selected_provider?.id, state.pickup_address?.id, syncFromServer])

  const handleStep3Complete = useCallback(async (date: string, timeSlot: string) => {
    setState(prev => ({ ...prev, step: 4, pickup_date: date, pickup_time_slot: timeSlot }))
    const draftNum = await saveCartStep(4, {
      pickupDate: date, pickupTimeSlot: timeSlot,
      providerId: state.selected_provider?.id, addressId: state.pickup_address?.id,
    })
    if (draftNum) setState(prev => ({ ...prev, draft_order_number: draftNum }))
  }, [saveCartStep, state.selected_provider?.id, state.pickup_address?.id])

  const handleExpressToggle = useCallback(async (isExpress: boolean, updatedServices: SelectedService[]) => {
    setState(prev => ({ ...prev, selected_services: updatedServices }))
    syncFromServer(toCartLineItems(updatedServices))
    await saveCartStep(4, {
      services: updatedServices, isExpress,
      providerId: state.selected_provider?.id, addressId: state.pickup_address?.id,
    })
  }, [saveCartStep, state.selected_provider?.id, state.pickup_address?.id, syncFromServer])
  
  // Order already exists in the DB at this point (created by handleSubmitOrder
  // before this is ever called) — we just ask the order-bound /pay endpoint
  // for gateway checkout data and launch whichever provider is active.
  const initiateOnlinePayment = async (orderId: string, orderNumber: string) => {
    const gwRes  = await fetch(`/api/customer/orders/${orderId}/pay`, {
      method: 'POST', credentials: 'include',
    })
    const gwData = await gwRes.json()
    if (!gwRes.ok || !gwData.success) throw new Error(gwData.error || 'Failed to initiate payment')

    await launchGatewayCheckout(gwData.data, {
      orderNumber,
      customerName:  (user as any)?.full_name ?? (user as any)?.name,
      customerEmail: (user as any)?.email,
      onRazorpaySuccess: async (paymentId, signature, gatewayOrderId) => {
        const vRes  = await fetch('/api/customer/payments/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            order_id: orderId, gateway_order_id: gatewayOrderId,
            gateway_payment_id: paymentId, signature,
          }),
        })
        const vData = await vRes.json()
        if (!vData.success || !vData.data.verified) throw new Error('Payment verification failed')
        setConfirmed(true)
      },
    })
  }

  // ---- Submit order --------------------------------------------------------
  const handleSubmitOrder = useCallback(async (paymentMethod: string, walletAmount: number) => {
    if (!user || !state.selected_provider || !state.pickup_address) {
      toast({ title: 'Missing information', description: 'Please complete all steps', variant: 'destructive' })
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/customer/orders/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          laundry_profile_id:    state.selected_provider.id,
          address_id:            state.pickup_address.id,
          pickup_address:        JSON.stringify(state.pickup_address),
          delivery_address:      JSON.stringify(state.delivery_address ?? state.pickup_address),
          pickup_date:           state.pickup_date,
          pickup_time_slot:      state.pickup_time_slot,
          is_express:            state.selected_services.some(s => s.is_express),
          services:              state.selected_services,
          payment_method:        paymentMethod,
          wallet_amount:         walletAmount,
          coupon_code:           state.applied_coupon?.code,
          special_instructions:  state.special_instructions,
          // Idempotency key — if API already created this order, returns existing
          draft_order_number:    state.draft_order_number,
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error || 'Failed to create order')

      setState(prev => ({
        ...prev,
        order_id:     result.data.order_id,
        order_number: result.data.order_number,
        payment_method: paymentMethod,
      }))

      const isCodBased = paymentMethod === 'cod' || paymentMethod.endsWith('+cod')
      const needsGateway = result.data.payment_required && !result.data.payment_fully_covered && !isCodBased

      if (!needsGateway) {
        // COD or fully wallet-covered — the order is final right now (the
        // server cart was already cleared by the API for this case), so
        // wipe the guest/local cart (localStorage + header badge) too.
        clearGuestCart()
      }
      // For an online payment, the cart deliberately stays put — both the
      // server cart and this local one — until the gateway callback actually
      // confirms payment (cleared on /customer/orders/payment/success), so a
      // failed/abandoned payment leaves checkout retryable with items intact.

      if (needsGateway) {
        // The order already exists at this point — if the gateway launch
        // fails or the user dismisses it, send them to the failure page
        // (Retry Payment / Continue with COD / Cancel) instead of just a toast.
        try {
          setGatewayRedirecting(true)
          await initiateOnlinePayment(result.data.order_id, result.data.order_number)
        } catch (gatewayErr: any) {
          setGatewayRedirecting(false)
          router.push(`/customer/orders/payment/failure?order_id=${result.data.order_id}`)
          return
        }
      } else {
        setConfirmed(true)
      }
    } catch (err: any) {
      toast({ title: 'Order failed', description: err.message || 'Please try again', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }, [state, user, toast, router])

  const handleBack = () => {
    if (state.step > 1) setState(prev => ({ ...prev, step: (prev.step - 1) as any }))
    else router.push('/customer/dashboard')
  }

  // ---- Render states -------------------------------------------------------
  if (authLoading || cartLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }
  if (!user) return null
  if (confirmed && state.order_id && state.order_number) {
    return <OrderConfirmation orderNumber={state.order_number} orderId={state.order_id} />
  }

  return (
    <>
      {/* Gateway redirect overlay — shown while browser is loading the payment page */}
      {gatewayRedirecting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20"/>
            <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary"/>
          </div>
          <div className="text-center space-y-1.5 px-6 max-w-xs">
            <p className="text-base font-semibold text-foreground">Connecting to payment partner…</p>
            <p className="text-sm text-muted-foreground">You will be redirected to our secure payment page shortly. Please do not close or refresh this tab.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-sm">
            <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            256-bit SSL encrypted &amp; secure
          </div>
          <button
            type="button"
            onClick={() => {
              const cancel = window.confirm('Are you sure you want to cancel the payment? You can retry or switch to Cash on Delivery.')
              if (cancel) {
                setGatewayRedirecting(false)
                const orderId = (state as any).order_id
                if (orderId) router.push(`/customer/orders/payment/failure?order_id=${orderId}`)
              }
            }}
            className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Cancel payment
          </button>
        </div>
      )}

      <div className="min-h-screen bg-muted/20">
        {/* Step header */}
        <div className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
          <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            <button type="button" onClick={handleBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{state.step === 1 ? 'Dashboard' : 'Back'}</span>
            </button>
            <div className="flex items-center gap-1 sm:gap-2">
              {STEPS.map((step, i) => {
                const isActive = state.step === step.number
                const isDone   = state.step > step.number
                const Icon     = step.icon
                return (
                  <div key={step.number} className="flex items-center">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all sm:h-9 sm:w-9',
                      isDone   ? 'bg-emerald-500 text-white' :
                      isActive ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {isDone ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={cn(
                      'ml-1.5 hidden text-xs font-medium sm:inline',
                      isActive ? 'text-foreground' : isDone ? 'text-emerald-600' : 'text-muted-foreground'
                    )}>{step.title}</span>
                    {i < STEPS.length - 1 && (
                      <div className={cn(
                        'mx-1.5 h-0.5 w-4 sm:w-6 rounded-full transition-colors',
                        state.step > step.number ? 'bg-emerald-400' : 'bg-border/60'
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
            <button type="button" onClick={() => router.push('/customer/dashboard')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </div>
          <div className="h-0.5 bg-muted">
            <motion.div className="h-full bg-primary" initial={false}
              animate={{ width: `${(state.step / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }} />
          </div>
        </div>

        <div className="container mx-auto max-w-6xl px-4 py-6 sm:py-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              {state.step === 1 && 'Select Address & Provider'}
              {state.step === 2 && `Services — ${state.selected_provider?.business_name}`}
              {state.step === 3 && 'Schedule Pickup'}
              {state.step === 4 && 'Review & Pay'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Step {state.step} of {STEPS.length}</p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={state.step}
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>

              {state.step === 1 && (
                <AddressProviderStep
                  initialAddress={state.pickup_address}
                  initialProvider={state.selected_provider}
                  onComplete={handleStep1Complete}
                />
              )}
              {state.step === 2 && state.selected_provider && (
                <ServiceSelectionStep
                  provider={state.selected_provider}
                  initialSelected={state.selected_services}
                  prefetchedServices={prefetchedServices}
                  onComplete={handleStep2Complete}
                />
              )}
              {state.step === 3 && state.selected_provider && (
                <SchedulePickup
                  provider={state.selected_provider}
                  pickupAddress={state.pickup_address}
                  onSelect={handleStep3Complete}
                  initialDate={state.pickup_date ?? undefined}
                  initialTimeSlot={state.pickup_time_slot ?? undefined}
                />
              )}
              {state.step === 4 && (
                <CheckoutStep
                  orderState={state}
                  onCouponApply={coupon => setState(prev => ({ ...prev, applied_coupon: coupon ?? undefined }))}
                  onSpecialInstructions={val => setState(prev => ({ ...prev, special_instructions: val }))}
                  onExpressToggle={handleExpressToggle}
                  onEditServices={() => setState(prev => ({ ...prev, step: 2 }))}
                  onSubmit={handleSubmitOrder}
                  isSubmitting={isSubmitting}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showExistingCart && existingCartMeta && (
          <ExistingCartModal
            cartStep={existingCartMeta.step}
            providerName={existingCartMeta.providerName}
            itemCount={existingCartMeta.itemCount}
            onContinue={handleContinueExisting}
            onStartNew={handleStartNew}
            onClose={() => setShowExistingCart(false)}
          />
        )}
        {showConfirmClear && (
          <ConfirmClearModal
            onConfirm={handleConfirmClear}
            onCancel={() => { setShowConfirmClear(false); setShowExistingCart(true) }}
            loading={clearingCart}
          />
        )}
      </AnimatePresence>
    </>
  )
}
export default function CreateOrderPage() {
  return (
    <SearchParamProvider>
      <PageContent />
    </SearchParamProvider>
  )
}