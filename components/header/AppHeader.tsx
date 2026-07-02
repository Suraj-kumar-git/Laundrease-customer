'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart, Menu, X, Home, ShoppingBag, LayoutDashboard,
  User, MapPin, Wallet, Gift, Settings, LogOut, HelpCircle,
  ChevronDown, Loader2, Star, Bell, Sun, Moon, Package,
  Calculator,
  Layers,
  Truck,
  MessagesSquare,
  LifeBuoy,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { useCart } from '@/components/cart-provider'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from "@/components/theme-toggle"

// ---- Types --------------------------------------------------
interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  authRequired: boolean
  guestOnly?: boolean
}

// ---- Nav config (customer app) ------------------------------
const NAV_ITEMS_AUTH: NavItem[] = [
  { href: '/customer/dashboard', label: 'Home', icon: Home, authRequired: true  },
  { href: '/customer/orders/create', label: 'New Order', icon: ShoppingBag, authRequired: true  },
  { href: '/customer/orders',    label: 'My Orders', icon: Package, authRequired: true  },
  { href: '/customer/addresses', label: 'Addresses', icon: MapPin, authRequired: true  },
  { href: '/customer/pricing-calculator', label: 'Pricing', icon: Calculator, authRequired: false  },
  { href: '/customer/quick-pickup', label: 'Quick Pickup', icon: Truck, authRequired: false  },
]
const NAV_ITEMS_NOT_AUTH: NavItem[] = [
  { href: '/customer/services', label: 'Services', icon: Layers, authRequired: false  },
  { href: '/customer/pricing-calculator', label: 'Pricing', icon: Calculator, authRequired: false  },
  { href: '/customer/quick-pickup', label: 'Quick Pickup', icon: Truck, authRequired: false  },
  { href: '/customer/faq', label: 'FAQ', icon: HelpCircle, authRequired: false  },
]

// ---- Remove import of Theme toggle to use the below one only for light or dark-------------------------------------------
// function ThemeToggle() {
//   const { theme, setTheme } = useTheme()
//   const [mounted, setMounted] = useState(false)
//   useEffect(() => setMounted(true), [])
//   if (!mounted) return <div className="h-9 w-9" />

//   return (
//     <button
//       onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
//       className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
//       aria-label="Toggle theme"
//     >
//       {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
//     </button>
//   )
// }

// ---- Cart icon with badge -----------------------------------
export function CartBadge({ onClick }: { onClick: () => void }) {
  const { itemCount: count } = useCart()

  return (
    <button
      onClick={onClick}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label={`Cart${count > 0 ? ` (${count} items)` : ''}`}
    >
      <ShoppingCart className="h-5 w-5" />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
          >
            {count > 9 ? '9+' : count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

// ---- Desktop user dropdown ----------------------------------
function DesktopUserMenu({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const go = (href: string) => { setOpen(false); router.push(href) }

  const menuItems = [
    { icon: User,      label: 'My Profile',    href: `/customer/profile/${user?.id}` },
    { icon: Package,   label: 'My Orders',     href: '/customer/orders' },
    { icon: Gift,      label: 'Refer & Earn',  href: '/customer/refer-and-earn' },
    { icon: MapPin,    label: 'Addresses',     href: '/customer/addresses' },
    { icon: Settings,  label: 'Settings',      href: '/customer/settings' },
    { icon: LifeBuoy,  label: 'My Tickets',    href: '/customer/support' },
    { icon: HelpCircle,label: 'Help Center',   href: '/customer/help-center' },
    { icon: MessagesSquare, label: 'Feedback', href: '/customer/feedback'  },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all',
          open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        {/* Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
        </div>
        <span className="hidden max-w-[100px] truncate lg:block">{user?.name?.split(' ')[0]}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            // right-0 keeps it from going offscreen; max-h + overflow-y for safety
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-xl"
          >
            {/* User info header */}
            <div className="border-b border-border/40 px-4 py-3">
              <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {menuItems.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.href}
                    onClick={() => go(item.href)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </button>
                )
              })}
            </div>

            {/* Logout */}
            <div className="border-t border-border/40 py-1.5">
              <button
                onClick={() => { setOpen(false); onLogout() }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---- Main Header --------------------------------------------
export function AppHeader({ onCartClick }: { onCartClick: () => void }) {
  const { user, logout, isLoading } = useAuth()
  const pathname = usePathname()
  const router   = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  // Close mobile menu on route change
  useEffect(() => { setMobileMenuOpen(false) }, [pathname])

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  const handleLogout = async () => {
    setMobileMenuOpen(false)
    try {
      await fetch('/api/customer/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* ignore */ }
    logout?.()
    router.push('/')
  }

  const isActive = (href: string) =>
    href === '/customer/dashboard'
      ? pathname === href
      : pathname.startsWith(href)

  // Logged-in mobile menu items (nav + account merged)
  const mobileLoggedInItems = [
    { href: '/customer/dashboard',    label: 'Home',        icon: Home },
    { href: '/customer/orders/create',label: 'New Order',   icon: ShoppingBag },
    { href: '/customer/orders',       label: 'My Orders',   icon: Package },
    // divider placeholder â€” handled by index
    { href: '/customer/addresses',    label: 'Addresses',   icon: MapPin },
    { href: `/customer/profile/${user?.id}`, label: 'My Profile', icon: User },
    { href: '/customer/refer-and-earn', label: 'Refer & Earn', icon: Gift },
    { href: '/customer/settings',     label: 'Settings',    icon: Settings },
    { href: '/customer/feedback',     label: 'Feedback', icon: MessagesSquare },
    { href: '/customer/support',      label: 'My Tickets', icon: LifeBuoy },
    { href: '/customer/help-center',  label: 'Help Center', icon: HelpCircle },
  ]

  const mobileGuestItems = [
    { href: '/customer/services', label: 'Services', icon: Layers },
    { href: '/customer/pricing-calculator', label: 'Pricing', icon: Calculator, },
    { href: '/customer/quick-pickup', label: 'Quick Pickup', icon: Truck, },
    { href: '/customer/faq', label: 'FAQ', icon: HelpCircle, },
    { href: '/customer/help-center', label: 'Help Center',icon: HelpCircle },
  ]

  const DIVIDER_AFTER = 3 // after index 3 (Addresses), show a divider
  return (
    <>
      {/* ---- Main header bar --------------------------------- */}
      <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          {/* Logo */}
          <Link href={user ? '/customer/dashboard' : '/customer'} className="flex shrink-0 items-center gap-2">
            <BrandLogo width={180} height={60} className="h-auto w-auto max-h-10" priority />
          </Link>

          {/* Desktop nav-items only when logged in */}
          {user && (
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_ITEMS_AUTH.map(item => {
                const Icon   = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {/* Active indicator dot */}
                    {active && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                )
              })}
            </nav>
          )}
          {!user && (
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_ITEMS_NOT_AUTH.map(item => {
                const Icon   = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {/* Active indicator dot */}
                    {active && (
                      <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                )
              })}
            </nav>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <ThemeToggle />

            {/* Cart — visible to guests too, since items can be added before signing in */}
            <CartBadge onClick={onCartClick} />

            {/* Desktop: user menu or login CTA */}
            <div className="hidden lg:flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : user ? (
                <DesktopUserMenu user={user} onLogout={handleLogout} />
              ) : (
                <>
                  <Link
                    href="/customer/auth/login"
                    className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/customer/auth/register"
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile menu overlay ----------------------------- */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
            />

            {/* Slide-down panel â€” attaches below the header, full width */}
            <motion.div
              ref={mobileMenuRef}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              // top-14 = header height; max-h = viewport minus header; overflow-y-auto for scroll
              className="fixed left-0 right-0 top-14 z-40 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-border/50 bg-background shadow-xl lg:hidden"
            >
              {/* User info banner (logged in) */}
              {user && (
                <div className="border-b border-border/40 bg-primary/5 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {user.name?.charAt(0)?.toUpperCase() ?? 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Menu items */}
              <div className="px-3 py-3">
                {user ? (
                  <>
                    {mobileLoggedInItems.map((item, index) => {
                      const Icon   = item.icon
                      const active = isActive(item.href)
                      const showDivider = index === DIVIDER_AFTER

                      return (
                        <div key={item.href}>
                          {/* Divider between nav and account items */}
                          {showDivider && (
                            <div className="my-2 border-t border-border/40" />
                          )}
                          <Link
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                              active
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-muted'
                            )}
                          >
                            <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                            {item.label}
                            {active && (
                              <span className="ml-auto h-2 w-2 rounded-full bg-primary" />
                            )}
                          </Link>
                        </div>
                      )
                    })}

                    {/* Logout */}
                    <div className="mt-2 border-t border-border/40 pt-2">
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <LogOut className="h-5 w-5 shrink-0" />
                        Log Out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {mobileGuestItems.map(item => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                          {item.label}
                        </Link>
                      )
                    })}
                    {/* CTA buttons for guests */}
                    <div className="mt-4 grid grid-cols-2 gap-2 px-1 pb-2">
                      <Link
                        href="/customer/auth/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-center rounded-xl border border-border/50 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        Log In
                      </Link>
                      <Link
                        href="/customer/auth/register"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Sign Up
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}