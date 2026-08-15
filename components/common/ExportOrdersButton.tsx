'use client'
// components/common/ExportOrdersButton.tsx
//
// "Download Excel" for the Orders tab, shared by the admin, support and
// laundry personas so the three can't drift apart.
//
// The export endpoint REQUIRES a from/to range (an unbounded export is how you
// time out a serverless function), and the laundry Orders tab has no date
// filter at all — so the range is always collected here rather than read off
// the page. Whatever filters are already applied on the tab ride along via
// buildFilters(), so the sheet matches the screen.

import { useState } from 'react'
import { Download, Loader2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

function isoDay(d: Date): string {
  // Local calendar day, not UTC — toISOString() would roll back a day for any
  // IST time before 05:30.
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function ExportOrdersButton({
  endpoint,
  buildFilters,
  initialFrom,
  initialTo,
  className,
}: {
  /** e.g. '/api/admin/orders/export' */
  endpoint: string
  /** Currently-applied tab filters (everything except from/to). */
  buildFilters: () => Record<string, string>
  /** Prefill, when the tab already has a date filter set. */
  initialFrom?: string
  initialTo?: string
  className?: string
}) {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [open,    setOpen]    = useState(false)
  const [from,    setFrom]    = useState(initialFrom || isoDay(monthStart))
  const [to,      setTo]      = useState(initialTo   || isoDay(today))
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')

  const rangeInvalid = !from || !to || from > to

  async function handleDownload() {
    if (rangeInvalid || busy) return
    setBusy(true); setError('')
    try {
      const p = new URLSearchParams({ ...buildFilters(), from, to })
      const res = await fetch(`${endpoint}?${p}`, { credentials: 'include' })

      if (!res.ok) {
        // The route returns the normal JSON envelope for validation failures
        // (bad range, over the row cap) — surface that text rather than a
        // generic message, since "narrow your date range" is actionable.
        let msg = 'Could not generate the export'
        try { const j = await res.json(); msg = j?.error || msg } catch {}
        setError(msg)
        return
      }

      const blob = await res.blob()
      // Prefer the server's filename so it stays consistent with the sheet's
      // own header; fall back if the header is stripped by a proxy.
      const cd = res.headers.get('content-disposition') || ''
      const match = /filename="?([^"]+)"?/.exec(cd)
      const filename = match?.[1] || `Orders_${from}_to_${to}.xlsx`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch {
      setError('Network error — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setError('') }}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Download Excel</span>
        <span className="sm:hidden">Excel</span>
      </button>

      {open && (
        <>
          {/* Click-away layer, below the panel so the panel stays interactive */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div className="absolute right-0 z-40 mt-2 w-[19rem] rounded-2xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Download orders</h4>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              Exports orders <strong className="text-foreground">placed</strong> in this range,
              with the filters currently applied on this tab.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">From</span>
                <input type="date" value={from} max={to || undefined}
                  onChange={e => { setFrom(e.target.value); setError('') }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">To</span>
                <input type="date" value={to} min={from || undefined}
                  onChange={e => { setTo(e.target.value); setError('') }}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </label>
            </div>

            {rangeInvalid && from && to && (
              <p className="mt-2 text-[11px] text-destructive">The From date must be on or before the To date.</p>
            )}

            {error && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleDownload}
              disabled={rangeInvalid || busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</>
                : <><Download className="h-4 w-4" /> Download .xlsx</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
