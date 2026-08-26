'use client'
// app/customer/compare/page.tsx
//
// Public side-by-side price comparison for two providers in the same area.
//
// The interaction is slot-driven rather than search-driven: the search bar at
// the top stays inert until the visitor taps one of the two cards, which is
// what makes it obvious where a result is about to land. The area is searched
// ONCE and then locked — both providers are picked from that one result list,
// because comparing providers from different areas would be meaningless.
//
// Prices come straight from the same public endpoint the pricing calculator
// uses (services-by-area?provider_id=), so GST-inclusive providers are already
// GST-adjusted server-side and the two columns are directly comparable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scale, ArrowLeftRight, Search, TrendingDown, Info, Sparkles, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { providerLabel } from '@/lib/provider-label'
import { FooterPageLayout } from '@/components/layout/footer-page-layout'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveProductIconSrc } from '@/lib/product-icons'
import { AreaProviderSearch } from './components/AreaProviderSearch'
import { ProviderSlot } from './components/ProviderSlot'
import {
  buildCompareGroups, summarise,
  type CompareProvider, type CompareSlot, type SlotId,
} from './types'

function fmt(n: number) {
  return `₹${n % 1 === 0 ? n : n.toFixed(2)}`
}

export default function ComparePage() {
  // Two separate values on purpose. `areaLabel` is what the visitor sees in the
  // locked search box ("Pune, Maharashtra, India"); `areaQuery` is what the
  // provider API is queried with ("Pune"). Conflating them is what made a
  // picked Google suggestion return nothing while typing the same place worked.
  const [areaLabel, setAreaLabel]   = useState<string | null>(null)
  const [areaQuery, setAreaQuery]   = useState<string | null>(null)
  const [providers, setProviders]   = useState<CompareProvider[]>([])
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [searched, setSearched]     = useState(false)

  const [slotA, setSlotA] = useState<CompareSlot | null>(null)
  const [slotB, setSlotB] = useState<CompareSlot | null>(null)
  const [loadingSlot, setLoadingSlot] = useState<SlotId | null>(null)
  const [armedSlot, setArmedSlot]     = useState<SlotId | null>(null)

  const [serviceFilter, setServiceFilter] = useState<number | 'all'>('all')
  const [itemQuery, setItemQuery]         = useState('')
  const [onlyDiff, setOnlyDiff]           = useState(false)

  const restored = useRef(false)

  // ---- Data loading -------------------------------------------------------

  // `term` must be a city name or pincode — this endpoint filters on
  // `lp.city ILIKE` / exact postal_code and uses lat/lng only to compute the
  // distance and delivery-fee columns, never to narrow the result set.
  const loadProviders = useCallback(async (term: string, coords: { lat: number; lng: number } | null) => {
    setLoadingProviders(true)
    setSearched(false)
    try {
      const qs = coords
        ? `lat=${coords.lat}&lng=${coords.lng}&location=${encodeURIComponent(term)}`
        : `location=${encodeURIComponent(term)}`
      const res  = await fetch(`/api/customer/laundry-providers/search?${qs}`)
      const json = await res.json()
      const list: CompareProvider[] = json.success ? json.data.providers : []
      setProviders(list)
      return list
    } catch {
      setProviders([])
      return [] as CompareProvider[]
    } finally {
      setLoadingProviders(false)
      setSearched(true)
    }
  }, [])

  const loadSlot = useCallback(async (slotId: SlotId, provider: CompareProvider) => {
    setLoadingSlot(slotId)
    try {
      const res  = await fetch(`/api/customer/public/pricing/services-by-area?provider_id=${provider.id}`)
      const json = await res.json()
      const services = json.success && json.data.covered ? json.data.services : []
      const next: CompareSlot = { provider, services }
      if (slotId === 'a') setSlotA(next); else setSlotB(next)
    } finally {
      setLoadingSlot(null)
    }
  }, [])

  // ---- Shareable URL ------------------------------------------------------
  // ?area=&a=&b= — a comparison is exactly the kind of thing someone forwards
  // to whoever actually does the laundry, so it has to survive a paste.
  // history.replaceState (not router.replace) because this only annotates the
  // address bar; a navigation would refetch the page to change a query string.

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const sp = new URLSearchParams(window.location.search)
    const area = sp.get('area')
    if (!area) return
    // `q` is the searchable term; older links without it were only ever written
    // from free text, where label and term were the same thing.
    const q   = sp.get('q') || area
    const aId = Number(sp.get('a')) || null
    const bId = Number(sp.get('b')) || null

    ;(async () => {
      setAreaLabel(area)
      setAreaQuery(q)
      const list = await loadProviders(q, null)
      const findAndLoad = (id: number | null, slotId: SlotId) => {
        const p = list.find(x => x.id === id)
        if (p) return loadSlot(slotId, p)
      }
      await Promise.all([findAndLoad(aId, 'a'), findAndLoad(bId, 'b')])
    })()
  }, [loadProviders, loadSlot])

  useEffect(() => {
    if (!restored.current) return
    const sp = new URLSearchParams()
    if (areaLabel)        sp.set('area', areaLabel)
    // Only when it differs — no point doubling the URL for a free-text search.
    if (areaQuery && areaQuery !== areaLabel) sp.set('q', areaQuery)
    if (slotA?.provider)  sp.set('a', String(slotA.provider.id))
    if (slotB?.provider)  sp.set('b', String(slotB.provider.id))
    const qs = sp.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [areaLabel, areaQuery, slotA, slotB])

  // ---- Handlers -----------------------------------------------------------

  // A filled slot only means anything in the context of the area it was picked
  // from — this whole page compares two providers serving the SAME place. So
  // any change of area empties both slots.
  //
  // Without this, clearing the search left the already-chosen provider sitting
  // in its card: pick a provider in area A, hit "Change area", search area B,
  // fill the second card — and you'd be comparing prices across two different
  // cities, which the summary strip would then happily total up as if it meant
  // something.
  function clearSlots() {
    setSlotA(null)
    setSlotB(null)
  }

  async function handleAreaResolved(label: string, searchTerm: string, coords: { lat: number; lng: number } | null) {
    // Covers retyping a new area directly, which the empty-results path allows
    // without going through "Change area" first.
    if (areaQuery !== null && areaQuery !== searchTerm) clearSlots()
    setAreaLabel(label)
    setAreaQuery(searchTerm)
    await loadProviders(searchTerm, coords)
  }

  function handleClearArea() {
    setAreaLabel(null)
    setAreaQuery(null)
    setProviders([])
    setSearched(false)
    setArmedSlot(null)
    clearSlots()
  }

  async function handlePickProvider(p: CompareProvider) {
    if (!armedSlot) return
    const target = armedSlot
    setArmedSlot(null)
    await loadSlot(target, p)
  }

  function clearSlot(slotId: SlotId) {
    if (slotId === 'a') setSlotA(null); else setSlotB(null)
  }

  function swapSlots() {
    setSlotA(slotB)
    setSlotB(slotA)
  }

  // ---- Derived ------------------------------------------------------------

  const groups  = useMemo(
    () => buildCompareGroups(slotA?.services ?? null, slotB?.services ?? null),
    [slotA, slotB]
  )
  const summary = useMemo(() => summarise(groups), [groups])

  const visibleGroups = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    return groups
      .filter(g => serviceFilter === 'all' || g.serviceId === serviceFilter)
      .map(g => ({
        ...g,
        rows: g.rows.filter(r => {
          if (q && !r.productName.toLowerCase().includes(q)) return false
          if (onlyDiff && r.priceA != null && r.priceB != null && r.priceA === r.priceB) return false
          return true
        }),
      }))
      .filter(g => g.rows.length > 0)
  }, [groups, serviceFilter, itemQuery, onlyDiff])

  const bothFilled = !!slotA && !!slotB
  const anyFilled  = !!slotA || !!slotB

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Compare Providers' }]}>
      {/* ---- Hero + search ---- */}
      {/* No overflow-hidden on this wrapper: the Places dropdown is absolutely
          positioned inside it and any clipping here truncates it at the hero's
          bottom edge. The decorative blob gets its own clipping layer instead,
          so it still can't cause a horizontal scrollbar. */}
      <div className="relative bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="container relative mx-auto px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-10">
          <div className="mx-auto mb-5 max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Scale className="h-3.5 w-3.5" /> Compare
            </span>
            <h1 className="mt-2.5 text-xl font-bold text-foreground sm:text-2xl md:text-3xl">
              Compare prices, side by side
            </h1>
            <p className="mx-auto mt-1.5 max-w-xl text-xs text-muted-foreground sm:text-sm">
              Pick two providers in your area and see exactly what each one charges — item by item, before you order.
            </p>
          </div>

          <AreaProviderSearch
            armed={armedSlot}
            areaLabel={areaLabel}
            providers={providers}
            loadingProviders={loadingProviders}
            searched={searched}
            takenIds={[slotA?.provider.id, slotB?.provider.id].filter(Boolean) as number[]}
            onAreaResolved={handleAreaResolved}
            onPickProvider={handlePickProvider}
            onClearArea={handleClearArea}
            onCancelArming={() => setArmedSlot(null)}
          />
        </div>
      </div>

      {/* ---- Slots + comparison ---- */}
      <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl">
          {/* Two columns at every breakpoint — stacking them on mobile would
              defeat the entire point of a side-by-side comparison. Content is
              compacted instead. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <ProviderSlot
              slotId="a" slot={slotA} armed={armedSlot === 'a'} loading={loadingSlot === 'a'}
              onArm={() => setArmedSlot('a')} onClear={() => clearSlot('a')}
            />
            <ProviderSlot
              slotId="b" slot={slotB} armed={armedSlot === 'b'} loading={loadingSlot === 'b'}
              onArm={() => setArmedSlot('b')} onClear={() => clearSlot('b')}
            />
          </div>

          {bothFilled && (
            <div className="mt-3 flex justify-center">
              <button
                type="button" onClick={swapSlots}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap columns
              </button>
            </div>
          )}

          {/* ---- Summary strip ---- */}
          <AnimatePresence>
            {bothFilled && summary.comparable > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              >
                <div className="flex items-start gap-2.5">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {summary.aCheaper === summary.bCheaper
                        ? 'Both providers are evenly matched'
                        : `${providerLabel((summary.aCheaper > summary.bCheaper ? slotA : slotB)!.provider, { always: true })} is cheaper on more items`}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/90 dark:text-emerald-300/90">
                      Across {summary.comparable} item{summary.comparable !== 1 ? 's' : ''} both offer:{' '}
                      <span className="font-medium">{providerLabel(slotA!.provider, { always: true })}</span> wins {summary.aCheaper},{' '}
                      <span className="font-medium">{providerLabel(slotB!.provider, { always: true })}</span> wins {summary.bCheaper}
                      {summary.tied > 0 && <>, {summary.tied} tied</>}.
                      {(summary.aOnly > 0 || summary.bOnly > 0) && (
                        <> {summary.aOnly + summary.bOnly} item{summary.aOnly + summary.bOnly !== 1 ? 's are' : ' is'} offered by only one of them.</>
                      )}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ---- Empty state ---- */}
          {!anyFilled && !loadingSlot && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="mt-8 rounded-2xl border border-border/50 bg-card p-6 text-center sm:p-10"
            >
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary/40" />
              <p className="text-sm font-semibold text-foreground">Nothing to compare yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                Tap <span className="font-medium text-foreground">Add provider 1</span> above, search your area or
                pincode, and choose a provider. Then do the same for the second slot to see both price lists lined up.
              </p>
            </motion.div>
          )}

          {/* ---- Filters ---- */}
          {anyFilled && groups.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <FilterPill active={serviceFilter === 'all'} onClick={() => setServiceFilter('all')}>
                  All services
                </FilterPill>
                {groups.map(g => (
                  <FilterPill
                    key={g.serviceId}
                    active={serviceFilter === g.serviceId}
                    onClick={() => setServiceFilter(g.serviceId)}
                  >
                    {g.serviceName}
                  </FilterPill>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={itemQuery}
                    onChange={e => setItemQuery(e.target.value)}
                    placeholder="Find an item…"
                    className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  {itemQuery && (
                    <button
                      type="button" onClick={() => setItemQuery('')} aria-label="Clear item search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {bothFilled && (
                  <button
                    type="button"
                    onClick={() => setOnlyDiff(v => !v)}
                    className={cn(
                      'shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                      onlyDiff
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    )}
                  >
                    Only where prices differ
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ---- Comparison table ---- */}
          {anyFilled && (
            <div className="mt-4">
              {/* Sticky column header keeps the two provider names attached to
                  their prices once the list is long enough to scroll.
                  top-14 matches AppHeader's own h-14 exactly: at top-16 there
                  was an 8px strip between the two where scrolling rows showed
                  through above this header. Fully opaque bg-card rather than
                  bg-card/95 for the same reason — at 95% the rows passing
                  underneath ghosted through the header itself. */}
              <div className="sticky top-14 z-20 grid grid-cols-[minmax(0,1fr)_68px_68px] items-center gap-2 rounded-t-2xl border border-border/60 bg-card px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_112px_112px] sm:px-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Item</span>
                <span className="truncate text-center text-[11px] font-bold text-primary">
                  {slotA ? providerLabel(slotA.provider, { always: true }) : '—'}
                </span>
                <span className="truncate text-center text-[11px] font-bold text-violet-600 dark:text-violet-400">
                  {slotB ? providerLabel(slotB.provider, { always: true }) : '—'}
                </span>
              </div>

              <div className="rounded-b-2xl border border-t-0 border-border/60 bg-card">
                {visibleGroups.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No items match those filters.
                  </p>
                ) : (
                  visibleGroups.map(group => (
                    <div key={group.serviceId}>
                      <div className="border-y border-border/40 bg-muted/40 px-3 py-1.5 sm:px-4">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {group.serviceName}
                        </p>
                      </div>
                      {group.rows.map((row, i) => {
                        const aWins = row.priceA != null && row.priceB != null && row.priceA < row.priceB
                        const bWins = row.priceA != null && row.priceB != null && row.priceB < row.priceA
                        return (
                          <motion.div
                            key={row.key}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: Math.min(i, 10) * 0.015 }}
                            className="grid grid-cols-[minmax(0,1fr)_68px_68px] items-center gap-2 border-b border-border/30 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_112px_112px] sm:px-4"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <ProductIcon
                                src={resolveProductIconSrc(row.productName)}
                                fallbackEmoji={row.icon}
                                alt={row.productName}
                                size={22}
                                className="shrink-0"
                              />
                              <span className="truncate text-xs font-medium text-foreground sm:text-sm">
                                {row.productName}
                              </span>
                            </div>
                            <PriceCell value={row.priceA} wins={aWins} />
                            <PriceCell value={row.priceB} wins={bWins} />
                          </motion.div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>

              <p className="mt-3 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Prices shown are per piece and include GST where the provider prices inclusive of it. Delivery and
                platform fees are added at checkout and can differ between providers.
              </p>
            </div>
          )}
        </div>
      </div>
    </FooterPageLayout>
  )
}

// ---- Small presentational pieces ------------------------------------------

function FilterPill({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'border border-border bg-card text-muted-foreground hover:bg-muted'
      )}
    >
      {children}
    </button>
  )
}

function PriceCell({ value, wins }: { value: number | null; wins: boolean }) {
  if (value == null) {
    return (
      <span className="text-center text-xs text-muted-foreground/50" title="Not offered">—</span>
    )
  }
  return (
    <div className="flex flex-col items-center">
      <motion.span
        initial={wins ? { scale: 0.9 } : false}
        animate={{ scale: 1 }}
        className={cn(
          'text-xs font-semibold tabular-nums sm:text-sm',
          wins ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
        )}
      >
        {fmt(value)}
      </motion.span>
      {wins && (
        <span className="mt-0.5 rounded-full bg-emerald-100 px-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          Cheaper
        </span>
      )}
    </div>
  )
}
