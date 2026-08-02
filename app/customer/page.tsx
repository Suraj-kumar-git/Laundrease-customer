'use client'
// app/customer/page.tsx

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowRight, ShieldCheck, ShieldAlert, Zap, Droplets, Calendar,
  Star, ChevronLeft, ChevronRight, MapPin, Loader2,
  WashingMachine, Shirt, Flame, Package, AlertCircle,
  Wallet, Users, Gift, Camera, Sparkles, Store,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { formatStat } from '@/lib/format-stat'
import { formatDistance } from '@/lib/format-distance'
import { useCustomerLocation } from '@/lib/use-customer-location'

// ---- Types -------------------------------------------------------------------
interface Provider {
  id: number; name: string; city: string | null; rating: number
  rating_count: number; image: string | null; min_price_kg: number | null
  distance_km: number | null; postal_code: string | null
}
interface Testimonial {
  id: number; display_name: string; role: string | null; avatar_url: string | null
  content: string; rating: number; is_featured: boolean
}
interface Stats {
  total_users: number; monthly_orders: number; success_rate: number; partner_count: number
  service_areas: number; cities_covered: number; city_names: string[]
}
interface HomeData {
  providers: Provider[]; location_used: boolean; stats: Stats; testimonials: Testimonial[]
}

// ---- Helpers -----------------------------------------------------------------
function formatPrice(p: number | null): string {
  if (!p) return ''
  return `₹${Math.round(p)}/kg`
}

// ---- Carousel ----------------------------------------------------------------
// Infinite clone-based carousel with swipe support.
// Clone layout: [last, ...real, first] — visual index 1 = real[0].
// After sliding into a clone we silently snap back to the real counterpart.
function Carousel({ children, className }: { children: React.ReactNode[]; className?: string }) {
  const count = children.length

  const [cols, setCols] = useState(3)
  const colsRef = useRef(3)
  useEffect(() => {
    const update = () => {
      const c = window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3
      setCols(c); colsRef.current = c
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const [visual,  setVisual]  = useState(1)
  const [realIdx, setRealIdx] = useState(0)
  const [animate, setAnimate] = useState(true)
  const pausedRef   = useRef(false)
  const countRef    = useRef(count)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  useEffect(() => { countRef.current = count }, [count])

  const cloned = count > 0 ? [children[count - 1], ...children, children[0]] : []

  const onTransitionEnd = () => {
    if (visual === count + 1) {
      setAnimate(false); setVisual(1); setRealIdx(0)
    } else if (visual === 0) {
      setAnimate(false); setVisual(count); setRealIdx(count - 1)
    }
  }

  useEffect(() => {
    if (!animate) {
      const t = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(t)
    }
  }, [animate])

  const go   = (v: number, r: number) => { setAnimate(true); setVisual(v); setRealIdx(r) }
  const prev = () => go(visual - 1, (realIdx - 1 + count) % count)
  const next = () => go(visual + 1, (realIdx + 1) % count)
  const dot  = (i: number) => go(i + 1, i)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    pausedRef.current = true
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      dx < 0 ? next() : prev()
    }
    touchStartX.current = null
    touchStartY.current = null
    setTimeout(() => { pausedRef.current = false }, 1200)
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return
      setAnimate(true)
      setVisual(v => v + 1)
      setRealIdx(r => (r + 1) % countRef.current)
    }, 4500)
    return () => clearInterval(id)
  }, [])

  if (count === 0) return null

  const pct = 100 / cols
  const tx  = -(visual * pct)

  return (
    <div
      className={cn('relative', className)}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      <div
        className="overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex"
          style={{
            transform:  `translateX(${tx}%)`,
            transition: animate ? 'transform 480ms cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
            willChange: 'transform',
          }}
          onTransitionEnd={onTransitionEnd}
        >
          {cloned.map((child, i) => (
            <div key={i} style={{ width: `${pct}%`, flexShrink: 0 }} className="px-2">
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop arrows */}
      <button onClick={prev} aria-label="Previous"
        className="absolute -left-4 top-1/2 -translate-y-1/2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-md hover:bg-muted transition-colors z-10">
        <ChevronLeft className="h-5 w-5 text-foreground" />
      </button>
      <button onClick={next} aria-label="Next"
        className="absolute -right-4 top-1/2 -translate-y-1/2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-md hover:bg-muted transition-colors z-10">
        <ChevronRight className="h-5 w-5 text-foreground" />
      </button>

      {/* Mobile: swipe hint arrows */}
      <div className="mt-5 flex justify-center gap-3 md:hidden">
        <button onClick={prev} aria-label="Previous"
          className="h-9 w-9 flex items-center justify-center rounded-full bg-card border border-border shadow-sm active:scale-95 transition-transform">
          <ChevronLeft className="h-4 w-4 text-foreground" />
        </button>
        <button onClick={next} aria-label="Next"
          className="h-9 w-9 flex items-center justify-center rounded-full bg-card border border-border shadow-sm active:scale-95 transition-transform">
          <ChevronRight className="h-4 w-4 text-foreground" />
        </button>
      </div>

      {/* Dots */}
      <div className="mt-3 flex justify-center gap-2">
        {children.map((_, i) => (
          <button key={i} onClick={() => dot(i)} aria-label={`Go to slide ${i + 1}`}
            className={cn('h-2 rounded-full transition-all duration-300',
              i === realIdx ? 'w-6 bg-blue-600' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
            )} />
        ))}
      </div>
    </div>
  )
}

// ---- Stars -------------------------------------------------------------------
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn('h-3.5 w-3.5',
          i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20 fill-muted-foreground/10')} />
      ))}
    </div>
  )
}

// ---- Section header (consistent across all sections) --------------------------
function SectionHeader({ tag, title, sub, onDark }: { tag: string; title: string; sub?: string; onDark?: boolean }) {
  return (
    <div className="mb-8 text-center sm:mb-10">
      <span className={cn(
        'mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider',
        onDark
          ? 'bg-white/10 text-white border border-white/20'
          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
      )}>
        {tag}
      </span>
      <h2 className={cn('text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl', onDark ? 'text-white' : 'text-foreground')}>
        {title}
      </h2>
      {sub && (
        <p className={cn('mt-3 mx-auto max-w-xl text-sm sm:text-base', onDark ? 'text-white/70' : 'text-muted-foreground')}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ---- Hero illustration (inline SVG placeholder — swap for real art later) ----
function HeroIllustration() {
  return (
    <svg viewBox="0 0 360 360" className="h-full w-full drop-shadow-2xl">
      <defs>
        <linearGradient id="machineBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="drumGlass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* Soft glow backdrop */}
      <circle cx="180" cy="190" r="150" fill="#ffffff" opacity="0.08" />

      {/* Washing machine body */}
      <rect x="60" y="70" width="240" height="230" rx="28" fill="url(#machineBody)" />
      {/* Control strip */}
      <rect x="90" y="92" width="180" height="16" rx="8" fill="#3b82f6" opacity="0.5" />
      <circle cx="100" cy="100" r="4" fill="#06b6d4" />
      <circle cx="118" cy="100" r="4" fill="#f59e0b" />
      <circle cx="136" cy="100" r="4" fill="#10b981" />

      {/* Drum / porthole */}
      <circle cx="180" cy="205" r="86" fill="url(#drumGlass)" />
      <circle cx="180" cy="205" r="86" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="6" />
      <circle cx="180" cy="205" r="68" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" />

      {/* Floating clothes inside drum */}
      <g opacity="0.95">
        <rect x="148" y="178" width="32" height="40" rx="8" fill="#fde68a" transform="rotate(-12 164 198)" />
        <rect x="178" y="200" width="28" height="34" rx="7" fill="#bbf7d0" transform="rotate(18 192 217)" />
        <circle cx="155" cy="232" r="10" fill="#fecdd3" />
      </g>

      {/* Bubbles rising out of the machine */}
      <circle cx="120" cy="60" r="7" fill="#ffffff" opacity="0.7" />
      <circle cx="245" cy="48" r="10" fill="#ffffff" opacity="0.6" />
      <circle cx="270" cy="80" r="5" fill="#ffffff" opacity="0.8" />
      <circle cx="95" cy="40" r="4" fill="#ffffff" opacity="0.6" />

      {/* Legs */}
      <rect x="78" y="298" width="16" height="14" rx="3" fill="#ffffff" opacity="0.8" />
      <rect x="266" y="298" width="16" height="14" rx="3" fill="#ffffff" opacity="0.8" />
    </svg>
  )
}

// ---- Provider card -----------------------------------------------------------
function ProviderCard({ p }: { p: Provider }) {
  return (
    <Link href={`/customer/orders/create?provider=${p.id}`} className="block h-full">
      <div className="group h-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-blue-400/60">

        {/* Shop photo (uploaded at registration) with branded fallback */}
        <div className="relative h-44 overflow-hidden bg-muted">
          {p.image ? (
            <img
              src={p.image}
              alt={`${p.name} shop`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-500/15 via-cyan-500/10 to-blue-500/5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 shadow-lg">
                <Store className="h-8 w-8 text-white" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{p.name.split(' ')[0]}</span>
            </div>
          )}
          {/* Soft gradient so the pills stay readable over any photo */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow">
            <ShieldCheck className="h-3 w-3" /> Verified
          </div>
          {p.distance_km !== null && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
              <MapPin className="h-3 w-3 text-blue-600 dark:text-blue-400" /> {formatDistance(p.distance_km)}
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-blue-600 transition-colors line-clamp-2">{p.name}</h3>
            <div className="flex shrink-0 items-center gap-1 text-xs">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{p.rating.toFixed(1)}</span>
              {p.rating_count > 0 && <span className="text-muted-foreground">({p.rating_count})</span>}
            </div>
          </div>
          {p.city && <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {p.city}</p>}
          <div className="flex items-center justify-between">
            {p.min_price_kg && <span className="text-sm font-bold text-blue-600 dark:text-blue-400">from {formatPrice(p.min_price_kg)}</span>}
            <span className="ml-auto rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 px-2.5 py-1 text-xs font-semibold text-white">Book Now →</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ---- Testimonial card --------------------------------------------------------
function TestimonialCard({ t }: { t: Testimonial }) {
  const initials = t.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
      <Stars rating={t.rating} />
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground italic">&ldquo;{t.content}&rdquo;</p>
      <div className="mt-5 flex items-center gap-3">
        {t.avatar_url
          ? <img src={t.avatar_url} alt={t.display_name} className="h-10 w-10 rounded-full object-cover" />
          : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-600 text-xs font-bold text-white">{initials}</div>
        }
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{t.display_name}</p>
          {t.role && <p className="text-xs text-muted-foreground truncate">{t.role}</p>}
        </div>
        {t.is_featured && (
          <div className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Top Review</div>
        )}
      </div>
    </div>
  )
}

// ---- Feature card (shared by Why-Us / Protection / Rewards sections) ----------
// Layout everywhere: icon + title on one line, description below.
function FeatureCard({ icon: Icon, title, description, onDark, badge }: {
  icon: React.ElementType; title: string; description: string; onDark?: boolean; badge?: string
}) {
  if (onDark) {
    return (
      <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-white/70">{description}</p>
      </div>
    )
  }
  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="h-1 bg-gradient-to-r from-blue-600 to-cyan-600" />
      <div className="p-4">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
        </div>
        {badge && <div className="absolute right-4 top-4 text-4xl font-extrabold text-blue-600/[0.08] select-none">{badge}</div>}
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ---- Static data -------------------------------------------------------------
const WHY_CARDS = [
  { title: 'On-Time Guarantee',      description: "Pickup within 2 hours, delivery in 24 hours or it's free.",               icon: ShieldCheck    },
  { title: 'Hotel-Quality Clean',    description: 'Professional washing, ironing, and folding every time — guaranteed.',      icon: WashingMachine },
  { title: 'Transparent Pricing',    description: 'No hidden fees, no surprises — clear per-kg and per-item rates upfront.',   icon: Zap            },
  { title: 'Eco-Friendly Process',   description: 'Water-efficient cleaning, biodegradable detergents, reusable packaging.',   icon: Droplets       },
  { title: 'Flexible Scheduling',    description: 'Book pickups from 9 AM to 9 PM, 7 days a week, even on holidays.',         icon: Calendar       },
  { title: 'Express 8-Hour Service', description: 'Need clothes fast? Our express service cleans and delivers in 8 hours.',    icon: Flame          },
]

const PROTECTION_POINTS = [
  { title: 'Snap & Report',         description: 'Item damaged, lost, or stolen? Report it with photos within 72 hours of delivery — right from your order page.', icon: Camera      },
  { title: 'Fair, Capped Payout',   description: "Compensation up to 10x the item's cleaning charge, so payouts stay fair for everyone.",                          icon: ShieldAlert },
  { title: 'Instant Wallet Credit', description: 'Once approved, compensation lands straight in your Laundrease wallet — no waiting on bank transfers.',           icon: Wallet      },
]

const REWARDS_CARDS = [
  { title: 'Laundrease Wallet', description: 'Refunds, cashback, and claim payouts land instantly in your wallet — use it on any future order.', icon: Wallet },
  { title: 'Refer & Earn',      description: 'Invite friends to Laundrease. When they place their first order, you both get wallet credit.',      icon: Users  },
  { title: 'Loyalty Points',    description: 'Every order earns you loyalty points — redeem them for discounts on your future bookings.',          icon: Gift   },
]

const HOW_IT_WORKS = [
  { title: 'Create Your Account',  desc: 'Sign up and verify your identity in minutes.',             icon: Sparkles       },
  { title: 'Schedule Pickup',      desc: 'Select clothes, choose a time slot, confirm pickup.',      icon: Calendar       },
  { title: 'We Clean & Fold',      desc: 'Professional wash, dry, iron, and neat packaging.',        icon: WashingMachine },
  { title: 'Delivery at Your Door',desc: 'Track live status and get clothes back to your doorstep.', icon: Package        },
]

const BUBBLES = [
  { w: 8,  h: 8,  top: 10, left: 15, dur: 6,   delay: 0   },
  { w: 12, h: 12, top: 25, left: 75, dur: 7.5, delay: 2   },
  { w: 6,  h: 6,  top: 60, left: 40, dur: 5.5, delay: 1   },
  { w: 10, h: 10, top: 80, left: 85, dur: 7,   delay: 3   },
  { w: 7,  h: 7,  top: 45, left: 10, dur: 8,   delay: 0.5 },
  { w: 9,  h: 9,  top: 70, left: 60, dur: 6.5, delay: 1.5 },
  { w: 5,  h: 5,  top: 30, left: 90, dur: 7,   delay: 4   },
  { w: 11, h: 11, top: 15, left: 50, dur: 5.8, delay: 2.5 },
  { w: 6,  h: 6,  top: 90, left: 25, dur: 7.8, delay: 0.8 },
  { w: 8,  h: 8,  top: 55, left: 70, dur: 5,   delay: 3.5 },
]

// ---- Page --------------------------------------------------------------------
export default function HomePage() {
  const { user } = useAuth()
  const { coords, permission, asking, request } = useCustomerLocation()
  const [data,    setData]    = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); setError(false)
      try {
        const params = new URLSearchParams({ limit: '8' })
        if (coords) { params.set('lat', String(coords.lat)); params.set('lng', String(coords.lng)) }
        const res  = await fetch(`/api/customer/public/home-data?${params}`)
        const json = await res.json()
        if (!json.success) throw new Error()
        setData(json.data)
      } catch { setError(true) }
      finally  { setLoading(false) }
    }
    fetchData()
  }, [coords])

  const stats = data?.stats
  const STATS = [
    { label: 'Happy Users',    value: stats ? formatStat(stats.total_users)    : '—' },
    { label: 'Monthly Orders', value: stats ? formatStat(stats.monthly_orders) : '—' },
    { label: 'Success Rate',   value: stats ? `${stats.success_rate}%`          : '—' },
    { label: 'Local Partners', value: stats ? formatStat(stats.partner_count)  : '—' },
    { label: 'Service Areas',  value: stats ? formatStat(stats.service_areas)  : '—' },
    {
      label: (stats?.cities_covered ?? 0) === 1 && stats?.city_names?.[0]
        ? 'Serving City' : 'Cities Served',
      value: stats
        ? ((stats.cities_covered === 1 && stats.city_names?.[0]) ? stats.city_names[0] : formatStat(stats.cities_covered))
        : '—',
    },
  ]

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">

      {/* ---- HERO ---- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-600 via-blue-600 to-cyan-600 md:bg-gradient-to-br md:from-blue-700 md:via-blue-600 md:to-cyan-600">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {BUBBLES.map((b, i) => (
            <div key={i} className="absolute rounded-full bg-white/30"
              style={{ width: `${b.w}px`, height: `${b.h}px`, top: `${b.top}%`, left: `${b.left}%`,
                animation: `hero-bubble ${b.dur}s ease-in-out infinite`, animationDelay: `${b.delay}s` }} />
          ))}
        </div>

        <div className="container relative mx-auto grid grid-cols-1 items-center gap-10 px-4 py-16 sm:py-20 md:grid-cols-2 md:py-20">
          <div className="text-center md:text-left">
            <h1 className="mb-5 text-3xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
              Laundry,{' '}
              <span className="bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">Done Right.</span>
              <br />Delivered to Your Door.
            </h1>
            <p className="mx-auto mb-8 max-w-xl text-base sm:text-lg text-white/85 md:mx-0 leading-relaxed">
              Schedule pickup from your doorstep. Get fresh, folded clothes back in 24 hours — protected by our garment guarantee.
            </p>

            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row md:justify-start">
              {!user && (
                <div className="relative inline-flex w-full sm:w-auto">
                  {/* Pulsing glow ring behind primary CTA */}
                  <span className="absolute -inset-1 rounded-full bg-white/30 blur-md animate-pulse" style={{ animationDuration: '2.4s' }} />
                  <Link href="/customer/auth/register" className="w-full sm:w-auto">
                    <button className="group relative w-full overflow-hidden rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-blue-700 shadow-[0_4px_24px_rgba(255,255,255,0.35)] transition-all duration-300 hover:scale-[1.04] hover:shadow-[0_6px_36px_rgba(255,255,255,0.55)] active:scale-[0.97]">
                      {/* Shimmer sweep */}
                      <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                      <span className="relative flex items-center justify-center gap-2">
                        Get Started Free
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                      </span>
                    </button>
                  </Link>
                </div>
              )}
              <Link href="/customer/quick-pickup" className="w-full sm:w-auto">
                <button className="group relative w-full overflow-hidden rounded-full border-2 border-white/50 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(255,255,255,0.08)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.04] hover:border-white/80 hover:bg-white/20 active:scale-[0.97]">
                  {/* Shimmer sweep */}
                  <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                  <span className="relative flex items-center justify-center gap-2">
                    Schedule a Quick Pickup
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                  </span>
                </button>
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:max-w-md">
              {STATS.map((stat, i) => (
                <div key={i} className="text-center md:text-left">
                  <p className="text-2xl font-extrabold text-white tabular-nums truncate">{loading ? '—' : stat.value}</p>
                  <p className="text-xs font-medium text-white/70">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center">
            <div className="w-full max-w-sm animate-[hero-bob_3.5s_ease-in-out_infinite]">
              <HeroIllustration />
            </div>
          </div>

          {/* Mobile service icon row */}
          <div className="grid grid-cols-4 gap-3 md:hidden">
            {[
              { label: 'Washing',           icon: WashingMachine },
              { label: 'Dry Cleaning',      icon: Shirt           },
              { label: 'Steam Ironing',     icon: Flame           },
              { label: 'Pickup & Delivery', icon: Package         },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-medium leading-tight text-white/80 text-center">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" className="w-full text-background fill-current" preserveAspectRatio="none">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" />
          </svg>
        </div>
      </section>

      {/* ---- PROVIDERS NEAR YOU ---- */}
      <section className="bg-muted/40 py-12 sm:py-16 md:py-20 dark:bg-muted/10">
        <div className="container mx-auto px-4 sm:px-6">
          <SectionHeader
            tag="Near You"
            title="Laundry Providers Near You"
            sub={data?.location_used ? 'Showing verified providers within 8 km of your location' : 'Top-rated verified laundry partners'}
          />
          {permission === 'denied' && (
            <div className="mx-auto mb-8 flex max-w-lg items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3.5 sm:px-5 sm:py-4 dark:border-amber-800 dark:bg-amber-950/30">
              <MapPin className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Location access is blocked.</span> Enable it in your browser's site settings, then try again to see providers closest to you.
              </div>
              <button onClick={request} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Try again</button>
            </div>
          )}
          {(asking || loading) && !data && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" /></div>}
          {error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Could not load providers right now</p>
            </div>
          )}
          {data && data.providers.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {data.location_used ? 'No verified providers found within 8 km.' : 'No providers available yet. Check back soon!'}
            </p>
          )}
          {data && data.providers.length > 0 && (
            <Carousel>{data.providers.map(p => <ProviderCard key={p.id} p={p} />)}</Carousel>
          )}
          <div className="mt-8 sm:mt-10 text-center">
            <Link href="/customer/services">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 shadow-md shadow-blue-500/20">
                View All Providers <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ---- HOW IT WORKS ---- */}
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        <SectionHeader tag="Process" title="How It Works" sub="Our simple 4-step process makes laundry safe and easy." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, i) => (
            <FeatureCard key={i} icon={step.icon} title={step.title} description={step.desc} badge={String(i + 1)} />
          ))}
        </div>
      </section>

      {/* ---- ITEM PROTECTION / GARMENT GUARANTEE ---- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-cyan-950 py-12 sm:py-16 md:py-20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {BUBBLES.slice(0, 6).map((b, i) => (
            <div key={i} className="absolute rounded-full bg-white/10"
              style={{ width: `${b.w * 1.3}px`, height: `${b.h * 1.3}px`, top: `${b.top}%`, left: `${b.left}%`,
                animation: `float ${b.dur + 3}s ease-in-out infinite`, animationDelay: `${b.delay}s` }} />
          ))}
        </div>
        <div className="container relative mx-auto px-4 sm:px-6">
          <SectionHeader
            tag="Garment Guarantee" onDark
            title="Your Clothes Are Protected"
            sub="If an item is damaged, lost, or stolen while in our care, you're covered — no fine print, no runaround."
          />
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
            {PROTECTION_POINTS.map((p, i) => (
              <FeatureCard key={i} icon={p.icon} title={p.title} description={p.description} onDark />
            ))}
          </div>
        </div>
      </section>

      {/* ---- SAVE MORE: WALLET / REFERRAL / LOYALTY ---- */}
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        <SectionHeader tag="Save More" title="More Ways to Save" sub="Wallet credits, referral rewards, and loyalty points — all built in." />
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
          {REWARDS_CARDS.map((card, i) => (
            <FeatureCard key={i} icon={card.icon} title={card.title} description={card.description} />
          ))}
        </div>
      </section>

      {/* ---- TESTIMONIALS ---- */}
      <section className="bg-muted/40 py-12 sm:py-16 md:py-20 dark:bg-muted/10">
        <div className="container mx-auto px-4 sm:px-6">
          <SectionHeader tag="Testimonials" title="What Our Customers Say" sub="Trusted by thousands of households across Pune." />
          {loading && !data && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" /></div>}
          {data && data.testimonials.length > 0 && (
            <Carousel>{data.testimonials.map(t => <TestimonialCard key={t.id} t={t} />)}</Carousel>
          )}
        </div>
      </section>

      {/* ---- WHY CHOOSE US ---- */}
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        <SectionHeader tag="Why Choose Us" title="Why Laundrease Stands Out" sub="We combine professional quality with the convenience of a tap." />
        <Carousel>
          {WHY_CARDS.map((card, i) => (
            <FeatureCard key={i} icon={card.icon} title={card.title} description={card.description} />
          ))}
        </Carousel>
      </section>

      {/* ---- MOBILE FLOATING QUICK PICKUP BUTTON ---- */}
      <Link
        href="/customer/quick-pickup"
        className="fixed right-4 top-16 z-30 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 md:hidden"
      >
        <span className="absolute inset-0 -z-10 rounded-full bg-cyan-500 animate-ping opacity-40" />
        <Zap className="h-3.5 w-3.5" />
        Quick Pickup
      </Link>

    </div>
  )
}
