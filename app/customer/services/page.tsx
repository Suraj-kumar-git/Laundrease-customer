'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Star,
  Clock,
  MapPin,
  ShieldCheck,
  Loader2,
  Heart,
  Navigation,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
} from 'lucide-react'
import { AreaSearchBox, type AreaSelection } from './components/AreaSearchBox'
import { useCart } from '@/components/cart-provider'
import { makeCartItemKey } from '@/lib/cart-store'
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
}

const ICON_GRADIENTS = [
  'from-violet-500 to-purple-500',
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
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-violet-950">
      {/* Hero — compact */}
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-10 sm:py-12">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="container relative z-10 mx-auto text-center"
        >
          <h1 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl">
            Our Premium Services
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/85 sm:text-base">
            Professional laundry care, tailored to your area
          </p>

          <div className="mt-6">
            <AreaSearchBox
              loading={searchLoading}
              onAreaSelected={handleAreaSelected}
              onFreeTextSearch={handleFreeTextSearch}
            />
          </div>
        </motion.div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Provider results */}
        {searched && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <Navigation className="h-4 w-4 text-violet-600" />
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
                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              </div>
            ) : providers.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {providers.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-violet-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-gray-900 dark:text-white">{p.name}</h3>
                        {p.subtitle && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400">
                            <MapPin className="h-3 w-3 shrink-0" /> {p.subtitle}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        <Star className="h-3 w-3 fill-current" /> {p.rating?.toFixed(1) ?? '—'}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        {p.minPriceKg !== null ? (
                          <p className="text-sm font-bold text-violet-600 dark:text-violet-400">
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
                        className="rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:shadow-md"
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
            <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
          </div>
        ) : (
          <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {services.map((service, index) => {
              const dpt = service.defaultProductType
              const cartKey = dpt ? makeCartItemKey(dpt.id, service.id) : ''
              const cartItem = dpt
                ? cart.items.find(i => i.product_type_id === dpt.id && i.service_id === service.id)
                : undefined
              return (
                <motion.div
                  key={service.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -3 }}
                  className="rounded-xl border border-transparent bg-white p-3.5 shadow-sm transition-all hover:border-violet-300 hover:shadow-md dark:bg-gray-800"
                >
                  <div className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-lg overflow-hidden ${ICON_GRADIENTS[index % ICON_GRADIENTS.length]}`}>
                    <ProductIcon
                      src={resolveServiceIconSrc(service.name)}
                      fallbackEmoji={service.icon}
                      alt={service.name}
                      size={40}
                    />
                  </div>
                  <h3 className="text-sm font-bold leading-tight text-gray-900 dark:text-white">
                    {service.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                    {service.description}
                  </p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-base font-bold text-violet-600 dark:text-violet-400">
                      {formatINR(service.startingPrice)}
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {service.pricingModel === 'per_kg' ? '/kg' : '/item'} starting
                    </span>
                  </div>

                  <div className="mt-3">
                    {!dpt ? (
                      <a
                        href="/customer/pricing-calculator"
                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
                      >
                        See pricing
                      </a>
                    ) : !cartItem ? (
                      <button
                        onClick={() =>
                          cart.addItem({
                            product_type_id: dpt.id,
                            product_type_name: dpt.name,
                            pricing_model: dpt.pricingModel,
                            icon: dpt.icon,
                            service_id: service.id,
                            service_name: service.name,
                            unit_price: dpt.unitPrice,
                            quantity: 1,
                            weight_kg: 1,
                            express_multiplier: service.isExpressAvailable ? 1.5 : 1,
                          })
                        }
                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-violet-200 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/20"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" /> Add to Cart
                      </button>
                    ) : (
                      <div className="flex items-center justify-between rounded-lg bg-violet-50 px-2 py-1 dark:bg-violet-900/20">
                        <button
                          onClick={() => {
                            const field = dpt!.pricingModel === 'per_kg' ? 'weight_kg' : 'quantity'
                            const current = dpt!.pricingModel === 'per_kg' ? cartItem.weight_kg : cartItem.quantity
                            if (current <= 1) cart.removeItem(cartKey)
                            else cart.updateItem(cartKey, field, current - 1)
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-violet-700 shadow-sm dark:bg-gray-700"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                          {dpt!.pricingModel === 'per_kg' ? `${cartItem.weight_kg}kg` : cartItem.quantity}
                        </span>
                        <button
                          onClick={() => {
                            const field = dpt!.pricingModel === 'per_kg' ? 'weight_kg' : 'quantity'
                            const current = dpt!.pricingModel === 'per_kg' ? cartItem.weight_kg : cartItem.quantity
                            cart.updateItem(cartKey, field, current + 1)
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-violet-700 shadow-sm dark:bg-gray-700"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Why Choose Us — compact */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 p-6 text-white sm:p-8">
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
        <div className="sticky bottom-0 z-20 border-t border-violet-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-violet-900 dark:bg-gray-900/95">
          <div className="container mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4 text-violet-600" />
              <span className="font-semibold text-gray-900 dark:text-white">
                {cart.itemCount} item{cart.itemCount !== 1 ? 's' : ''}
              </span>
              <span className="text-gray-400">·</span>
              <span className="font-bold text-violet-600 dark:text-violet-400">
                {formatINR(cart.subtotal)}
              </span>
            </div>
            <button
              onClick={cart.placeOrder}
              disabled={cart.placing}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
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
