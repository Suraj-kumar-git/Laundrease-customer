'use client'
// app/customer/pricing-calculator/components/ProviderPicker.tsx
// Shown after an area (or saved address) resolves to one or more providers —
// lets the visitor pick a specific provider to see that provider's exact
// rates, or (when allowed) skip straight to platform base rates for the area.

import { ArrowLeft, Loader2, MapPin, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PickableProvider {
  id: number
  name: string
  subtitle: string
  rating: number
  ratingCount: number
  minPriceKg: number | null
}

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

export function ProviderPicker({
  providers, loading, allowSkip, searchedArea, onSelect, onSkip, onBack,
}: {
  providers: PickableProvider[]
  loading: boolean
  allowSkip: boolean
  /** Pincode or city that produced this list, echoed back so the results
   *  aren't detached from what was actually searched. */
  searchedArea?: string
  onSelect: (providerId: number) => void
  onSkip?: () => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-2">
        <button onClick={onBack} aria-label="Back"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">
            Choose a provider
            {!loading && providers.length > 0 && (
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                ({providers.length})
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            See their exact rates instead of platform base pricing
            {searchedArea && (
              <> · showing results for <span className="font-medium text-foreground">{searchedArea}</span></>
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card py-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No providers found here yet.</p>
        </div>
      ) : (
        // Was a single stacked column, which wasted most of the width on
        // anything wider than a phone. Cards flow into 2/3 columns instead,
        // and each is a full-height flex column so the price line sits on a
        // consistent baseline no matter how long the address wraps.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex h-full flex-col rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{p.name}</p>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Star className="h-3 w-3 fill-current" /> {p.rating?.toFixed(1) ?? '—'}
                </span>
              </div>

              {p.subtitle && (
                <p className="mt-1 flex flex-1 items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">{p.subtitle}</span>
                </p>
              )}

              {p.minPriceKg !== null && (
                <p className="mt-2 border-t border-border/50 pt-2 text-xs font-medium text-primary">
                  Starting {formatINR(p.minPriceKg)}/kg
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {allowSkip && onSkip && (
        <button
          onClick={onSkip}
          className={cn(
            // Capped + centred: the container is now max-w-5xl for the card
            // grid, and a full-width secondary action at that size reads as
            // more important than the provider cards above it.
            'mx-auto mt-5 block w-full max-w-md rounded-xl border border-border/50 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted'
          )}
        >
          Skip — show platform base rates for this area instead
        </button>
      )}
    </div>
  )
}
