'use client'
// components/header/HeaderWithCart.tsx
// Client wrapper that manages CartSheet open state.
// Keeps layout.tsx as a server component.

import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { CartSheet } from '@/components/cart/CartSheet'

export function HeaderWithCart() {
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <>
      <AppHeader onCartClick={() => setCartOpen(true)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}