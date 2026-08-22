'use client'
// components/provider/ProviderPricingPanel.tsx
//
// Assisted editing of one provider's pricing matrix, shared by the admin and
// support provider-detail pages. Only `apiBase` and `canWrite` differ between
// them — the grid, the validation and the interaction are identical.
//
// It deliberately mirrors the provider's own Pricing Matrix
// (app/laundry/(dashboard)/services/page.tsx): same cell popover, same
// MRP → discount% → price flow, same "blue means a custom price" convention.
// The point of this screen is an operator walking a provider through their own
// app over the phone; two different-looking grids would defeat that.
//
// What it must never do: touch the platform-wide grid. Every write here is
// scoped to this one provider (provider_product_service_prices). Clearing a
// cell deletes that provider's row so it falls back to the platform default.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, Info, Check, X, AlertCircle, RefreshCw, RotateCcw, Lock, Receipt,
} from 'lucide-react'

const CAT_LABELS: Record<string, string> = {
  everyday: 'Everyday', ethnic_formal: 'Ethnic & Formal',
  household: 'Household', specialty: 'Specialty',
}

interface ServiceCol { id: number; name: string; category: string; price_per_kg: string | null }
interface ProductRow {
  id: number; name: string; description: string | null
  pricing_model: string; display_category: string; icon: string | null; sort_order: number
}
interface Attribution { role: 'laundry' | 'admin' | 'support' | null; name: string | null; at: string }

interface MatrixData {
  services:      ServiceCol[]
  product_types: ProductRow[]
  base_prices:   Record<string, string>
  overrides:     Record<string, string>
  mrp:           Record<string, string>
  attribution:   Record<string, Attribution>
  has_gst:               boolean
  gst_inclusive_pricing: boolean
  gst_rate:              number
}

interface Props {
  /** Provider public_id, as it appears in the page URL. */
  providerId: string
  /** '/api/admin/providers' or '/api/support/providers'. */
  apiBase: string
  canWrite: boolean
}

function attributionLabel(a: Attribution | undefined): string | null {
  if (!a) return null
  const when = a.at ? new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  // Rows backfilled by migration 57 know the role but not the person.
  if (a.role === 'laundry') return `Set by the provider${when ? ` · ${when}` : ''}`
  if (a.role === 'admin' || a.role === 'support') {
    return `Set by ${a.name || 'Laundrease'}${when ? ` · ${when}` : ''}`
  }
  return when || null
}

export function ProviderPricingPanel({ providerId, apiBase, canWrite }: Props) {
  const [data,    setData]    = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState<string | null>(null)
  const [notice,  setNotice]  = useState('')

  const [editCell,     setEditCell]     = useState<string | null>(null)
  const [editPrice,    setEditPrice]    = useState('')
  const [editMrp,      setEditMrp]      = useState('')
  const [editDiscount, setEditDiscount] = useState('')
  const [search,         setSearch]         = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const popoverRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res  = await fetch(`${apiBase}/${providerId}/pricing`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to load pricing')
      setData(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [apiBase, providerId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!editCell) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setEditCell(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editCell])

  async function save(ptId: number, svcId: number, price: number | null, mrp: number | null) {
    const cellKey = `${ptId}:${svcId}`
    setSaving(cellKey); setError(''); setNotice('')
    try {
      const res = await fetch(`${apiBase}/${providerId}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product_type_id: ptId, service_id: svcId, unit_price: price, mrp }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to save price')
      setNotice(json.data?.message || 'Saved')
      // Refetch rather than patching local state: the row now carries new
      // attribution from the server, and guessing it here would show the
      // operator a different "last changed by" than the provider sees.
      await load(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  function startEdit(key: string, currentPrice: string | null, currentMrp: string | null) {
    if (!canWrite) return
    setEditCell(key)
    setEditPrice(currentPrice || '')
    setEditMrp(currentMrp || '')
    setEditDiscount(
      currentMrp && currentPrice
        ? String(Math.round((1 - parseFloat(currentPrice) / parseFloat(currentMrp)) * 100))
        : ''
    )
  }

  // MRP and discount% are input conveniences; only the selling price is stored.
  function handleMrpInput(v: string) {
    setEditMrp(v)
    if (v && editDiscount) {
      setEditPrice(String(Math.round(parseFloat(v) * (1 - parseFloat(editDiscount) / 100) * 100) / 100))
    }
  }
  function handleDiscountInput(v: string) {
    setEditDiscount(v)
    if (editMrp && v) {
      setEditPrice(String(Math.round(parseFloat(editMrp) * (1 - parseFloat(v) / 100) * 100) / 100))
    }
  }

  function commitEdit(ptId: number, svcId: number) {
    const price = editPrice === '' ? null : parseFloat(editPrice)
    const mrp   = editMrp   === '' ? null : parseFloat(editMrp)
    save(ptId, svcId, price, mrp)
    setEditCell(null)
  }

  function clearOverride(ptId: number, svcId: number) {
    save(ptId, svcId, null, null)
    setEditCell(null)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-loading h-9 rounded-lg" />)}
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" /> {error}
      </div>
    )
  }

  if (!data) return null

  if (data.services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
        <p className="text-sm font-medium text-foreground">No services enabled yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A price can only be set for a service this provider offers. Enable one on the
          <span className="font-medium text-foreground"> Services </span> tab first.
        </p>
      </div>
    )
  }

  const categories = ['all', ...Array.from(new Set(data.product_types.map(pt => pt.display_category)))]
  const filtered = data.product_types.filter(pt => {
    const matchCat    = activeCategory === 'all' || pt.display_category === activeCategory
    const matchSearch = !search || pt.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const overrideCount = Object.keys(data.overrides).length

  return (
    <div className="space-y-4">
      {/* GST context. Read-only on purpose: whether prices include GST is the
          provider's own tax decision, so an operator can see it but not flip
          it — they'd be changing what every number on this grid means. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-foreground">
          {data.has_gst ? (
            data.gst_inclusive_pricing
              ? <>Prices below <strong>include</strong> {data.gst_rate}% GST.</>
              : <>Prices below <strong>exclude</strong> GST — {data.gst_rate}% is added at checkout.</>
          ) : (
            <>This provider is not GST-registered. Prices are charged as entered.</>
          )}
        </p>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <Lock className="h-3 w-3" /> Provider-controlled
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search garment…"
            className="w-48 rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors
                ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              {cat === 'all' ? 'All categories' : CAT_LABELS[cat] || cat}
            </button>
          ))}
        </div>
        <button onClick={() => load()} disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {canWrite
          ? <span>
              Click any cell to set a price for <strong>this provider only</strong> — the platform default and
              every other provider are unaffected. Blue means a custom price; use <em>Reset to default</em> to
              remove one. The provider is notified of changes made here.
            </span>
          : <span>Read-only. Blue means the provider has a custom price; plain means the platform default.</span>}
      </p>

      {(notice || error) && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs ${
          error ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
          {error ? <AlertCircle className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0" />}
          {error || notice}
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className="sticky left-0 z-10 w-48 border-r border-border bg-background px-4 py-2.5 text-left font-medium text-muted-foreground">
                Garment / Item
              </th>
              <th className="w-16 px-3 py-2.5 text-left font-medium text-muted-foreground">Type</th>
              {data.services.map(s => (
                <th key={s.id} className="min-w-[90px] whitespace-nowrap px-3 py-2.5 text-center font-medium text-muted-foreground">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(pt => (
              <tr key={pt.id} className="hover:bg-muted/20">
                <td className="sticky left-0 z-10 border-r border-border bg-background px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span>{pt.icon}</span>
                    <span className="font-medium text-foreground">{pt.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 capitalize text-muted-foreground">
                  {pt.pricing_model === 'per_kg' ? '/kg' : '/pc'}
                </td>
                {data.services.map(s => {
                  const cellKey    = `${pt.id}:${s.id}`
                  const override   = data.overrides[cellKey] || null
                  const defaultVal = data.base_prices[cellKey] || null
                  const mrpVal     = data.mrp[cellKey] || null
                  const isEditing  = editCell === cellKey
                  const isSaving   = saving === cellKey
                  const effective  = override || defaultVal
                  const hasDiscount = mrpVal && effective && parseFloat(mrpVal) > parseFloat(effective)
                  const attr = attributionLabel(data.attribution[cellKey])

                  // No platform mapping and no override — this combination is
                  // not priced at all, so there is nothing to override.
                  if (!defaultVal && !override) {
                    return (
                      <td key={s.id} className="px-3 py-2 text-center">
                        <span className="text-[10px] text-muted-foreground">—</span>
                      </td>
                    )
                  }

                  return (
                    <td key={s.id} className="relative px-3 py-2 text-center">
                      {isSaving ? (
                        <div className="flex items-center justify-center">
                          <div className="h-3 w-3 animate-spin rounded-full border border-primary/30 border-t-primary" />
                        </div>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            onClick={() => startEdit(cellKey, override, mrpVal)}
                            title={attr ?? undefined}
                            disabled={!canWrite}
                            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors
                              ${canWrite ? 'hover:ring-1 hover:ring-primary/50' : 'cursor-default'}
                              ${override
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                : 'text-foreground hover:bg-muted'}`}
                          >
                            {hasDiscount && (
                              <span className="block text-[9px] leading-tight text-muted-foreground line-through">₹{mrpVal}</span>
                            )}
                            ₹{effective}
                          </button>

                          {isEditing && canWrite && (
                            <div ref={popoverRef}
                              className="absolute left-1/2 top-full z-20 mt-1 w-40 -translate-x-1/2 space-y-1.5 rounded-xl border border-border bg-popover p-2 text-left shadow-lg">
                              <div>
                                <label className="text-[9px] text-muted-foreground">MRP (₹)</label>
                                <input type="number" min="0" step="1" value={editMrp}
                                  onChange={e => handleMrpInput(e.target.value)} placeholder="optional"
                                  className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                              </div>
                              <div>
                                <label className="text-[9px] text-muted-foreground">Discount (%)</label>
                                <input type="number" min="0" max="95" step="1" value={editDiscount}
                                  onChange={e => handleDiscountInput(e.target.value)} disabled={!editMrp} placeholder="0"
                                  className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
                              </div>
                              <div>
                                <label className="text-[9px] text-muted-foreground">Price (₹)</label>
                                <input type="number" min="0" step="1" value={editPrice} autoFocus
                                  onChange={e => setEditPrice(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter')  commitEdit(pt.id, s.id)
                                    if (e.key === 'Escape') setEditCell(null)
                                  }}
                                  placeholder={defaultVal || '0'}
                                  className="w-full rounded border border-primary/60 bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                              </div>

                              {override && (
                                <button onClick={() => clearOverride(pt.id, s.id)}
                                  className="flex w-full items-center justify-center gap-1 rounded border border-border px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted">
                                  <RotateCcw className="h-2.5 w-2.5" /> Reset to default
                                </button>
                              )}

                              {attr && <p className="text-[9px] leading-tight text-muted-foreground">{attr}</p>}

                              <div className="flex justify-end gap-2 pt-0.5">
                                <button onClick={() => setEditCell(null)} className="text-muted-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                                <button onClick={() => commitEdit(pt.id, s.id)} className="text-primary">
                                  <Check className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {overrideCount} custom {overrideCount === 1 ? 'price' : 'prices'} set for this provider ·
        everything else uses the platform default from Service Catalog ·
        changes apply to new orders only, existing orders keep the price they were placed at.
      </p>
    </div>
  )
}
