'use client'
// app/customer/page.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, ShieldCheck, Zap, Droplets, Calendar,
  Star, Check, ChevronLeft, ChevronRight, MapPin, Loader2,
  WashingMachine, Shirt, Flame, Package, AlertCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
}
interface HomeData {
  providers: Provider[]; location_used: boolean; stats: Stats; testimonials: Testimonial[]
}

// ---- Helpers -----------------------------------------------------------------
function formatStat(n: number): string {
  if (n >= 100000) return `${Math.floor(n / 1000)}K+`
  if (n >= 1000)   return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K+`
  if (n === 0)     return '—'
  return `${n}+`
}
function formatDistance(km: number | null): string {
  if (km === null) return ''
  if (km < 1) return `${Math.round(km * 1000)}m away`
  return `${km.toFixed(1)} km away`
}
function formatPrice(p: number | null): string {
  if (!p) return ''
  return `₹${Math.round(p)}/kg`
}

// ---- Carousel ----------------------------------------------------------------
// Infinite circular carousel using clone-based looping.
// - Prepends clone of last item, appends clone of first item
// - After transition ends at a clone, jumps silently to the real item
// - Columns: 1 on mobile, 2 on sm, 3 on md+
// - translateX is computed purely from item index × (100 / cols)%
// - Zero scroll APIs — cannot interfere with page scroll
function Carousel({ children, className }: { children: React.ReactNode[]; className?: string }) {
  const count = children.length

  // cols: number of visible columns — kept in a ref for the interval closure
  const [cols, setCols] = useState(3)
  const colsRef = useRef(3)
  useEffect(() => {
    const update = () => {
      const c = window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3
      setCols(c)
      colsRef.current = c
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // visual = position in the cloned array (1-based for real items)
  // cloned array = [lastItem, ...realItems, firstItem]
  const [visual,  setVisual]  = useState(1)       // start at real[0]
  const [realIdx, setRealIdx] = useState(0)        // tracks which dot is active
  const [animate, setAnimate] = useState(true)
  const pausedRef = useRef(false)
  const countRef  = useRef(count)
  useEffect(() => { countRef.current = count }, [count])

  const cloned = count > 0 ? [children[count - 1], ...children, children[0]] : []

  // After jumping to a clone, silently reset to the real position
  const onTransitionEnd = () => {
    if (visual === count + 1) {          // went past last → jump to real first
      setAnimate(false)
      setVisual(1)
      setRealIdx(0)
    } else if (visual === 0) {           // went past first → jump to real last
      setAnimate(false)
      setVisual(count)
      setRealIdx(count - 1)
    }
  }

  // Re-enable animation one frame after a silent jump
  useEffect(() => {
    if (!animate) {
      const t = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(t)
    }
  }, [animate])

  const go = (v: number, r: number) => { setAnimate(true); setVisual(v); setRealIdx(r) }
  const prev = () => go(visual - 1, (realIdx - 1 + count) % count)
  const next = () => go(visual + 1, (realIdx + 1) % count)
  const dot  = (i: number) => go(i + 1, i)

  // Auto-advance on desktop only
  useEffect(() => {
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
    if (isTouch) return
    const id = setInterval(() => {
      if (pausedRef.current) return
      setAnimate(true)
      setVisual(v => v + 1)
      setRealIdx(r => (r + 1) % countRef.current)
    }, 5000)
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
      {/* Clip wrapper — overflow hidden stops clones from showing */}
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform:  `translateX(${tx}%)`,
            transition: animate ? 'transform 500ms ease-in-out' : 'none',
            willChange: 'transform',
          }}
          onTransitionEnd={onTransitionEnd}
        >
          {cloned.map((child, i) => (
            <div
              key={i}
              style={{ width: `${pct}%`, flexShrink: 0 }}
              className="px-2"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop arrows */}
      <button onClick={prev} aria-label="Previous"
        className="absolute -left-4 top-1/2 -translate-y-1/2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border/50 shadow-md hover:bg-muted z-10">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={next} aria-label="Next"
        className="absolute -right-4 top-1/2 -translate-y-1/2 hidden md:flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border/50 shadow-md hover:bg-muted z-10">
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Mobile arrows */}
      <div className="mt-5 flex justify-center gap-3 md:hidden">
        <button onClick={prev} aria-label="Previous"
          className="h-9 w-9 flex items-center justify-center rounded-full bg-background border border-border/50 shadow-sm">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={next} aria-label="Next"
          className="h-9 w-9 flex items-center justify-center rounded-full bg-background border border-border/50 shadow-sm">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Dots */}
      <div className="mt-3 flex justify-center gap-2">
        {children.map((_, i) => (
          <button key={i} onClick={() => dot(i)} aria-label={`Go to slide ${i + 1}`}
            className={cn('h-2 rounded-full transition-all duration-300',
              i === realIdx ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'
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

// ---- Provider card -----------------------------------------------------------
function ProviderCard({ p }: { p: Provider }) {
  return (
    <Link href={`/customer/orders/create?provider=${p.id}`} className="block h-full">
      <div className="group h-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/20">
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary/10 to-violet-600/10">
          {p.image ? (
            <img src={p.image} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary">
                {p.name.charAt(0)}
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            <ShieldCheck className="h-3 w-3" /> Verified
          </div>
          {p.distance_km !== null && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-medium text-foreground backdrop-blur-sm">
              <MapPin className="h-3 w-3 text-primary" /> {formatDistance(p.distance_km)}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">{p.name}</h3>
            <div className="flex shrink-0 items-center gap-1 text-xs">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{p.rating.toFixed(1)}</span>
              {p.rating_count > 0 && <span className="text-muted-foreground">({p.rating_count})</span>}
            </div>
          </div>
          {p.city && <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {p.city}</p>}
          <div className="flex items-center justify-between">
            {p.min_price_kg && <span className="text-sm font-bold text-primary">from {formatPrice(p.min_price_kg)}</span>}
            <span className="ml-auto rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Book Now →</span>
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
    <div className="flex h-full flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <Stars rating={t.rating} />
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground italic">&ldquo;{t.content}&rdquo;</p>
      <div className="mt-5 flex items-center gap-3">
        {t.avatar_url
          ? <img src={t.avatar_url} alt={t.display_name} className="h-10 w-10 rounded-full object-cover" />
          : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">{initials}</div>
        }
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{t.display_name}</p>
          {t.role && <p className="text-xs text-muted-foreground truncate">{t.role}</p>}
        </div>
        {t.is_featured && (
          <div className="ml-auto shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-950/30">Top Review</div>
        )}
      </div>
    </div>
  )
}

// ---- Static data -------------------------------------------------------------
const WHY_CARDS = [
  { title: 'On-Time Guarantee',     description: "Pickup within 2 hours, delivery in 24 hours or it's free.",              icon: ShieldCheck,   gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50 dark:bg-violet-950/30',   text: 'text-violet-600'  },
  { title: 'Hotel-Quality Clean',   description: 'Professional washing, ironing, and folding every time — guaranteed.',     icon: WashingMachine,gradient: 'from-emerald-500 to-teal-600',   bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600' },
  { title: 'Transparent Pricing',   description: 'No hidden fees, no surprises — clear per-kg and per-item rates upfront.',  icon: Zap,           gradient: 'from-amber-500 to-orange-500',  bg: 'bg-amber-50 dark:bg-amber-950/30',    text: 'text-amber-600'   },
  { title: 'Eco-Friendly Process',  description: 'Water-efficient cleaning, biodegradable detergents, reusable packaging.',  icon: Droplets,      gradient: 'from-teal-500 to-cyan-600',     bg: 'bg-teal-50 dark:bg-teal-950/30',     text: 'text-teal-600'    },
  { title: 'Flexible Scheduling',   description: 'Book pickups from 9 AM to 9 PM, 7 days a week, even on holidays.',        icon: Calendar,      gradient: 'from-blue-500 to-indigo-600',   bg: 'bg-blue-50 dark:bg-blue-950/30',     text: 'text-blue-600'    },
  { title: 'Express 8-Hour Service',description: 'Need clothes fast? Our express service cleans and delivers in 8 hours.',   icon: Flame,         gradient: 'from-rose-500 to-red-600',      bg: 'bg-rose-50 dark:bg-rose-950/30',     text: 'text-rose-600'    },
]

const MOMENTS = [
  { title: 'Stain Rescue',          description: "Your favourite kurta got that stubborn food stain right before family dinner? We specialise in deep stain removal — your clothes come back looking brand new.",                              icon: Droplets, gradient: 'from-blue-500 to-cyan-600'     },
  { title: 'Busy Life Saver',       description: 'Weekends planned with friends, no time for laundry piles? Schedule pickup in 2 taps, get stress-free fresh clothes delivered while you enjoy your plans.',                                   icon: Calendar, gradient: 'from-emerald-500 to-teal-600'  },
  { title: 'Party Wear Perfection', description: "Your special party lehenga needs that crisp dry-clean finish? Professional dry cleaning with gentle care for your occasion wear — ready when you are.",                                      icon: Shirt,    gradient: 'from-purple-500 to-violet-600' },
  { title: 'Heirloom Revival',      description: "Mumma's wedding lehenga locked in folds, but you want to wear it for your big day? Expert steaming brings treasured memories back to life, perfectly.",                                      icon: Package,  gradient: 'from-rose-500 to-pink-600'     },
]

const BUBBLES = [
  { w: 8,  h: 8,  top: 10, left: 15, dur: 18, delay: 0   },
  { w: 12, h: 12, top: 25, left: 75, dur: 22, delay: 2   },
  { w: 6,  h: 6,  top: 60, left: 40, dur: 16, delay: 1   },
  { w: 10, h: 10, top: 80, left: 85, dur: 20, delay: 3   },
  { w: 7,  h: 7,  top: 45, left: 10, dur: 24, delay: 0.5 },
  { w: 9,  h: 9,  top: 70, left: 60, dur: 19, delay: 1.5 },
  { w: 5,  h: 5,  top: 30, left: 90, dur: 21, delay: 4   },
  { w: 11, h: 11, top: 15, left: 50, dur: 17, delay: 2.5 },
  { w: 6,  h: 6,  top: 90, left: 25, dur: 23, delay: 0.8 },
  { w: 8,  h: 8,  top: 55, left: 70, dur: 15, delay: 3.5 },
]

// ---- Location hook -----------------------------------------------------------
function useLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [denied, setDenied] = useState(false)
  const [asking, setAsking] = useState(false)
  const request = useCallback(() => {
    if (!navigator.geolocation) { setDenied(true); return }
    setAsking(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setAsking(false) },
      ()  => { setDenied(true); setAsking(false) },
      { timeout: 8000 }
    )
  }, [])
  useEffect(() => { request() }, [request])
  return { coords, denied, asking, request }
}

// ---- Page --------------------------------------------------------------------
export default function HomePage() {
  const { coords, denied, asking, request } = useLocation()
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
    { icon: '👥', label: 'Happy Users',    value: stats ? formatStat(stats.total_users)    : '—', sub: 'Across all roles'          },
    { icon: '📦', label: 'Monthly Orders', value: stats ? formatStat(stats.monthly_orders) : '—', sub: 'This month'                },
    { icon: '📈', label: 'Success Rate',   value: stats ? `${stats.success_rate}%`          : '—', sub: 'Orders delivered on time'  },
    { icon: '🏢', label: 'Local Partners', value: stats ? formatStat(stats.partner_count)  : '—', sub: 'Verified laundry shops'     },
  ]

  return (
    <div className="flex min-h-screen flex-col">

      {/* ---- HERO ---- */}
      <section className="relative min-h-[92vh] overflow-hidden flex items-center">
        <div className="absolute inset-0">
          <img src="/Desktop-Hero.jpg" alt="" aria-hidden
            className="h-full w-full object-cover object-center"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
        <div className="absolute inset-0" />
        {/* <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {BUBBLES.map((b, i) => (
            <div key={i} className="absolute rounded-full bg-white/20"
              style={{ width: `${b.w}px`, height: `${b.h}px`, top: `${b.top}%`, left: `${b.left}%`,
                animation: `float ${b.dur}s ease-in-out infinite`, animationDelay: `${b.delay}s` }} />
          ))}
        </div> */}
        <div className="container relative mx-auto px-4 py-20 md:py-28 text-center">
          {/* <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm mb-6 border border-white/20">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Serving Pimpri-Chinchwad &amp; Pune
          </div>
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Laundry,{' '}
            <span className="bg-gradient-to-r from-violet-200 to-purple-200 bg-clip-text text-transparent">Done Right.</span>
            <br className="hidden md:block" />{' '}Delivered to Your Door.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/80 md:text-xl leading-relaxed">
            Schedule pickup from your doorstep. Get fresh, folded clothes back in 24 hours. No hassle — just clean clothes.
          </p> */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/customer/auth/register">
              <Button size="lg" className="group bg-white text-violet-700 hover:bg-white/90 shadow-lg shadow-violet-900/30 px-8">
                Get Started Free <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/customer/quick-pickup">
              <Button size="lg" variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20 px-8 backdrop-blur-sm">
                Schedule a Quick Pickup
              </Button>
            </Link>
          </div>
          {/* <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
            {['✓ First order 20% off', '✓ No hidden fees', '✓ Money-back guarantee', '✓ 24/7 support'].map(item => (
              <span key={item} className="font-medium">{item}</span>
            ))}
          </div> */}
        </div>
        {/* <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" className="w-full text-background fill-current" preserveAspectRatio="none">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" />
          </svg>
        </div> */}
      </section>

      {/* ---- WHY CHOOSE US ---- */}
      <section className="container mx-auto px-6 py-20">
        <div className="mb-10 text-center">
          <Badge className="mb-3">Why Choose Us</Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Why Laundrease Stands Out</h2>
          <p className="mt-3 mx-auto max-w-xl text-muted-foreground">We combine professional quality with the convenience of a tap.</p>
        </div>
        <Carousel>
          {WHY_CARDS.map((card, i) => {
            const Icon = card.icon
            return (
              <div key={i} className="h-full rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className={`h-1 bg-gradient-to-r ${card.gradient}`} />
                <div className="p-6">
                  <div className={cn('mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl', card.bg, card.text)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-base font-bold text-foreground">{card.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                </div>
              </div>
            )
          })}
        </Carousel>
      </section>

      {/* ---- REAL LIFE MOMENTS ---- */}
      <section className="bg-gradient-to-br from-blue-50 to-violet-50 py-20 dark:from-slate-900/30 dark:to-violet-900/20">
        <div className="container mx-auto px-6">
          <div className="mb-10 text-center">
            <Badge className="mb-3 bg-gradient-to-r from-blue-500 to-violet-500 text-white border-0">Real Life Moments</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Real Problems. Real Solutions.</h2>
            <p className="mt-3 mx-auto max-w-xl text-muted-foreground">From stubborn stains to special occasion stress — we handle it.</p>
          </div>
          <Carousel>
            {MOMENTS.map((m, i) => {
              const Icon = m.icon
              return (
                <div key={i} className="flex flex-col rounded-2xl overflow-hidden border border-border/50 bg-card shadow-sm h-full">
                  <div className={`flex flex-col items-center justify-center gap-3 bg-gradient-to-br ${m.gradient} p-8 text-white`}>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="text-lg font-bold text-center">{m.title}</h3>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="flex-1 text-sm text-muted-foreground leading-relaxed italic">&ldquo;{m.description}&rdquo;</p>
                    <Link href="/customer/quick-pickup" className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
                      Book Now <ChevronRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </Carousel>
        </div>
      </section>

      {/* ---- PROVIDERS NEAR YOU ---- */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="mb-10 text-center">
            <Badge className="mb-3">Featured</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Laundry Providers Near You</h2>
            <p className="mt-3 mx-auto max-w-xl text-muted-foreground">
              {data?.location_used ? 'Showing providers closest to your location' : 'Top-rated verified laundry partners'}
            </p>
          </div>
          {denied && (
            <div className="mx-auto mb-8 flex max-w-lg items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950/30">
              <MapPin className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1 text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Allow location</span> to see providers closest to you.
              </div>
              <button onClick={request} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Allow</button>
            </div>
          )}
          {(asking || loading) && !data && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Could not load providers right now</p>
            </div>
          )}
          {data && data.providers.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {data.location_used ? 'No verified providers found within 15 km.' : 'No providers available yet. Check back soon!'}
            </p>
          )}
          {data && data.providers.length > 0 && (
            <Carousel>{data.providers.map(p => <ProviderCard key={p.id} p={p} />)}</Carousel>
          )}
          <div className="mt-10 text-center">
            <Link href="/customer/services">
              <Button size="lg" className="bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20">
                View All Providers <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ---- HOW IT WORKS ---- */}
      <section className="bg-muted/30 dark:bg-muted/10 py-20">
        <div className="container mx-auto px-6">
          <div className="mb-12 text-center">
            <Badge className="mb-3">Process</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
            <p className="mt-3 mx-auto max-w-xl text-muted-foreground">Our simple 4-step process makes laundry safe and easy.</p>
          </div>
          <div className="relative mx-auto max-w-3xl">
            <div className="absolute left-6 top-0 h-full w-0.5 bg-gradient-to-b from-violet-600 to-purple-600 md:left-1/2 md:-ml-px" />
            <div className="space-y-10 md:space-y-14">
              {[
                { title: 'Create Your Account',  desc: 'Sign up and verify your identity in minutes.'                    },
                { title: 'Schedule Pickup',      desc: 'Select clothes, choose a time slot, confirm pickup.'             },
                { title: 'We Clean & Fold',      desc: 'Professional wash, dry, iron, and neat packaging.'               },
                { title: 'Delivery at Your Door',desc: 'Track live status and get clothes back to your doorstep.'        },
              ].map((step, i) => (
                <div key={i} className="relative flex items-start gap-5 md:gap-0">
                  <div className="flex items-start gap-4 md:hidden">
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg">
                      <span className="text-base font-bold">{i + 1}</span>
                    </div>
                    <div className="pt-1">
                      <h3 className="mb-1 text-lg font-bold">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                  <div className="hidden md:flex w-full items-start">
                    <div className={cn('w-5/12 pr-8', i % 2 === 0 ? 'text-right' : 'opacity-0')}>
                      {i % 2 === 0 && <div><h3 className="mb-1 text-lg font-bold">{step.title}</h3><p className="text-sm text-muted-foreground">{step.desc}</p></div>}
                    </div>
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg ring-4 ring-background">
                      <span className="text-sm font-bold">{i + 1}</span>
                    </div>
                    <div className={cn('w-5/12 pl-8', i % 2 === 1 ? 'text-left' : 'opacity-0')}>
                      {i % 2 === 1 && <div><h3 className="mb-1 text-lg font-bold">{step.title}</h3><p className="text-sm text-muted-foreground">{step.desc}</p></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- TESTIMONIALS ---- */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="mb-10 text-center">
            <Badge className="mb-3">Testimonials</Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What Our Customers Say</h2>
            <p className="mt-3 mx-auto max-w-xl text-muted-foreground">Trusted by thousands of households across Pune.</p>
          </div>
          {loading && !data && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
          {data && data.testimonials.length > 0 && (
            <Carousel>{data.testimonials.map(t => <TestimonialCard key={t.id} t={t} />)}</Carousel>
          )}
        </div>
      </section>

      {/* ---- STATS ---- */}
      <section className="bg-muted/30 dark:bg-muted/10 py-20">
        <div className="container mx-auto px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((stat, i) => (
              <div key={i} className="flex flex-col items-center rounded-2xl border border-border/50 bg-card p-7 text-center shadow-sm">
                <span className="mb-3 text-4xl">{stat.icon}</span>
                <span className="text-3xl font-extrabold text-primary tabular-nums">{loading ? '—' : stat.value}</span>
                <span className="mt-1 text-sm font-semibold text-foreground">{stat.label}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{stat.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-700 to-purple-800 py-24 text-white dark:from-violet-950 dark:via-indigo-950 dark:to-purple-950">
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {BUBBLES.slice(0, 8).map((b, i) => (
            <div key={i} className="absolute rounded-full bg-white/15"
              style={{ width: `${b.w * 1.5}px`, height: `${b.h * 1.5}px`, top: `${b.top}%`, left: `${b.left}%`,
                animation: `float ${b.dur + 2}s ease-in-out infinite`, animationDelay: `${b.delay}s` }} />
          ))}
        </div>
        <div className="container relative mx-auto px-6 text-center">
          <Badge className="mb-5 bg-white/10 text-white border-white/20 backdrop-blur-sm">Get Started Today</Badge>
          <h2 className="mb-5 text-3xl font-bold md:text-5xl">Ready for Effortless Laundry?</h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-white/80 leading-relaxed">
            Join thousands of happy customers. First order gets 20% off + free pickup &amp; delivery!
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/customer/auth/register">
              <Button size="lg" className="bg-white text-violet-700 hover:bg-white/90 shadow-lg px-8">
                Create Your Account <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/customer/quick-pickup">
              <Button size="lg" variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20 px-8">
                Schedule Quick Pickup
              </Button>
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
            {['No hidden fees', 'Secure transactions', '24/7 support', 'Money-back guarantee'].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-white/80">
                <Check className="h-4 w-4 text-emerald-400 shrink-0" /> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
