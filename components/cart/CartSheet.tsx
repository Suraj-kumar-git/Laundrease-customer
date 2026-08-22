'use client'
// components/cart/CartSheet.tsx
// Updated: Continue button links to /customer/orders/create?resume=1
// so the create page knows to restore state without showing the popup.
// Also shows which step the customer paused at.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, X, Loader2, Trash2, ArrowRight,
  ShoppingBag, RefreshCw, MapPin, Calendar, Plus, Minus, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { useCart } from '@/components/cart-provider'
import { serverItemsToCartLineItems, makeCartItemKey } from '@/lib/cart-store'

interface CartItem {
  cart_item_id:      number
  product_type_name: string
  pricing_model:     string
  icon:              string
  service_name:      string
  quantity:          number
  weight_kg:         number | null
  unit_price:        number
  line_total:        number
  is_express:        boolean
}

interface CartData {
  id:                 number
  subtotal:           number
  total_amount:       number
  is_express:         boolean
  updated_at:         string
  current_step:       number
  pickup_date:        string | null
  pickup_time_slot:   string | null
  draft_order_number: string | null
  provider: { id: number; business_name: string; city: string | null } | null
  address:  { id: number; label: string; address_line1: string; city: string } | null
}

const STEP_LABELS: Record<number, string> = {
  1: 'Choose provider',
  2: 'Select services',
  3: 'Pick schedule',
  4: 'Checkout',
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Compact -/value/+ control used by every cart row (guest and signed-in
// alike). Decrementing past the floor (1 unit / 0.5kg) is the caller's cue
// to open the remove-confirmation modal instead of going to 0 silently.
function QtyStepper({
  displayValue, onDecrement, onIncrement, disabled,
}: {
  displayValue: string
  onDecrement: () => void
  onIncrement: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={onDecrement} disabled={disabled}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-40">
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-9 text-center text-xs font-semibold text-foreground">{displayValue}</span>
      <button type="button" onClick={onIncrement} disabled={disabled}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-40">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

interface PendingRemoval {
  scope: 'guest' | 'server'
  key?: string       // guest cart item key (product_type_id_service_id)
  itemId?: number    // server cart_item_id
  label: string       // shown in the confirm modal
}

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router   = useRouter()
  const { user } = useAuth()
  const {
    syncing: cartSyncing,
    items:    guestItems,
    subtotal: guestSubtotal,
    clear:    clearGuestCart,
    updateItem: updateGuestItem,
    removeItem: removeGuestItem,
    syncFromServer,
    placeOrder,
  } = useCart()
  const [cart,     setCart]     = useState<CartData | null>(null)
  const [items,    setItems]    = useState<CartItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [clearing, setClearing] = useState(false)
  // Row being mutated (server cart only — guest updates are instant/local)
  const [busyItemId, setBusyItemId]  = useState<number | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)

  const fetchCart = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res  = await fetch('/api/customer/cart', { credentials: 'include' })
      const json = await res.json()
      if (json.success) {
        setCart(json.data?.cart ?? null)
        setItems(json.data?.items ?? [])
        // Reconcile the guest-cart cache (and header badge) to the server's
        // truth every time the signed-in sheet loads — closes the gap where
        // a stale local cache kept showing items after they'd been cleared
        // server-side (e.g. right after placing an order).
        syncFromServer(serverItemsToCartLineItems(json.data?.items ?? []))
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [user, syncFromServer])

  // Wait for the post-login guest→server sync to finish before fetching —
  // otherwise this can read the cart before items have been pushed and
  // incorrectly show "cart is empty".
  useEffect(() => { if (open && !cartSyncing) fetchCart() }, [open, cartSyncing, fetchCart])

  const handleClearCart = async () => {
    setClearing(true)
    try {
      await fetch('/api/customer/cart', { method: 'DELETE', credentials: 'include' })
      setCart(null); setItems([])
      // Keep the local guest-cart cache (and header badge) in sync — it can
      // hold stale pre-login items that the server-side delete above never touches.
      clearGuestCart()
    } catch { /* silent */ }
    finally { setClearing(false) }
  }

  // Navigate to create page with resume=1 so it jumps to the saved step
  const handleContinue = () => {
    onClose()
    router.push('/customer/orders/create?resume=1')
  }

  // Server-cart item mutations — the DB trigger chain (see scripts/03-create-
  // function.sql: trg_ci_recompute_services -> trg_cis_compute_line_total_upd
  // -> trg_cis_recalc_totals) recomputes line_total/subtotal automatically,
  // so this route is a plain UPDATE/DELETE; refetch afterwards for the
  // authoritative numbers rather than re-deriving them client-side.
  const updateServerItemQty = async (itemId: number, field: 'quantity' | 'weight_kg', value: number) => {
    setBusyItemId(itemId)
    try {
      await fetch(`/api/customer/cart/items/${itemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ [field]: value }),
      })
      await fetchCart()
    } catch { /* silent */ }
    finally { setBusyItemId(null) }
  }

  const removeServerItem = async (itemId: number) => {
    setBusyItemId(itemId)
    try {
      await fetch(`/api/customer/cart/items/${itemId}`, { method: 'DELETE', credentials: 'include' })
      await fetchCart()
    } catch { /* silent */ }
    finally { setBusyItemId(null) }
  }

  const confirmRemoval = async () => {
    if (!pendingRemoval) return
    if (pendingRemoval.scope === 'guest' && pendingRemoval.key) {
      removeGuestItem(pendingRemoval.key)
    } else if (pendingRemoval.scope === 'server' && pendingRemoval.itemId != null) {
      await removeServerItem(pendingRemoval.itemId)
    }
    setPendingRemoval(null)
  }

  // Total pieces, not distinct lines — matches the site-wide header badge's
  // own convention (cart-provider's itemCount) so the two never disagree.
  const totalPieces = items.reduce(
    (sum, item) => item.pricing_model === 'per_unit' ? sum + item.quantity : sum + 1, 0
  )

  // Group items by service
  const grouped = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    acc[item.service_name] = acc[item.service_name] ?? []
    acc[item.service_name].push(item)
    return acc
  }, {})

  // Guest (unauthenticated) cart — read straight from the local session cart,
  // no server round-trip. Grouped the same way as the signed-in view.
  const guestGrouped = guestItems.reduce<Record<string, typeof guestItems>>((acc, item) => {
    acc[item.service_name] = acc[item.service_name] ?? []
    acc[item.service_name].push(item)
    return acc
  }, {})

  // Guests can see their cart, but placing an order requires signing in.
  const handleGuestProceed = () => {
    onClose()
    placeOrder()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />

          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-border/50 bg-background shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-foreground">Your Cart</h2>
                {totalPieces > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {totalPieces}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {items.length > 0 && (
                  <button onClick={fetchCart}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Refresh">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onClose}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {loading || (user && cartSyncing) ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !user ? (
                guestItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
                    <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
                    <div>
                      <p className="font-medium text-foreground">Cart is empty</p>
                      <p className="mt-1 text-sm text-muted-foreground">Start a new order to add services</p>
                    </div>
                    {/* Guests go to the public services page, not the order
                        builder. /customer/orders/create is a protected route,
                        so sending a logged-out visitor there bounced them
                        straight to a login wall from a button that only
                        promised to show them what's on offer. */}
                    <button onClick={() => { onClose(); router.push('/customer/services') }}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                      Browse Services
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 p-3.5">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                      You&apos;re browsing as a guest — sign in when you&apos;re ready to place this order.
                    </div>

                    {Object.entries(guestGrouped).map(([serviceName, serviceItems]) => (
                      <div key={serviceName} className="overflow-hidden rounded-xl border border-border/50 bg-card">
                        <div className="border-b border-border/40 bg-muted/30 px-3.5 py-1.5">
                          <p className="text-xs font-semibold text-muted-foreground">{serviceName}</p>
                        </div>
                        <div className="divide-y divide-border/30">
                          {serviceItems.map(item => {
                            const isPerKg = item.pricing_model === 'per_kg' && item.weight_kg != null
                            const key = makeCartItemKey(item.product_type_id, item.service_id)
                            const step = isPerKg ? 0.5 : 1
                            const atFloor = isPerKg ? item.weight_kg <= 0.5 : item.quantity <= 1
                            const field: 'quantity' | 'weight_kg' = isPerKg ? 'weight_kg' : 'quantity'
                            const currentVal = isPerKg ? item.weight_kg : item.quantity
                            return (
                              <div key={`${item.product_type_id}-${item.service_id}`} className="flex items-center gap-2.5 px-3.5 py-2">
                                <span className="shrink-0 text-base">{item.icon ?? '🧺'}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">{item.product_type_name}</p>
                                  {item.is_express && <span className="text-[10px] font-medium text-amber-600">Express</span>}
                                </div>
                                <QtyStepper
                                  displayValue={isPerKg ? `${item.weight_kg}kg` : String(item.quantity)}
                                  onDecrement={() => {
                                    if (atFloor) setPendingRemoval({ scope: 'guest', key, label: item.product_type_name })
                                    else updateGuestItem(key, field, Math.round((currentVal - step) * 100) / 100)
                                  }}
                                  onIncrement={() => updateGuestItem(key, field, Math.round((currentVal + step) * 100) / 100)}
                                />
                                <span className="shrink-0 text-right text-sm">
                                  {item.mrp && item.mrp > item.unit_price && (
                                    <span className="block text-[10px] text-muted-foreground line-through">
                                      {formatINR(item.mrp * (isPerKg ? item.weight_kg : item.quantity))}
                                    </span>
                                  )}
                                  <span className="font-semibold text-foreground">{formatINR(item.line_total)}</span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    <button onClick={clearGuestCart}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                      Clear Cart
                    </button>
                  </div>
                )
              ) : !cart || items.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
                  <div>
                    <p className="font-medium text-foreground">Cart is empty</p>
                    <p className="mt-1 text-sm text-muted-foreground">Start a new order to add services</p>
                  </div>
                  <button onClick={() => { onClose(); router.push('/customer/orders/create') }}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    Browse Services
                  </button>
                </div>
              ) : (
                <div className="space-y-3 p-3.5">
                  {/* Progress summary */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Updated {timeAgo(cart.updated_at)}</span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                        Step {cart.current_step}: {STEP_LABELS[cart.current_step] ?? `Step ${cart.current_step}`}
                      </span>
                    </div>

                    {/* Provider summary */}
                    {cart.provider && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium text-foreground">{cart.provider.business_name}</span>
                        {cart.provider.city && <span>· {cart.provider.city}</span>}
                      </div>
                    )}

                    {/* Schedule summary */}
                    {cart.pickup_date && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{new Date(cart.pickup_date.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        {cart.pickup_time_slot && <span>· {cart.pickup_time_slot}</span>}
                      </div>
                    )}
                  </div>

                  {/* Items grouped by service */}
                  {Object.entries(grouped).map(([serviceName, serviceItems]) => (
                    <div key={serviceName} className="overflow-hidden rounded-xl border border-border/50 bg-card">
                      <div className="border-b border-border/40 bg-muted/30 px-3.5 py-1.5">
                        <p className="text-xs font-semibold text-muted-foreground">{serviceName}</p>
                      </div>
                      <div className="divide-y divide-border/30">
                        {serviceItems.map(item => {
                          const isPerKg = item.pricing_model === 'per_kg' && item.weight_kg != null
                          const step = isPerKg ? 0.5 : 1
                          const currentVal = isPerKg ? (item.weight_kg ?? 0) : item.quantity
                          const atFloor = currentVal <= step
                          const field: 'quantity' | 'weight_kg' = isPerKg ? 'weight_kg' : 'quantity'
                          const busy = busyItemId === item.cart_item_id
                          return (
                            <div key={item.cart_item_id} className="flex items-center gap-2.5 px-3.5 py-2">
                              <span className="shrink-0 text-base">{item.icon ?? '🧺'}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">{item.product_type_name}</p>
                                {item.is_express && <span className="text-[10px] font-medium text-amber-600">Express</span>}
                              </div>
                              <QtyStepper
                                displayValue={isPerKg ? `${item.weight_kg}kg` : String(item.quantity)}
                                disabled={busy}
                                onDecrement={() => {
                                  if (atFloor) setPendingRemoval({ scope: 'server', itemId: item.cart_item_id, label: item.product_type_name })
                                  else updateServerItemQty(item.cart_item_id, field, Math.round((currentVal - step) * 100) / 100)
                                }}
                                onIncrement={() => updateServerItemQty(item.cart_item_id, field, Math.round((currentVal + step) * 100) / 100)}
                              />
                              <span className="shrink-0 w-16 text-right text-sm font-semibold text-foreground">
                                {busy ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" /> : formatINR(item.line_total)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Clear */}
                  <button onClick={handleClearCart} disabled={clearing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
                    {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Clear Cart
                  </button>
                </div>
              )}
            </div>

            {/* Footer CTA */}
            {!user && guestItems.length > 0 && (
              <div className="border-t border-border/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-bold text-foreground">{formatINR(guestSubtotal)}</span>
                </div>
                <button onClick={handleGuestProceed}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90">
                  Sign In to Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  You&apos;ll need to sign in to place this order
                </p>
              </div>
            )}
            {cart && items.length > 0 && (
              <div className="border-t border-border/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-bold text-foreground">{formatINR(cart.subtotal)}</span>
                </div>
                <button onClick={handleContinue}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90">
                  Continue Order
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Tap to continue from where you left off
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* Remove-item confirmation */}
      {pendingRemoval && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPendingRemoval(null)} className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-sm rounded-2xl border border-border/50 bg-background p-5 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Remove item?</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Remove <span className="font-medium text-foreground">{pendingRemoval.label}</span> from your cart?
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPendingRemoval(null)}
                className="flex-1 rounded-xl border border-border/50 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
                Cancel
              </button>
              <button type="button" onClick={confirmRemoval}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90">
                Remove
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
