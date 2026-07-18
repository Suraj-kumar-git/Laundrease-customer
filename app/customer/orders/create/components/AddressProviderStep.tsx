'use client'
// app/customer/orders/create/components/AddressProviderStep.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Home, Briefcase, Building2, Check, Plus,
  Store, Star, Users, Clock, ShieldCheck, ArrowRight,
  Loader2, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Address, KgService, LaundryProvider, UnitProduct } from '@/types/order-types'

// ---- Types --------------------------------------------------
interface AddressProviderStepProps {
  initialAddress?: Address
  initialProvider?: LaundryProvider
  // Provider to auto-select once the list loads — set by the dashboard's
  // "Providers near you" cards via /customer/orders/create?provider=<id>.
  // Applied once; the user can still switch to any other provider after.
  preferredProviderId?: number | null
  // onComplete also returns prefetched services so Step 2 has zero loading time
  onComplete: (
    address: Address,
    delivery: Address,
    provider: LaundryProvider,
    prefetchedServices: { per_kg_services: KgService[]; per_unit_products: UnitProduct[] }
  ) => void
}

// ---- Helpers ------------------------------------------------
function AddressIcon({ label }: { label: string }) {
  const l = label?.toLowerCase() ?? ''
  if (l.includes('home')) return <Home className="h-4 w-4" />
  if (l.includes('office') || l.includes('work')) return <Briefcase className="h-4 w-4" />
  return <Building2 className="h-4 w-4" />
}

function RatingBadge({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-950/40">
        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
          {rating.toFixed(1)}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">
        ({count.toLocaleString('en-IN')} ratings)
      </span>
    </div>
  )
}

// ---- Main component -----------------------------------------
export function AddressProviderStep({
  initialAddress,
  initialProvider,
  preferredProviderId,
  onComplete,
}: AddressProviderStepProps) {
  const [addresses, setAddresses]               = useState<Address[]>([])
  const [providers, setProviders]               = useState<LaundryProvider[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(true)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [loadingServices, setLoadingServices]   = useState(false)
  const [selectedAddress, setSelectedAddress]   = useState<Address | null>(initialAddress ?? null)
  const [selectedProvider, setSelectedProvider] = useState<LaundryProvider | null>(initialProvider ?? null)
  const [showDropdown, setShowDropdown]         = useState(false)
  const [providerError, setProviderError]       = useState<string | null>(null)
  // Prefetched services cache: keyed by provider id
  const servicesCache = useRef<Map<number, { per_kg_services: KgService[]; per_unit_products: UnitProduct[] }>>(new Map())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Load addresses
  useEffect(() => {
    fetch('/api/customer/addresses', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const addrs: Address[] = json.data?.addresses ?? json.data ?? []
          setAddresses(addrs)
          if (!selectedAddress) {
            const def = addrs.find(a => a.is_default) ?? addrs[0]
            if (def) setSelectedAddress(def)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAddresses(false))
  }, [])

  // One-shot flag: the dashboard's preferred provider is applied only to the
  // first provider-list load, so switching address (or provider) afterwards
  // behaves exactly as before.
  const preferredAppliedRef = useRef(false)

  // Load providers when address changes
  useEffect(() => {
    if (!selectedAddress?.postal_code) return
    setLoadingProviders(true)
    setProviderError(null)
    setSelectedProvider(null)
    fetch(`/api/customer/laundry-providers/search?location=${selectedAddress.postal_code}`)
      .then(r => r.json())
      .then(json => {
        const list: LaundryProvider[] = json.success ? (json.data?.providers ?? []) : []
        setProviders(list)
        if (preferredProviderId && !preferredAppliedRef.current) {
          preferredAppliedRef.current = true
          const match = list.find(p => p.id === preferredProviderId)
          if (match) {
            setSelectedProvider(match)
            prefetchServices(match.id)
          }
        }
        if (list.length === 0)
          setProviderError(`No providers found for pincode ${selectedAddress.postal_code}`)
      })
      .catch(() => setProviderError('Failed to load providers'))
      .finally(() => setLoadingProviders(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddress?.postal_code])

  // Prefetch services when a provider is selected
  const prefetchServices = useCallback(async (providerId: number) => {
    if (servicesCache.current.has(providerId)) return
    setLoadingServices(true)
    try {
      const res  = await fetch(`/api/customer/laundry-providers/${providerId}/services`)
      const json = await res.json()
      if (json.success) {
        servicesCache.current.set(providerId, {
          per_kg_services:   json.data.per_kg_services   ?? [],
          per_unit_products: json.data.per_unit_products ?? [],
        })
      }
    } catch { /* non-fatal — Step 2 will retry */ }
    finally { setLoadingServices(false) }
  }, [])

  const handleSelectAddress = (addr: Address) => {
    setSelectedAddress(addr)
    setShowDropdown(false)
  }

  const handleSelectProvider = (provider: LaundryProvider) => {
    setSelectedProvider(provider)
    prefetchServices(provider.id)
  }

  const handleContinue = () => {
    if (!selectedAddress || !selectedProvider) return
    const cached = servicesCache.current.get(selectedProvider.id) ?? {
      per_kg_services: [], per_unit_products: [],
    }
    onComplete(selectedAddress, selectedAddress, selectedProvider, cached)
  }

  // ---- Address picker -----------------------------------------
  const renderAddressPicker = () => {
    if (loadingAddresses) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading your addresses…</span>
        </div>
      )
    }

    if (addresses.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No addresses saved</p>
          <a href="/customer/addresses/new"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Plus className="h-3 w-3" /> Add an address
          </a>
        </div>
      )
    }

    return (
      // Use a div wrapper — NOT a button — to avoid button-in-button
      <div ref={dropdownRef} className="relative">
        {/* Trigger — rendered as div, keyboard-accessible via tabIndex + onKeyDown */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowDropdown(v => !v)}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setShowDropdown(v => !v)}
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          className={cn(
            'flex cursor-pointer select-none items-start gap-3 rounded-xl border bg-card p-4 outline-none',
            'transition-all focus-visible:ring-2 focus-visible:ring-primary/40',
            showDropdown ? 'border-primary/40 shadow-sm' : 'border-border/50 hover:border-border'
          )}
        >
          {selectedAddress ? (
            <>
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <AddressIcon label={selectedAddress.label} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{selectedAddress.label}</span>
                  {selectedAddress.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {selectedAddress.address_line1}
                  {selectedAddress.landmark ? `, near ${selectedAddress.landmark}` : ''}
                  {`, ${selectedAddress.city} - ${selectedAddress.postal_code}`}
                </p>
              </div>
              <ChevronDown className={cn(
                'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                showDropdown && 'rotate-180'
              )} />
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select pickup address</span>
          )}
        </div>

        {/* Dropdown — role="listbox" with role="option" items */}
        <AnimatePresence>
          {showDropdown && (
            <motion.div
              role="listbox"
              aria-label="Select address"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-lg"
            >
              {addresses.map((addr, i) => (
                // Each item is a div with role="option" — no nested buttons
                <div
                  key={addr.id}
                  role="option"
                  aria-selected={addr.id === selectedAddress?.id}
                  tabIndex={0}
                  onClick={() => handleSelectAddress(addr)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleSelectAddress(addr)}
                  className={cn(
                    'flex cursor-pointer select-none items-start gap-3 px-4 py-3 outline-none',
                    'transition-colors focus-visible:bg-muted/50',
                    i < addresses.length - 1 && 'border-b border-border/30',
                    addr.id === selectedAddress?.id ? 'bg-primary/5' : 'hover:bg-muted/50'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    addr.id === selectedAddress?.id
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    <AddressIcon label={addr.label} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{addr.label}</span>
                      {addr.is_default && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Default
                        </span>
                      )}
                      {addr.id === selectedAddress?.id && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {addr.address_line1}{addr.city ? `, ${addr.city}` : ''}
                    </p>
                  </div>
                </div>
              ))}
              <div className="border-t border-border/40 p-2">
                <a
                  href="/customer/addresses/new"
                  className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add new address
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ---- Provider grid ------------------------------------------
  const renderProviders = () => {
    if (!selectedAddress) {
      return (
        <div className="rounded-xl border border-dashed border-border/40 p-6 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Select an address to see providers</p>
        </div>
      )
    }

    if (loadingProviders) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-2xl border border-border/40 bg-card p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      )
    }

    if (providerError || providers.length === 0) {
      return (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-8 text-center">
          <Store className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-foreground">No providers in this area</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerError ?? `We don't serve pincode ${selectedAddress?.postal_code} yet.`}
          </p>
        </div>
      )
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map(provider => {
          const isSelected = selectedProvider?.id === provider.id
          const isPrefetched = servicesCache.current.has(provider.id)

          return (
            // Outer is a div — we use a child button only for the "Continue" CTA
            // This eliminates all button-in-button nesting
            <motion.div
              key={provider.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelectProvider(provider)}
              className={cn(
                'relative flex cursor-pointer flex-col rounded-2xl border p-4 transition-all duration-200',
                isSelected
                  ? 'border-primary/50 bg-primary/5 shadow-md shadow-primary/10'
                  : 'border-border/50 bg-card hover:border-primary/30 hover:shadow-sm'
              )}
            >
              {/* Selected check */}
              {isSelected && (
                <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
              )}

              {/* Avatar + name */}
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/80 to-blue-700 text-lg font-bold text-white">
                  {provider.business_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="truncate text-sm font-bold text-foreground">
                    {provider.business_name}
                  </p>
                  {provider.city && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{provider.city}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Rating */}
              <RatingBadge rating={provider.rating} count={provider.rating_count} />

              {/* Services */}
              {provider.services_offered && provider.services_offered.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {provider.services_offered.slice(0, 3).map(svc => (
                    <span key={svc}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {svc}
                    </span>
                  ))}
                  {provider.services_offered.length > 3 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      +{provider.services_offered.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* Certifications */}
              {provider.certifications && provider.certifications.length > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Certified</span>
                </div>
              )}

              {/* Continue button — rendered as a real button, but it's the ONLY button here.
                  The outer div handles provider selection; this button triggers navigation. */}
              <AnimatePresence>
                {isSelected && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    onClick={e => {
                      e.stopPropagation()   // prevent re-triggering outer div click
                      handleContinue()
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90"
                  >
                    {loadingServices && !isPrefetched ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading services…
                      </>
                    ) : (
                      <>
                        Continue to Services
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Address */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Pickup Address</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Delivery to same address
          </span>
        </div>
        {renderAddressPicker()}
      </div>

      {/* Providers */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            Choose Your Laundry Partner
          </h2>
          {providers.length > 0 && !loadingProviders && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {providers.length} near you
            </span>
          )}
        </div>
        {renderProviders()}
      </div>
    </div>
  )
}
