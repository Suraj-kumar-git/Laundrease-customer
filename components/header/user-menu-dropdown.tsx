"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  User, LogIn, ChevronDown, UserPlus, Store, Truck,
  Gift, HelpCircle, Download, LogOut, ShoppingBag,
  MapPin, Wallet, Settings, Star, ChevronRight,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"

// ---- Logged-out dropdown ------------------------------------
const GUEST_ITEMS = [
  {
    group: 'Join',
    items: [
      { label: 'New Customer? Sign Up', href: '/customer/auth/register', icon: UserPlus, highlight: true },
    ],
  },
  {
    group: 'Become a Partner',
    items: [
      { label: 'Become a Laundry Provider', href: '/laundry/auth/register', icon: Store },
      { label: 'Become a Delivery Partner', href: '/delivery/auth/register', icon: Truck },
    ],
  },
  {
    group: 'Rewards',
    items: [
      { label: 'Refer & Earn', href: '/customer/auth/register?tab=referral', icon: Gift },
    ],
  },
  {
    group: 'Help',
    items: [
      { label: 'Help Center', href: '/help-center', icon: HelpCircle },
      { label: 'Download App', href: '#', icon: Download, comingSoon: true },
    ],
  },
]

// ---- Logged-in dropdown -------------------------------------
const AUTH_ITEMS = [
  {
    group: 'Account',
    items: [
      { label: 'My Orders', href: '/customer/orders', icon: ShoppingBag },
      { label: 'My Addresses', href: '/customer/addresses', icon: MapPin },
      { label: 'Wallet & Rewards', href: '/customer/wallet', icon: Wallet },
      { label: 'Refer & Earn', href: '/customer/refer-and-earn', icon: Gift },
    ],
  },
  {
    group: 'Preferences',
    items: [
      { label: 'Settings', href: '/customer/settings', icon: Settings },
      { label: 'Help Center', href: '/help-center', icon: HelpCircle },
    ],
  },
]

// ---- Avatar component ---------------------------------------
function UserAvatar({ avatar, name, size = 32 }: { avatar?: string; name?: string; size?: number }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  if (avatar) {
    return (
      <Image
        src={avatar}
        alt={name ?? 'User'}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  )
}

// ---- Main component -----------------------------------------
export function UserMenuDropdown() {
  const { user, isLoading, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on route change
  useEffect(() => { setOpen(false) }, [])

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    router.push('/')
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full bg-muted" />
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-full border transition-all duration-200',
          open
            ? 'border-primary/40 bg-primary/5 shadow-sm'
            : 'border-transparent hover:border-border hover:bg-muted/50',
          user ? 'p-1 pr-2' : 'px-3 py-1.5'
        )}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {user ? (
          <>
            <UserAvatar avatar={user.avatar} name={user.name} size={30} />
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </>
        ) : (
          <>
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Login</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {/* Login button (separate, only when logged out) */}
      {!user && (
        <></>
        // The "Login" text IS the trigger above — clicking it opens dropdown
        // Direct login link is the first item in the dropdown AND we keep
        // the trigger itself navigating on plain click without dropdown
      )}

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-xl shadow-black/10 dark:shadow-black/30">
          {user ? (
            <>
              {/* User info header */}
              <div className="flex items-center gap-3 border-b border-border/50 bg-muted/30 px-4 py-3">
                <UserAvatar avatar={user.avatar} name={user.name} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>

              {/* View profile quick link */}
              <Link
                href={`/customer/profile/${user.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
              >
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  View / Edit Profile
                </span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </Link>

              <div className="border-t border-border/50" />

              {/* Menu groups */}
              {AUTH_ITEMS.map((group, gi) => (
                <div key={gi}>
                  <p className="px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.group}
                  </p>
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {item.label}
                    </Link>
                  ))}
                  {gi < AUTH_ITEMS.length - 1 && (
                    <div className="my-1 border-t border-border/30" />
                  )}
                </div>
              ))}

              <div className="border-t border-border/50 p-2">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Login CTA */}
              <div className="border-b border-border/50 bg-muted/30 p-3">
                <Link
                  href="/customer/auth/login"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
                >
                  <LogIn className="h-4 w-4" />
                  Log In to Laundrease
                </Link>
              </div>

              {/* Guest menu groups */}
              {GUEST_ITEMS.map((group, gi) => (
                <div key={gi}>
                  <p className="px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.group}
                  </p>
                  {group.items.map((item: any) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted',
                        item.highlight
                          ? 'font-semibold text-primary hover:bg-primary/5'
                          : 'text-foreground/80 hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{item.label}</span>
                      {item.comingSoon && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </Link>
                  ))}
                  {gi < GUEST_ITEMS.length - 1 && (
                    <div className="my-1 border-t border-border/30" />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
