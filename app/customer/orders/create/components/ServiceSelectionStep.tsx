'use client'
// app/customer/orders/create/components/ServiceSelectionStep.tsx
// Changes from v2: added filter dropdowns (category, service, gender) to per-unit tab.
// Everything else unchanged — only the UnitTab function and its parent are modified.

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Droplets, Sparkles, Wind, Zap, Scale, Tag,
  Plus, Minus, Trash2, Loader2, ChevronRight,
  Search, X as XIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { KgService, UnitProduct } from '@/types/order-types'
import { LaundryProvider, SelectedService } from '../../types'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveProductIconSrc } from '@/lib/product-icons'
import { BottomSheet } from '@/components/common/BottomSheet'

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

// ---- Filter pills -------------------------------------------
// Shared look for the horizontal filter row (replaces the old dropdowns).
const PILL_BASE     = 'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors'
const PILL_INACTIVE = 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground'
const PILL_ACTIVE   = 'border-primary/40 bg-primary/10 text-primary'

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_INACTIVE)}>
      {label}
    </button>
  )
}

function ExpressPill({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={cn(
        PILL_BASE,
        active
          ? 'border-amber-400 bg-amber-100 text-amber-700 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
          : PILL_INACTIVE
      )}>
      <Zap className={cn('h-3.5 w-3.5', active && 'text-amber-500')} /> Express
    </button>
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
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">~5 garments per kg</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {services.map(svc => {
          const sel = selections.get(svc.service_id)
          const isSelected = !!sel
          const effectivePrice = svc.price_per_kg * (isExpressGlobal && svc.is_express_available ? svc.express_multiplier : 1)
          const lineTotal = isSelected ? Math.round(effectivePrice * sel.weight_kg * 100) / 100 : 0

          return (
            <div key={svc.service_id} className={cn(
              'flex flex-col gap-2 rounded-xl border p-3 transition-colors',
              isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-card'
            )}>
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}>
                  <Droplets className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{svc.service_name}</p>
                  <p className="text-[11px] text-muted-foreground">{svc.turnaround_hours}h turnaround</p>
                </div>
                {isSelected && (
                  <button type="button" onClick={() => onChange(svc.service_id, 'remove', null)}
                    className="shrink-0 rounded-lg p-1 text-muted-foreground/60 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {svc.mrp_per_kg && svc.mrp_per_kg > svc.price_per_kg && (
                  <span className="line-through mr-1">{formatINR(svc.mrp_per_kg)}</span>
                )}
                {formatINR(svc.price_per_kg)}/kg
                {isExpressGlobal && svc.is_express_available && (
                  <span className="ml-1 text-amber-600"> → {formatINR(effectivePrice)}/kg</span>
                )}
                {svc.mrp_per_kg && svc.mrp_per_kg > svc.price_per_kg && (
                  <span className="ml-1 text-green-600 dark:text-green-400 font-medium">
                    {Math.round((1 - svc.price_per_kg / svc.mrp_per_kg) * 100)}% off
                  </span>
                )}
              </p>

              {!isSelected ? (
                <button type="button" onClick={() => onChange(svc.service_id, 'weight_kg', 1)}
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1">
                    <button type="button"
                      onClick={() => onChange(svc.service_id, 'weight_kg', Math.max(0.5, sel.weight_kg - 0.5))}
                      disabled={sel.weight_kg <= 0.5}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-12 text-center text-sm font-bold text-foreground">{sel.weight_kg}kg</span>
                    <button type="button"
                      onClick={() => onChange(svc.service_id, 'weight_kg', sel.weight_kg + 0.5)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-right text-sm font-semibold text-primary">{formatINR(lineTotal)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- Per-Unit Tab: one card per product, service picker in a sheet ----------
// A product (e.g. Office Formal Shirt) appears ONCE with its services (Dry
// Cleaning, Express Wash, …) as variants behind an Add sheet — instead of one
// card per product×service row. Selection state and the onChange contract are
// untouched: keys stay `${product_type_id}_${service_id}`, so buildSelections
// and everything downstream (cart payload, checkout, APIs) see no difference.

interface ProductGroup {
  product_type_id:   number
  product_type_name: string
  icon:              string
  display_category:  string
  variants:          UnitProduct[]   // filter-surviving service rows for this product
}

function variantKey(p: UnitProduct) { return `${p.product_type_id}_${p.service_id}` }

function effectiveUnitPrice(p: UnitProduct, express: boolean) {
  return p.unit_price * (express && p.is_express_available ? p.express_multiplier : 1)
}

// Per-variant Add / qty-stepper row control, shared by the sheet and the
// single-variant card. Same onChange contract as before the regroup.
function VariantControl({
  product, sel, onChange, compact,
}: {
  product: UnitProduct
  sel: { quantity: number } | undefined
  onChange: (key: string, field: 'quantity' | 'remove', value: any, product: UnitProduct) => void
  compact?: boolean
}) {
  const key = variantKey(product)
  if (!sel) {
    return (
      <button type="button" onClick={() => onChange(key, 'quantity', 1, product)}
        className={cn(
          'flex items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/10 font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground',
          compact ? 'h-7 w-full text-[11px]' : 'h-8 px-4 text-xs'
        )}>
        <Plus className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> Add
      </button>
    )
  }
  return (
    <div className={cn('flex items-center', compact ? 'w-full justify-between gap-1' : 'gap-1')}>
      <button type="button"
        onClick={() => {
          if (sel.quantity <= 1) onChange(key, 'remove', null, product)
          else onChange(key, 'quantity', sel.quantity - 1, product)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-7 text-center text-sm font-bold text-foreground">{sel.quantity}</span>
      <button type="button" onClick={() => onChange(key, 'quantity', sel.quantity + 1, product)}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-primary">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

// Compact price line: "₹60/pc" with optional MRP strikethrough, % off, and
// express-adjusted price. `from` prefixes multi-variant cards' minimum price.
function PriceLine({ product, isExpressGlobal, from }: {
  product: UnitProduct; isExpressGlobal: boolean; from?: boolean
}) {
  const effective = effectiveUnitPrice(product, isExpressGlobal)
  const hasMrp = !!product.mrp && product.mrp > product.unit_price
  return (
    <p className="text-[11px] leading-tight text-muted-foreground">
      {from && <span>from </span>}
      {hasMrp && <span className="mr-1 line-through">{formatINR(product.mrp!)}</span>}
      <span className="font-semibold text-foreground">{formatINR(product.unit_price)}</span>/pc
      {isExpressGlobal && product.is_express_available && (
        <span className="ml-1 text-amber-600">→ {formatINR(effective)}</span>
      )}
      {hasMrp && (
        <span className="ml-1 font-medium text-green-600 dark:text-green-400">
          {Math.round((1 - product.unit_price / product.mrp!) * 100)}% off
        </span>
      )}
    </p>
  )
}

// The bottom-sheet service picker for a product with multiple variants.
function VariantSheet({
  group, allVariants, selections, isExpressGlobal, onChange, onClose,
}: {
  group: ProductGroup
  allVariants: UnitProduct[]
  selections: Map<string, { quantity: number }>
  isExpressGlobal: boolean
  onChange: (key: string, field: 'quantity' | 'remove', value: any, product: UnitProduct) => void
  onClose: () => void
}) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 border-b border-border/50">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProductIcon
            src={resolveProductIconSrc(group.product_type_name)}
            fallbackEmoji={group.icon}
            alt={group.product_type_name}
            size={36}
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{group.product_type_name}</p>
            <p className="text-[11px] text-muted-foreground">Choose a service</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-border/50 px-5 pb-5">
        {allVariants.map(v => {
          const sel = selections.get(variantKey(v))
          return (
            <div key={v.service_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{SERVICE_LABELS[v.service_name] ?? v.service_name}</p>
                <PriceLine product={v} isExpressGlobal={isExpressGlobal} />
                {sel && (
                  <p className="mt-0.5 text-[11px] font-semibold text-primary">
                    {formatINR(Math.round(effectiveUnitPrice(v, isExpressGlobal) * sel.quantity * 100) / 100)}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <VariantControl product={v} sel={sel} onChange={onChange} />
              </div>
            </div>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// One product card in the 2-col grid.
function ProductCard({
  group, allVariants, selections, isExpressGlobal, onChange, onOpenSheet,
}: {
  group: ProductGroup
  allVariants: UnitProduct[]
  selections: Map<string, { quantity: number }>
  isExpressGlobal: boolean
  onChange: (key: string, field: 'quantity' | 'remove', value: any, product: UnitProduct) => void
  onOpenSheet: (productTypeId: number) => void
}) {
  // Selection summary across ALL of this product's variants (not just the
  // filter-surviving ones), so nothing selected can become invisible.
  let totalQty = 0
  let totalLine = 0
  for (const v of allVariants) {
    const sel = selections.get(variantKey(v))
    if (!sel) continue
    totalQty  += sel.quantity
    totalLine += Math.round(effectiveUnitPrice(v, isExpressGlobal) * sel.quantity * 100) / 100
  }

  const singleVariant = allVariants.length === 1
  const cheapest = group.variants.reduce((min, v) => (v.unit_price < min.unit_price ? v : min), group.variants[0])
  const isSelected = totalQty > 0

  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-xl border p-2.5 transition-colors',
      isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-card'
    )}>
      <div className="flex items-start gap-2">
        <ProductIcon
          src={resolveProductIconSrc(group.product_type_name)}
          fallbackEmoji={group.icon}
          alt={group.product_type_name}
          size={32}
          className="shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{group.product_type_name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {singleVariant
              ? (SERVICE_LABELS[allVariants[0].service_name] ?? allVariants[0].service_name)
              : `${allVariants.length} services`}
          </p>
        </div>
      </div>

      <PriceLine product={cheapest} isExpressGlobal={isExpressGlobal} from={!singleVariant} />

      <div className="mt-auto">
        {singleVariant ? (
          <VariantControl product={allVariants[0]} sel={selections.get(variantKey(allVariants[0]))} onChange={onChange} compact />
        ) : !isSelected ? (
          <button type="button" onClick={() => onOpenSheet(group.product_type_id)}
            className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
            <Plus className="h-3 w-3" /> Add
          </button>
        ) : (
          <button type="button" onClick={() => onOpenSheet(group.product_type_id)}
            className="flex h-7 w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20">
            <span>{totalQty} added</span>
            <span>{formatINR(totalLine)} ·<span className="ml-0.5 underline">edit</span></span>
          </button>
        )}
      </div>
    </div>
  )
}

function UnitTab({
  products, selections, isExpressGlobal, onToggleExpress, onChange,
}: {
  products: UnitProduct[]
  selections: Map<string, { quantity: number }>
  isExpressGlobal: boolean
  onToggleExpress: () => void
  onChange: (key: string, field: 'quantity' | 'remove', value: any, product: UnitProduct) => void
}) {
  const [search,        setSearch]        = useState('')
  const [filterGender,  setFilterGender]  = useState('All')
  const [filterService, setFilterService] = useState('all')
  const searchRef = useRef<HTMLInputElement>(null)

  // Category filtering is handled by the rail now — pills cover gender,
  // service, and the express toggle.
  const availableServices = useMemo(() => {
    const svcs = Array.from(new Set(products.map(p => p.service_name)))
    return svcs.map(s => ({ value: s, label: SERVICE_LABELS[s] ?? s }))
  }, [products])

  const hasExpress = useMemo(() => products.some(p => p.is_express_available), [products])

  // Apply all filters
  const filtered = useMemo(() => {
    const q       = search.trim().toLowerCase()
    const gCats   = filterGender !== 'All' ? GENDER_MAP[filterGender] ?? [] : []

    return products.filter(p => {
      if (q && !p.product_type_name.toLowerCase().includes(q) &&
               !p.service_name.toLowerCase().includes(q) &&
               !p.display_category.toLowerCase().includes(q)) return false
      if (filterGender !== 'All' && gCats.length > 0 && !gCats.includes(p.display_category)) return false
      if (filterService !== 'all' && p.service_name !== filterService)   return false
      return true
    })
  }, [products, search, filterGender, filterService])

  // Group the filter-surviving rows into one entry per product, bucketed by
  // category. A product's card shows its cheapest surviving variant's price;
  // the full variant list (below) drives the Add sheet.
  const groupedByCategory = useMemo(() => {
    const cats = new Map<string, ProductGroup[]>()
    const byProduct = new Map<number, ProductGroup>()
    for (const p of filtered) {
      let g = byProduct.get(p.product_type_id)
      if (!g) {
        g = {
          product_type_id: p.product_type_id, product_type_name: p.product_type_name,
          icon: p.icon, display_category: p.display_category, variants: [],
        }
        byProduct.set(p.product_type_id, g)
        if (!cats.has(p.display_category)) cats.set(p.display_category, [])
        cats.get(p.display_category)!.push(g)
      }
      g.variants.push(p)
    }
    return cats
  }, [filtered])

  const productCount = useMemo(
    () => Array.from(groupedByCategory.values()).reduce((s, groups) => s + groups.length, 0),
    [groupedByCategory]
  )

  // ALL variants per product (unfiltered) — the sheet always shows every
  // service option, and selection summaries must count hidden variants too.
  const variantsByProduct = useMemo(() => {
    const map = new Map<number, UnitProduct[]>()
    for (const p of products) {
      if (!map.has(p.product_type_id)) map.set(p.product_type_id, [])
      map.get(p.product_type_id)!.push(p)
    }
    return map
  }, [products])

  const [sheetProductId, setSheetProductId] = useState<number | null>(null)
  const sheetGroup = useMemo(() => {
    if (sheetProductId == null) return null
    const variants = variantsByProduct.get(sheetProductId)
    if (!variants || variants.length === 0) return null
    const p = variants[0]
    return {
      group: {
        product_type_id: p.product_type_id, product_type_name: p.product_type_name,
        icon: p.icon, display_category: p.display_category, variants,
      } as ProductGroup,
      variants,
    }
  }, [sheetProductId, variantsByProduct])

  const activeFiltersCount = [
    filterGender !== 'All', filterService !== 'all'
  ].filter(Boolean).length

  const clearFilters = () => {
    setSearch(''); setFilterGender('All'); setFilterService('all')
  }

  // ── Category rail: tap-to-jump + scroll-spy ──────────────────────────────
  // The page scrolls the document (the create-flow stepper is sticky above),
  // so the spy watches window scroll: the last section whose top has passed
  // the header threshold is the active one. A short lock after tap-to-jump
  // stops the spy from flickering through categories mid smooth-scroll.
  const sectionRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const spyLockUntil  = useRef(0)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    setActiveCategory(prev =>
      prev && groupedByCategory.has(prev) ? prev : (groupedByCategory.keys().next().value ?? null))
  }, [groupedByCategory])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (Date.now() < spyLockUntil.current) return
        let current: string | null = null
        for (const [cat, el] of sectionRefs.current) {
          if (!el.isConnected) continue
          if (el.getBoundingClientRect().top <= 170) current = cat
        }
        if (current) setActiveCategory(current)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const jumpToCategory = (cat: string) => {
    const el = sectionRefs.current.get(cat)
    if (!el) return
    setActiveCategory(cat)
    spyLockUntil.current = Date.now() + 700
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 152, behavior: 'smooth' })
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
      {/* Sticky search + filter pills — pinned just below the flow stepper */}
      <div className="sticky top-14 z-10 -mx-1 space-y-2 bg-background/95 px-1 pb-2 pt-2 backdrop-blur">
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

        {/* One horizontally-scrollable pill row: Express + gender + service */}
        <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {hasExpress && <ExpressPill active={isExpressGlobal} onToggle={onToggleExpress} />}
          {["Men's", "Women's", 'Unisex'].map(g => (
            <FilterPill key={g} label={g} active={filterGender === g}
              onClick={() => setFilterGender(prev => (prev === g ? 'All' : g))} />
          ))}
          {availableServices.map(s => (
            <FilterPill key={s.value} label={s.label} active={filterService === s.value}
              onClick={() => setFilterService(prev => (prev === s.value ? 'all' : s.value))} />
          ))}
          {(activeFiltersCount > 0 || search) && (
            <button type="button" onClick={clearFilters}
              className={cn(PILL_BASE, 'border-destructive/30 text-destructive hover:bg-destructive/5')}>
              <XIcon className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {productCount} item{productCount !== 1 ? 's' : ''} found
      </p>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">No items match your filters</p>
          <button type="button" onClick={clearFilters}
            className="mt-2 text-xs text-primary hover:underline">Clear all filters</button>
        </div>
      )}

      {/* Rail + category sections — one card per product, 2-col mobile grid */}
      <div className="flex items-start gap-2.5">
        {groupedByCategory.size > 1 && (
          <nav className="sticky top-36 max-h-[calc(100vh-10rem)] w-16 shrink-0 space-y-1 self-start overflow-y-auto rounded-xl border border-border/50 bg-card p-1.5">
            {Array.from(groupedByCategory.entries()).map(([category, groups]) => (
              <button key={category} type="button" onClick={() => jumpToCategory(category)}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors',
                  activeCategory === category ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}>
                <ProductIcon
                  src={resolveProductIconSrc(groups[0].product_type_name)}
                  fallbackEmoji={groups[0].icon}
                  alt={CATEGORY_LABELS[category] ?? category}
                  size={28}
                  className={cn('rounded-lg', activeCategory === category && 'ring-2 ring-primary/40')}
                />
                <span className={cn(
                  'line-clamp-2 text-center text-[9px] leading-tight',
                  activeCategory === category ? 'font-semibold text-primary' : 'text-muted-foreground'
                )}>
                  {CATEGORY_LABELS[category] ?? category}
                </span>
              </button>
            ))}
          </nav>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          {Array.from(groupedByCategory.entries()).map(([category, groups]) => (
            <div key={category}
              ref={el => {
                if (el) sectionRefs.current.set(category, el)
                else sectionRefs.current.delete(category)
              }}
              className="overflow-hidden rounded-2xl border border-border/50">
              <div className="bg-muted/30 px-4 py-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </span>
                <span className="ml-2 text-[10px] text-muted-foreground/60">({groups.length} item{groups.length !== 1 ? 's' : ''})</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 lg:grid-cols-4">
                {groups.map(group => (
                  <ProductCard
                    key={group.product_type_id}
                    group={group}
                    allVariants={variantsByProduct.get(group.product_type_id) ?? group.variants}
                    selections={selections}
                    isExpressGlobal={isExpressGlobal}
                    onChange={onChange}
                    onOpenSheet={setSheetProductId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Service picker sheet */}
      <AnimatePresence>
        {sheetGroup && (
          <VariantSheet
            group={sheetGroup.group}
            allVariants={sheetGroup.variants}
            selections={selections}
            isExpressGlobal={isExpressGlobal}
            onChange={onChange}
            onClose={() => setSheetProductId(null)}
          />
        )}
      </AnimatePresence>
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
        weight_kg: sel.weight_kg, unit_price: svc.price_per_kg, mrp: svc.mrp_per_kg ?? null, is_express: isExpressGlobal && svc.is_express_available,
        express_multiplier: svc.express_multiplier, line_total: Math.round(svc.price_per_kg * sel.weight_kg * m * 100) / 100,
        product_type_id: null,
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
        unit_price: product.unit_price, mrp: product.mrp ?? null, is_express: isExpressGlobal && product.is_express_available,
        express_multiplier: product.express_multiplier, line_total: Math.round(product.unit_price * sel.quantity * m * 100) / 100,
        weight_kg: 0
      })
    })
    return result
  }

  const selections = buildSelections()
  const subtotal   = selections.reduce((s, i) => s + i.line_total, 0)
  const totalItems = kgSel.size + unitSel.size

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

      {/* Express toggle for By Weight — By Piece carries it in its pill row */}
      {activeTab === 'per_kg' && kgServices.some(s => s.is_express_available) && (
        <div className="flex items-center gap-2">
          <ExpressPill active={isExpressGlobal} onToggle={() => setIsExpressGlobal(v => !v)} />
          {isExpressGlobal && <span className="text-[11px] text-muted-foreground">Faster turnaround — prices updated below</span>}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'per_kg' ? (
        <KgTab services={kgServices} selections={kgSel} isExpressGlobal={isExpressGlobal} onChange={handleKgChange} />
      ) : (
        <UnitTab products={unitProducts} selections={unitSel} isExpressGlobal={isExpressGlobal}
          onToggleExpress={() => setIsExpressGlobal(v => !v)} onChange={handleUnitChange} />
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
