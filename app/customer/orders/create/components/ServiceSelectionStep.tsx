'use client'
// app/customer/orders/create/components/ServiceSelectionStep.tsx
// Changes from v2: added filter dropdowns (category, service, gender) to per-unit tab.
// Everything else unchanged — only the UnitTab function and its parent are modified.

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Droplets, Sparkles, Wind, Zap, Scale, Tag,
  Plus, Minus, Trash2, Loader2, ChevronRight, ChevronDown,
  Search, X as XIcon, SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { KgService, UnitProduct } from '@/types/order-types'
import { LaundryProvider, SelectedService } from '../../types'

interface ServiceSelectionStepProps {
  provider: LaundryProvider
  initialSelected: SelectedService[]
  prefetchedServices?: { per_kg_services: KgService[]; per_unit_products: UnitProduct[] }
  onComplete: (services: SelectedService[]) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  everyday:      'Everyday Wear',
  ethnic_formal: 'Ethnic & Formal',
  household:     'Household Items',
  specialty:     'Specialty Items',
  shoes:         'Shoes',
  bags:          'Bags & Accessories',
  woolen:        'Woolen & Winter',
  default:       'Other',
}

// Gender filter — which categories belong to which gender
const GENDER_MAP: Record<string, string[]> = {
  "Men's":    ['everyday'],       // shirts, trousers, kurta/pyjama, achkan
  "Women's":  ['ethnic_formal'],  // saree, lehenga, salwar, dupatta
  "Unisex":   ['woolen', 'specialty', 'shoes', 'bags', 'household'],
  "All":      [],                 // empty = no filter
}

// Service category labels for filter dropdown
const SERVICE_LABELS: Record<string, string> = {
  dry_cleaning:   'Dry Cleaning',
  steam_ironing:  'Steam Iron',
  wash_fold:      'Wash & Fold',
  wash_iron:      'Wash & Steam Iron',
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

// ---- Filter Dropdown ----------------------------------------
function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all',
          value && value !== 'All' && value !== 'all'
            ? 'border-primary/40 bg-primary/5 text-primary'
            : 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground'
        )}
      >
        <span>{selected?.label ?? label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-border/50 bg-popover shadow-lg"
          >
            {options.map(opt => (
              <div
                key={opt.value}
                role="option"
                aria-selected={value === opt.value}
                tabIndex={0}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (onChange(opt.value), setOpen(false))}
                className={cn(
                  'cursor-pointer select-none px-3 py-2 text-xs transition-colors',
                  value === opt.value
                    ? 'bg-primary/5 font-semibold text-primary'
                    : 'text-foreground hover:bg-muted/50'
                )}
              >
                {opt.label}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---- Per-Kg Tab (unchanged from v2) -------------------------
function KgTab({
  services, selections, isExpressGlobal, onChange,
}: {
  services: KgService[]
  selections: Map<number, { weight_kg: number }>
  isExpressGlobal: boolean
  onChange: (serviceId: number, field: 'weight_kg' | 'remove', value: any) => void
}) {
  if (services.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
        <Droplets className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No per-kg services from this provider</p>
      </div>
    )

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">~5 garments per kg</p>
      {services.map(svc => {
        const sel = selections.get(svc.service_id)
        const isSelected = !!sel
        const effectivePrice = svc.price_per_kg * (isExpressGlobal && svc.is_express_available ? svc.express_multiplier : 1)
        const lineTotal = isSelected ? Math.round(effectivePrice * sel.weight_kg * 100) / 100 : 0

        return (
          <div key={svc.service_id} className={cn(
            'rounded-2xl border p-4 transition-all',
            isSelected ? 'border-primary/40 bg-primary/5 shadow-sm' : 'border-border/50 bg-card'
          )}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  <Droplets className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{svc.service_name}</p>
                  {svc.description && <p className="mt-0.5 text-xs text-muted-foreground">{svc.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {formatINR(svc.price_per_kg)}/kg
                      {isExpressGlobal && svc.is_express_available && (
                        <span className="ml-1 text-amber-600"> → {formatINR(effectivePrice)}/kg</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{svc.turnaround_hours}h</span>
                  </div>
                </div>
              </div>
              {!isSelected ? (
                <button type="button" onClick={() => onChange(svc.service_id, 'weight_kg', 1)}
                  className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
                  + Add
                </button>
              ) : (
                <button type="button" onClick={() => onChange(svc.service_id, 'remove', null)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <AnimatePresence>
              {isSelected && sel && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="mt-4 space-y-3">
                  <div className="h-px bg-border/40" />
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Scale className="h-4 w-4 text-muted-foreground" /> Weight
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => onChange(svc.service_id, 'weight_kg', Math.max(0.5, sel.weight_kg - 0.5))}
                        disabled={sel.weight_kg <= 0.5}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-16 text-center text-sm font-bold text-foreground">{sel.weight_kg} kg</span>
                      <button type="button"
                        onClick={() => onChange(svc.service_id, 'weight_kg', sel.weight_kg + 0.5)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Line total</span>
                    <span className="text-base font-bold text-primary">{formatINR(lineTotal)}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

// ---- Per-Unit Tab WITH filters ------------------------------
function UnitTab({
  products, selections, isExpressGlobal, onChange,
}: {
  products: UnitProduct[]
  selections: Map<string, { quantity: number }>
  isExpressGlobal: boolean
  onChange: (key: string, field: 'quantity' | 'remove', value: any, product: UnitProduct) => void
}) {
  const [search,        setSearch]        = useState('')
  const [filterGender,  setFilterGender]  = useState('All')
  const [filterCat,     setFilterCat]     = useState('all')
  const [filterService, setFilterService] = useState('all')
  const searchRef = useRef<HTMLInputElement>(null)

  // Derive unique categories and services from loaded products
  const availableCategories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.display_category)))
    return [{ value: 'all', label: 'All Categories' },
      ...cats.map(c => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))]
  }, [products])

  const availableServices = useMemo(() => {
    const svcs = Array.from(new Set(products.map(p => p.service_name)))
    return [{ value: 'all', label: 'All Services' },
      ...svcs.map(s => ({ value: s, label: SERVICE_LABELS[s] ?? s }))]
  }, [products])

  const genderOptions = [
    { value: 'All',      label: 'All Gender' },
    { value: "Men's",    label: "Men's" },
    { value: "Women's",  label: "Women's" },
    { value: 'Unisex',   label: 'Unisex' },
  ]

  // Apply all filters
  const filtered = useMemo(() => {
    const q       = search.trim().toLowerCase()
    const gCats   = filterGender !== 'All' ? GENDER_MAP[filterGender] ?? [] : []

    return products.filter(p => {
      if (q && !p.product_type_name.toLowerCase().includes(q) &&
               !p.service_name.toLowerCase().includes(q) &&
               !p.display_category.toLowerCase().includes(q)) return false
      if (filterGender !== 'All' && gCats.length > 0 && !gCats.includes(p.display_category)) return false
      if (filterCat    !== 'all' && p.display_category !== filterCat)    return false
      if (filterService !== 'all' && p.service_name !== filterService)   return false
      return true
    })
  }, [products, search, filterGender, filterCat, filterService])

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, UnitProduct[]>()
    for (const p of filtered) {
      if (!map.has(p.display_category)) map.set(p.display_category, [])
      map.get(p.display_category)!.push(p)
    }
    return map
  }, [filtered])

  const unitKey = (p: UnitProduct) => `${p.product_type_id}_${p.service_id}`
  const activeFiltersCount = [
    filterGender !== 'All', filterCat !== 'all', filterService !== 'all'
  ].filter(Boolean).length

  const clearFilters = () => {
    setSearch(''); setFilterGender('All'); setFilterCat('all'); setFilterService('all')
  }

  if (products.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
        <Tag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No per-unit services from this provider</p>
      </div>
    )

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input ref={searchRef} type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items… shirt, saree, curtain"
          className="w-full rounded-xl border border-input bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        {search && (
          <button type="button" onClick={() => { setSearch(''); searchRef.current?.focus() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter dropdowns row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Filter:</span>
        </div>
        <FilterDropdown label="Gender" value={filterGender} options={genderOptions} onChange={setFilterGender} />
        <FilterDropdown label="Category" value={filterCat} options={availableCategories} onChange={setFilterCat} />
        <FilterDropdown label="Service" value={filterService} options={availableServices} onChange={setFilterService} />
        {(activeFiltersCount > 0 || search) && (
          <button type="button" onClick={clearFilters}
            className="flex items-center gap-1 rounded-xl border border-destructive/30 px-2.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/5">
            <XIcon className="h-3 w-3" /> Clear ({activeFiltersCount + (search ? 1 : 0)})
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} found
        {products.length !== filtered.length && ` of ${products.length} total`}
      </p>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">No items match your filters</p>
          <button type="button" onClick={clearFilters}
            className="mt-2 text-xs text-primary hover:underline">Clear all filters</button>
        </div>
      )}

      {/* Category groups */}
      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category} className="overflow-hidden rounded-2xl border border-border/50">
          <div className="bg-muted/30 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[category] ?? category}
            </span>
            <span className="ml-2 text-[10px] text-muted-foreground/60">({items.length} items)</span>
          </div>
          <div className="divide-y divide-border/30">
            {items.map(product => {
              const key = unitKey(product)
              const sel = selections.get(key)
              const isSelected = !!sel
              const effectivePrice = product.unit_price * (isExpressGlobal && product.is_express_available ? product.express_multiplier : 1)
              const lineTotal = isSelected ? Math.round(effectivePrice * sel.quantity * 100) / 100 : 0

              return (
                <div key={key} className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors',
                  isSelected && 'bg-primary/3'
                )}>
                  <span className="text-xl">{product.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{product.product_type_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.service_name} · {formatINR(product.unit_price)}/pc
                      {isExpressGlobal && product.is_express_available && (
                        <span className="ml-1 text-amber-600"> → {formatINR(effectivePrice)}/pc</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!isSelected ? (
                      <button type="button" onClick={() => onChange(key, 'quantity', 1, product)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground">
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <button type="button"
                            onClick={() => {
                              if (sel.quantity <= 1) onChange(key, 'remove', null, product)
                              else onChange(key, 'quantity', sel.quantity - 1, product)
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold">{sel.quantity}</span>
                          <button type="button"
                            onClick={() => onChange(key, 'quantity', sel.quantity + 1, product)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="w-16 text-right text-sm font-semibold text-primary">
                          {formatINR(lineTotal)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Main ---------------------------------------------------
export function ServiceSelectionStep({
  provider, initialSelected, prefetchedServices, onComplete,
}: ServiceSelectionStepProps) {
  const [kgServices,   setKgServices]   = useState<KgService[]>(prefetchedServices?.per_kg_services ?? [])
  const [unitProducts, setUnitProducts] = useState<UnitProduct[]>(prefetchedServices?.per_unit_products ?? [])
  const [loading,      setLoading]      = useState(!prefetchedServices || (prefetchedServices.per_kg_services.length === 0 && prefetchedServices.per_unit_products.length === 0))
  const [error,        setError]        = useState<string | null>(null)
  const [isExpressGlobal, setIsExpressGlobal] = useState(false)

  const defaultTab = useMemo(
    () => (prefetchedServices?.per_kg_services && prefetchedServices.per_kg_services.length > 0 ? 'per_kg' : 'per_unit') as 'per_kg' | 'per_unit',
    []
  )
  const [activeTab, setActiveTab] = useState<'per_kg' | 'per_unit'>(defaultTab)

  const [kgSel, setKgSel] = useState<Map<number, { weight_kg: number }>>(() => {
    const m = new Map<number, { weight_kg: number }>()
    initialSelected.filter(s => s.type === 'per_kg').forEach(s => m.set(s.service_id, { weight_kg: (s as any).weight_kg }))
    return m
  })
  const [unitSel, setUnitSel] = useState<Map<string, { quantity: number }>>(() => {
    const m = new Map<string, { quantity: number }>()
    initialSelected.filter(s => s.type === 'per_unit').forEach(s =>
      m.set(`${(s as any).product_type_id}_${s.service_id}`, { quantity: (s as any).quantity }))
    return m
  })

  useEffect(() => {
    if (!loading) return
    fetch(`/api/customer/laundry-providers/${provider.id}/services`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.error ?? 'Failed')
        const kg   = json.data.per_kg_services   ?? []
        const unit = json.data.per_unit_products ?? []
        setKgServices(kg)
        setUnitProducts(unit)
        if (kg.length === 0 && unit.length > 0) setActiveTab('per_unit')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [provider.id])

  useEffect(() => {
    if (!loading && kgServices.length === 0 && unitProducts.length > 0) setActiveTab('per_unit')
  }, [loading, kgServices.length, unitProducts.length])

  const handleKgChange = (serviceId: number, field: 'weight_kg' | 'remove', value: any) => {
    setKgSel(prev => { const next = new Map(prev); if (field === 'remove') next.delete(serviceId); else next.set(serviceId, { weight_kg: value }); return next })
  }
  const handleUnitChange = (key: string, field: 'quantity' | 'remove', value: any, _p: UnitProduct) => {
    setUnitSel(prev => { const next = new Map(prev); if (field === 'remove') next.delete(key); else next.set(key, { quantity: value }); return next })
  }

  const buildSelections = (): SelectedService[] => {
    const result: SelectedService[] = []
    kgSel.forEach((sel, serviceId) => {
      const svc = kgServices.find(s => s.service_id === serviceId)
      if (!svc || sel.weight_kg < 0.5) return
      const m = isExpressGlobal && svc.is_express_available ? svc.express_multiplier : 1
      result.push({
        type: 'per_kg', service_id: serviceId, service_name: svc.service_name,
        weight_kg: sel.weight_kg, unit_price: svc.price_per_kg, is_express: isExpressGlobal && svc.is_express_available,
        express_multiplier: svc.express_multiplier, line_total: Math.round(svc.price_per_kg * sel.weight_kg * m * 100) / 100,
        product_type_id: '',
        quantity: 0,
        product_type_name: '',
        icon: undefined
      })
    })
    unitSel.forEach((sel, key) => {
      const [ptId, svcId] = key.split('_').map(Number)
      const product = unitProducts.find(p => p.product_type_id === ptId && p.service_id === svcId)
      if (!product || sel.quantity < 1) return
      const m = isExpressGlobal && product.is_express_available ? product.express_multiplier : 1
      result.push({
        type: 'per_unit', product_type_id: ptId, product_type_name: product.product_type_name,
        icon: product.icon, service_id: svcId, service_name: product.service_name, quantity: sel.quantity,
        unit_price: product.unit_price, is_express: isExpressGlobal && product.is_express_available,
        express_multiplier: product.express_multiplier, line_total: Math.round(product.unit_price * sel.quantity * m * 100) / 100,
        weight_kg: 0
      })
    })
    return result
  }

  const selections = buildSelections()
  const subtotal   = selections.reduce((s, i) => s + i.line_total, 0)
  const totalItems = kgSel.size + unitSel.size
  const hasExpressCapable = (activeTab === 'per_kg' && kgServices.some(s => s.is_express_available)) ||
                            (activeTab === 'per_unit' && unitProducts.some(p => p.is_express_available))

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (error)   return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
      <p className="text-sm text-destructive">{error}</p>
      <button type="button" onClick={() => { setError(null); setLoading(true) }} className="mt-3 text-xs text-primary hover:underline">Try again</button>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2 rounded-xl border border-border/50 bg-muted/30 p-1">
        {([
          { id: 'per_kg' as const, label: 'By Weight', sub: 'Wash & Fold/Iron', count: kgServices.length },
          { id: 'per_unit' as const, label: 'By Piece', sub: 'Dry Clean, Steam Iron', count: unitProducts.length },
        ]).map(tab => (
          <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 flex-col items-center rounded-lg py-2.5 text-center transition-all',
              activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}>
            {tab.id === 'per_kg' ? <Scale className="mb-1 h-4 w-4" /> : <Tag className="mb-1 h-4 w-4" />}
            <span className="text-xs font-semibold">{tab.label}</span>
            <span className="text-[10px] text-muted-foreground">{tab.sub}</span>
            {tab.count === 0 && <span className="mt-0.5 text-[9px] text-muted-foreground/60">Not available</span>}
          </button>
        ))}
      </div>

      {/* Express global toggle */}
      {hasExpressCapable && (
        <button type="button" onClick={() => setIsExpressGlobal(v => !v)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all',
            isExpressGlobal ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30' : 'border-border/50 bg-card hover:border-border'
          )}>
          <div className="flex items-center gap-2">
            <Zap className={cn('h-4 w-4', isExpressGlobal ? 'text-amber-500' : 'text-muted-foreground')} />
            <div className="text-left">
              <p className={cn('text-sm font-semibold', isExpressGlobal ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>
                Express Delivery
              </p>
              <p className="text-xs text-muted-foreground">Faster turnaround — prices updated below</p>
            </div>
          </div>
          <div className={cn('relative h-5 w-9 rounded-full transition-colors', isExpressGlobal ? 'bg-amber-500' : 'bg-muted-foreground/30')}>
            <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', isExpressGlobal ? 'translate-x-[18px]' : 'translate-x-0.5')} />
          </div>
        </button>
      )}

      {/* Tab content */}
      {activeTab === 'per_kg' ? (
        <KgTab services={kgServices} selections={kgSel} isExpressGlobal={isExpressGlobal} onChange={handleKgChange} />
      ) : (
        <UnitTab products={unitProducts} selections={unitSel} isExpressGlobal={isExpressGlobal} onChange={handleUnitChange} />
      )}

      {/* Sticky summary */}
      <AnimatePresence>
        {selections.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="sticky bottom-4 rounded-2xl bg-primary p-4 shadow-xl shadow-primary/25">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-primary-foreground/70">
                  {totalItems} service{totalItems !== 1 ? 's' : ''} selected
                  {isExpressGlobal && <span className="ml-1 text-amber-200">· Express</span>}
                </p>
                <p className="text-lg font-bold text-primary-foreground">{formatINR(subtotal)}</p>
              </div>
              <button type="button" onClick={() => onComplete(selections)}
                className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-sm hover:bg-white/90">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
