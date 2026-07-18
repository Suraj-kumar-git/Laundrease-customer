'use client'
// components/customer/MobileBottomNav.tsx
// Fixed bottom navigation for the customer app on mobile (hidden on lg+).
// Rendered from app/customer/layout.tsx. Self-hides when:
//  - the user isn't logged in (marketing pages keep the plain header/footer)
//  - inside flows that have their own bottom UI or shouldn't be escaped
//    mid-way (order create, checkout, payment result, auth pages)
// A spacer div keeps page content (incl. the footer) clear of the fixed bar.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package, Plus, LifeBuoy, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'

const HIDDEN_PREFIXES = [
  '/customer/orders/create',
  '/customer/orders/payment',
  '/customer/checkout',
  '/customer/auth',
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { user } = useAuth()

  if (!user || user.role !== 'customer') return null
  if (HIDDEN_PREFIXES.some(p => pathname?.startsWith(p))) return null

  // Account tab goes to My Profile (matches the header's "My Profile" link
  // and the UserCircle icon) — Settings is reached from there, not directly
  // from the bottom nav.
  const TABS = [
    { href: '/customer/dashboard', label: 'Home',    icon: Home,       match: ['/customer/dashboard'] },
    { href: '/customer/orders',    label: 'Orders',  icon: Package,    match: ['/customer/orders'] },
    null, // center slot — New Order
    { href: '/customer/support',   label: 'Tickets', icon: LifeBuoy,   match: ['/customer/support'] },
    { href: `/customer/profile/${user.id}`, label: 'Account', icon: UserCircle, match: ['/customer/profile', '/customer/settings', '/customer/addresses'] },
  ] as const

  return (
    <>
      {/* Spacer — last element in the page column so the footer can scroll
          fully above the fixed bar */}
      <div className="h-16 lg:hidden" />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
          {TABS.map((tab, i) => {
            if (tab === null) {
              return (
                <Link key="new-order" href="/customer/orders/create" aria-label="New Order"
                  className="flex -translate-y-3 flex-col items-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95">
                    <Plus className="h-6 w-6" />
                  </span>
                  <span className="mt-0.5 text-[10px] font-semibold text-primary">New Order</span>
                </Link>
              )
            }
            const active = tab.match.some(m => pathname?.startsWith(m))
            const Icon = tab.icon
            return (
              <Link key={tab.href} href={tab.href}
                className={cn(
                  'flex min-w-[56px] flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}>
                <Icon className={cn('h-5 w-5', active && 'fill-primary/10')} />
                <span className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
