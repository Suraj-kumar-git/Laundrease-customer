'use client'
// components/cart-provider.tsx
// Shared client-side cart used by /customer/services and
// /customer/pricing-calculator (and read by the header badge).
//
// Design:
// - Cart state lives in localStorage, mirrored in React state — works for
//   guests and signed-in users alike, no per-keystroke API calls.
// - Once, when a user transitions from logged-out to logged-in with local
//   items pending, they're pushed to the server cart (POST /api/customer/cart).
// - Once, on initial mount while already signed in, the server cart is
//   fetched to hydrate (covers a cart built earlier via the full
//   order-creation flow) — only if the local cart is empty, so we never
//   clobber items the visitor is actively building.
// - "Place Order" pushes the final cart to the server (one call) and
//   navigates into /customer/orders/create?resume=1, which is the existing
//   resume flow. No background polling anywhere.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import type { CartLineItem } from '@/types/pricing'
import {
  loadCartFromStorage, saveCartToStorage, clearCartStorage,
  calcLineTotal, cartItemsToSelectedServices, serverItemsToCartLineItems,
  makeCartItemKey, getSyncedUserId, setSyncedUserId,
} from '@/lib/cart-store'

interface CartContextType {
  items: CartLineItem[]
  itemCount: number
  subtotal: number
  isExpress: boolean
  toggleExpress: () => void
  addItem: (item: Omit<CartLineItem, 'line_total' | 'is_express' | 'express_multiplier'> & { express_multiplier?: number }) => void
  updateItem: (key: string, field: 'quantity' | 'weight_kg', value: number) => void
  removeItem: (key: string) => void
  clear: () => void
  // Overwrites local state + localStorage with the server cart's current
  // items — used to keep the header badge truthful whenever a signed-in
  // view (e.g. CartSheet) reads the authoritative server cart, instead of
  // trusting whatever this guest-cart cache last happened to hold.
  syncFromServer: (items: CartLineItem[]) => void
  placeOrder: () => Promise<void>
  placing: boolean
  // True while the post-login guest→server sync (or initial server hydration)
  // is in flight — UI that reads the cart (e.g. CartSheet) should wait for
  // this to settle before treating an empty result as "cart is empty".
  syncing: boolean
  // Shared target for the "fly to cart" add animation — the header cart
  // button attaches this ref to itself; any component that wants to animate
  // an item flying into the cart reads its current bounding rect off it.
  cartIconRef: React.RefObject<HTMLButtonElement | null>
  // Increments each time an add animation lands, so the header badge can
  // play a little pulse in response without the two components needing a
  // direct reference to each other.
  bumpSignal: number
  bumpCartIcon: () => void
  // Lets a screen suppress the header cart button while it's mounted. Used by
  // the order flow's checkout step: the drawer edits the SERVER cart, while
  // checkout renders (and submits) its own React state, so editing there
  // silently diverged the two — the removed item stayed on screen and was
  // still ordered. Every other step keeps the cart.
  cartIconHidden: boolean
  setCartIconHidden: (hidden: boolean) => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const [items, setItems] = useState<CartLineItem[]>([])
  const [isExpress, setIsExpress] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const hydratedFromStorage = useRef(false)
  const syncedForUser = useRef<string | null>(null)
  const cartIconRef = useRef<HTMLButtonElement>(null)
  const [bumpSignal, setBumpSignal] = useState(0)
  const bumpCartIcon = useCallback(() => setBumpSignal(s => s + 1), [])
  const [cartIconHidden, setCartIconHidden] = useState(false)

  // Load local cart once on mount.
  useEffect(() => {
    setItems(loadCartFromStorage())
    hydratedFromStorage.current = true
  }, [])

  // Mirror to localStorage on every change (cheap, local-only).
  useEffect(() => {
    if (!hydratedFromStorage.current) return
    saveCartToStorage(items)
  }, [items])

  // Once per sign-in: if local (guest) cart has items, push them to the
  // server — forcing current_step back to 1 and clearing any stale
  // provider/address binding, since these items were never matched against
  // a specific provider's service area. This guarantees the resume flow
  // always starts at "choose provider" instead of trusting a stale region
  // selection from an earlier session. If local is empty, hydrate from
  // whatever's already on the server (built earlier via the full order
  // flow) — never overwrite items already in progress.
  useEffect(() => {
    if (!user || !hydratedFromStorage.current) return
    if (syncedForUser.current === user.id) return
    syncedForUser.current = user.id

    setSyncing(true)
    const sync = async () => {
      try {
        // Only push local items to server once per user+device session — prevents
        // re-pushing stale localStorage items on every page reload which would
        // overwrite a server cart that's already advanced to a later step.
        const alreadySynced = getSyncedUserId() === user.id
        if (!alreadySynced) {
          setSyncedUserId(user.id)
          if (items.length > 0) {
            await fetch('/api/customer/cart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                selected_services: cartItemsToSelectedServices(items),
                is_express: isExpress,
                current_step: 1,
                reset_provider: true,
              }),
            })
          }
        }
        // Always GET to hydrate the header badge — covers new devices, incognito
        // windows, same-browser new tabs, and any case where the local mirror
        // is stale or missing. The in-memory syncedForUser ref prevents this
        // from running more than once per mounted CartProvider session.
        const res = await fetch('/api/customer/cart', { credentials: 'include' })
        const j = await res.json()
        if (j.success && j.data?.has_items) {
          setItems(serverItemsToCartLineItems(j.data.items))
          setIsExpress(!!j.data.cart?.is_express)
        }
      } catch {
        // leave local state as-is — next interaction (e.g. Place Order) retries the push
      } finally {
        setSyncing(false)
      }
    }
    sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const addItem = useCallback((
    item: Omit<CartLineItem, 'line_total' | 'is_express' | 'express_multiplier'> & { express_multiplier?: number }
  ) => {
    setItems(prev => {
      const key = makeCartItemKey(item.product_type_id, item.service_id)
      const expressMultiplier = item.express_multiplier ?? 1.5
      const lineTotal = calcLineTotal({
        pricing_model: item.pricing_model,
        unit_price: item.unit_price,
        quantity: item.quantity,
        weight_kg: item.weight_kg,
        is_express: isExpress,
        express_multiplier: expressMultiplier,
      })
      const next = prev.filter(i => makeCartItemKey(i.product_type_id, i.service_id) !== key)
      next.push({ ...item, is_express: isExpress, express_multiplier: expressMultiplier, line_total: lineTotal })
      return next
    })
  }, [isExpress])

  const updateItem = useCallback((key: string, field: 'quantity' | 'weight_kg', value: number) => {
    setItems(prev => prev.map(item => {
      if (makeCartItemKey(item.product_type_id, item.service_id) !== key) return item
      const updated = { ...item, [field]: value }
      updated.line_total = calcLineTotal(updated)
      return updated
    }))
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems(prev => prev.filter(item => makeCartItemKey(item.product_type_id, item.service_id) !== key))
  }, [])

  const clear = useCallback(() => {
    setItems([])
    clearCartStorage()
  }, [])

  const syncFromServer = useCallback((serverItems: CartLineItem[]) => {
    setItems(serverItems)
  }, [])

  const toggleExpress = useCallback(() => {
    setIsExpress(prev => {
      const next = !prev
      setItems(current => current.map(item => {
        const updated = { ...item, is_express: next }
        updated.line_total = calcLineTotal(updated)
        return updated
      }))
      return next
    })
  }, [])

  const placeOrder = useCallback(async () => {
    if (!user) {
      router.push(`/customer/auth/login?returnTo=${encodeURIComponent(pathname || '/customer/services')}`)
      return
    }
    if (items.length === 0) return
    setPlacing(true)
    try {
      await fetch('/api/customer/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selected_services: cartItemsToSelectedServices(items), is_express: isExpress }),
      })
      // Items are now owned by the server-side checkout flow — clear the
      // local guest-cart mirror so it can't resurrect a stale copy on the
      // server (e.g. on a fresh page load after the PayU/Cashfree redirect
      // remounts CartProvider, which re-pushes any leftover local items).
      setItems([])
      clearCartStorage()
      router.push('/customer/orders/create?resume=1')
    } finally {
      setPlacing(false)
    }
  }, [user, items, isExpress, router, pathname])

  const itemCount = useMemo(
    () => items.reduce((sum, item) => item.pricing_model === 'per_unit' ? sum + item.quantity : sum + 1, 0),
    [items]
  )
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.line_total, 0), [items])

  const value: CartContextType = {
    items, itemCount, subtotal, isExpress, toggleExpress,
    addItem, updateItem, removeItem, clear, syncFromServer, placeOrder, placing, syncing,
    cartIconRef, bumpSignal, bumpCartIcon,
    cartIconHidden, setCartIconHidden,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
