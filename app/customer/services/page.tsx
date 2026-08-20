'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Star,
  Clock,
  MapPin,
  ShieldCheck,
  Loader2,
  Heart,
  Navigation,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react'
import { AreaSearchBox, type AreaSelection } from './components/AreaSearchBox'
import { useCart } from '@/components/cart-provider'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveServiceIconSrc } from '@/lib/product-icons'

// ---- Types --------------------------------------------------------------

interface Service {
  id: number
  name: string
  description: string
  category: string
  pricingModel: 'per_kg' | 'per_unit'
  startingPrice: number
  icon: string
  isExpressAvailable: boolean
  defaultProductType: {
    id: number
    name: string
    icon: string
    pricingModel: 'per_kg' | 'per_unit'
    unitPrice: number
  } | null
}

interface DisplayProvider {
  id: number
  name: string
  subtitle: string // city or address
  rating: number
  ratingCount: number
  minPriceKg: number | null
  distanceKm: number | null
  logoUrl: string | null
}

const ICON_GRADIENTS = [
  'from-blue-500 to-blue-500',
  'from-sky-500 to-blue-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
  'from-pink-500 to-rose-500',
  'from-fuchsia-500 to-pink-500',
]

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

export default function ServicesPage() {
  const cart = useCart()
  const [services,      setServices]      = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)

  const [providers,     setProviders]     = useState<DisplayProvider[]>([])
  const [searchLoading,  setSearchLoading] = useState(false)
  const [searched,       setSearched]      = useState(false)
  const [areaLabel,       setAreaLabel]    = useState('')

  // ---- Load service catalog (DB-driven) ---------------------------------
  useEffect(() => {
    fetch('/api/customer/public/services')
      .then(r => r.json())
      .then(j => { if (j.success) setServices(j.data.services) })
      .catch(() => {})
      .finally(() => setServicesLoading(false))
  }, [])

  async function handleAreaSelected(area: AreaSelection) {
    setSearchLoading(true)
    setSearched(true)
    setAreaLabel(area.label)
    try {
      const res = await fetch(`/api/customer/public/home-data?lat=${area.lat}&lng=${area.lng}&limit=12`)
      const json = await res.json()
      if (json.success) {
        setProviders(json.data.providers.map((p: any) => ({
          id: p.id,
          name: p.name,
          subtitle: p.city ?? '',
          rating: p.rating,
          ratingCount: p.rating_count,
          minPriceKg: p.min_price_kg,
          distanceKm: p.distance_km,
          logoUrl: p.image ?? null,
        })))
      } else {
        setProviders([])
      }
    } catch {
      setProviders([])
    } finally {
      setSearchLoading(false)
    }
  }

  async function handleFreeTextSearch(text: string) {
    setSearchLoading(true)
    setSearched(true)
    setAreaLabel(text)
    try {
      const res = await fetch(`/api/customer/laundry-providers/search?location=${encodeURIComponent(text)}`)
      const json = await res.json()
      if (json.success) {
        setProviders(json.data.providers.map((p: any) => ({
          id: p.id,
          name: p.business_name,
          subtitle: p.business_address ?? p.city ?? '',
          rating: p.rating,
          ratingCount: p.rating_count,
          minPriceKg: p.min_price_kg,
          distanceKm: null,
          logoUrl: p.logo_url ?? null,
        })))
      } else {
        setProviders([])
      }
    } catch {
      setProviders([])
    } finally {
      setSearchLoading(false)
    }
  }

  return (
    <div className="flex-1 bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950">
      {/* Compact header + search. Deliberately NOT a full-bleed coloured
          hero: the search results render directly below this, and a tall
          banner pushed them below the fold on every device. No
          overflow-hidden anywhere on this path either, or the area-search
          box's autocomplete dropdown gets clipped. */}
      <div className="container mx-auto px-4 pt-6 pb-2 sm:pt-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl md:text-3xl">
            Our Premium Services
          </h1>
          <p className="mx-auto mt-1 max-w-xl text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Professional laundry care, tailored to your area
          </p>

          <div className="mt-4 flex flex-col items-center">
            <AreaSearchBox
              loading={searchLoading}
              onAreaSelected={handleAreaSelected}
              onFreeTextSearch={handleFreeTextSearch}
            />
          </div>
        </motion.div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Provider results */}
        {searched && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <Navigation className="h-4 w-4 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {searchLoading
                  ? 'Searching…'
                  : providers.length > 0
                  ? `${providers.length} providers near "${areaLabel}"`
                  : `No providers found near "${areaLabel}"`}
              </h2>
            </div>

            {searchLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : providers.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {providers.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        {p.logoUrl ? (
                          <Image src={p.logoUrl} alt={p.name} width={36} height={36}
                            className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold text-white ${ICON_GRADIENTS[i % ICON_GRADIENTS.length]}`}>
                            {p.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-gray-900 dark:text-white">{p.name}</h3>
                          {p.subtitle && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                              <MapPin className="h-3 w-3 shrink-0" /> {p.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        <Star className="h-3 w-3 fill-current" /> {p.rating?.toFixed(1) ?? '—'}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        {p.minPriceKg !== null ? (
                          <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            Starting {formatINR(p.minPriceKg)}<span className="text-xs font-medium text-gray-500"> /kg</span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Contact for pricing</p>
                        )}
                        {p.distanceKm !== null && (
                          <p className="text-[11px] text-gray-400">{p.distanceKm} km away</p>
                        )}
                      </div>
                      <a
                        href={`/customer/orders/create?provider=${p.id}`}
                        className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:shadow-md"
                      >
                        Book Now
                      </a>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white py-10 text-center shadow-sm dark:bg-gray-800">
                <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We don&apos;t have laundry providers in this area yet. We&apos;re expanding soon!
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Services grid — compact, DB-driven, colorful icons */}
        <div className="mb-3 text-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">What We Offer</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Default platform pricing — actual rates may vary by provider
          </p>
        </div>

        {servicesLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : (
          // Wider cards than the old 6-up grid: the icon now sits inline
          // beside the service name (rather than stacked above it), which
          // needs real horizontal room before the name starts wrapping.
          <div className="mb-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((service, index) => {
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -3 }}
                  className="flex flex-col rounded-xl border border-transparent bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:bg-gray-800"
                >
                  {/* Row 1 — icon + name side by side */}
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-lg ${ICON_GRADIENTS[index % ICON_GRADIENTS.length]}`}>
                      <ProductIcon
                        src={resolveServiceIconSrc(service.name)}
                        fallbackEmoji={service.icon}
                        alt={service.name}
                        size={40}
                      />
                    </div>
                    <h3 className="min-w-0 flex-1 text-sm font-bold leading-tight text-gray-900 dark:text-white">
                      {service.name}
                    </h3>
                  </div>

                  {/* Row 2 — description. flex-1 so every card's price row
                      lines up at the same height regardless of text length. */}
                  <p className="mt-2.5 line-clamp-2 flex-1 text-xs leading-snug text-gray-500 dark:text-gray-400">
                    {service.description}
                  </p>

                  {/* Row 3 — price + link to the calculator.
                      No "Add to Cart" here on purpose: a service card has no
                      selected product type (garment/item), so adding one
                      meant silently guessing at whatever the catalog's
                      arbitrary "default" product type for that service was.
                      That produced adds the customer never actually chose
                      (e.g. tapping "Dry Cleaning" silently added a Saree).
                      The pricing calculator is where they pick a real
                      product type. */}
                  <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                        {formatINR(service.startingPrice)}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {service.pricingModel === 'per_kg' ? '/kg' : '/item'}
                      </span>
                    </div>
                    <a
                      href="/customer/pricing-calculator"
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50"
                    >
                      See pricing
                    </a>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Why Choose Us — compact */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-600 p-6 text-white sm:p-8">
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
            <div className="relative z-10">
              <h2 className="mb-6 text-center text-xl font-bold sm:text-2xl">Why Choose Laundrease?</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <div className="text-center">
                  <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold">Quality Assured</h3>
                  <p className="mt-1 text-xs text-white/80">Verified &amp; certified providers</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <Clock className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold">On-Time Delivery</h3>
                  <p className="mt-1 text-xs text-white/80">Track every step of your order</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <Heart className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-semibold">Care for Your Clothes</h3>
                  <p className="mt-1 text-xs text-white/80">Eco-friendly, gentle processes</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {cart.itemCount > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-blue-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-blue-900 dark:bg-gray-900/95">
          <div className="container mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {cart.itemCount} item{cart.itemCount !== 1 ? 's' : ''}
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {formatINR(cart.subtotal)}
              </span>
            </div>
            <button
              onClick={cart.placeOrder}
              disabled={cart.placing}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
            >
              {cart.placing ? 'Placing...' : 'Place Order'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
