'use client'
// components/cart/CartSheet.tsx
// Updated: Continue button links to /customer/orders/create?resume=1
// so the create page knows to restore state without showing the popup.
// Also shows which step the customer paused at.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingCart, X, Loader2, Trash2, ArrowRight,
  ShoppingBag, RefreshCw, MapPin, Calendar,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'

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

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router   = useRouter()
  const { user } = useAuth()
  const [cart,     setCart]     = useState<CartData | null>(null)
  const [items,    setItems]    = useState<CartItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchCart = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res  = await fetch('/api/customer/cart', { credentials: 'include' })
      const json = await res.json()
      if (json.success) {
        setCart(json.data?.cart ?? null)
        setItems(json.data?.items ?? [])
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { if (open) fetchCart() }, [open, fetchCart])

  const handleClearCart = async () => {
    setClearing(true)
    try {
      await fetch('/api/customer/cart', { method: 'DELETE', credentials: 'include' })
      setCart(null); setItems([])
    } catch { /* silent */ }
    finally { setClearing(false) }
  }

  // Navigate to create page with resume=1 so it jumps to the saved step
  const handleContinue = () => {
    onClose()
    router.push('/customer/orders/create?resume=1')
  }

  // Group items by service
  const grouped = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    acc[item.service_name] = acc[item.service_name] ?? []
    acc[item.service_name].push(item)
    return acc
  }, {})

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
                {items.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {items.length}
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
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !user ? (
                <div className="flex flex-col items-center gap-4 px-5 py-16 text-center">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Sign in to view your cart</p>
                  <button onClick={() => { onClose(); router.push('/customer/auth/login') }}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    Sign In
                  </button>
                </div>
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
                <div className="space-y-4 p-4">
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
                        <span>{new Date(cart.pickup_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        {cart.pickup_time_slot && <span>· {cart.pickup_time_slot}</span>}
                      </div>
                    )}
                  </div>

                  {/* Items grouped by service */}
                  {Object.entries(grouped).map(([serviceName, serviceItems]) => (
                    <div key={serviceName} className="overflow-hidden rounded-xl border border-border/50 bg-card">
                      <div className="border-b border-border/40 bg-muted/30 px-4 py-2">
                        <p className="text-xs font-semibold text-muted-foreground">{serviceName}</p>
                      </div>
                      <div className="divide-y divide-border/30">
                        {serviceItems.map(item => (
                          <div key={item.cart_item_id} className="flex items-center gap-3 px-4 py-3">
                            <span className="text-lg">{item.icon ?? '🧺'}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{item.product_type_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.pricing_model === 'per_kg' ? `${item.weight_kg} kg` : `×${item.quantity}`}
                                {item.is_express && <span className="ml-1 text-amber-600">· Express</span>}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-foreground">
                              {formatINR(item.line_total)}
                            </span>
                          </div>
                        ))}
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
    </AnimatePresence>
  )
}
