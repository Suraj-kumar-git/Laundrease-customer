'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'

/**
 * Renders the "Get Started Free" → register CTA only for logged-out
 * visitors; logged-in customers see a CTA pointing at placing an order
 * instead. Lets the surrounding page (e.g. about/page.tsx) stay a static
 * server component while this one interactive sliver reads auth state.
 */
export function GuestOnlyCta({ className }: { className?: string }) {
  const { user, isLoading } = useAuth()

  // Avoid a flash of the wrong CTA while the auth check is still in flight.
  if (isLoading) return null

  if (user) {
    return (
      <Link href="/customer/orders/create" className={className}>
        Schedule a Pickup
        <ArrowRight className="h-4 w-4" />
      </Link>
    )
  }

  return (
    <Link href="/customer/auth/register" className={className}>
      Get Started Free
      <ArrowRight className="h-4 w-4" />
    </Link>
  )
}
