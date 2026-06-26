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
  providers, loading, allowSkip, onSelect, onSkip, onBack,
}: {
  providers: PickableProvider[]
  loading: boolean
  allowSkip: boolean
  onSelect: (providerId: number) => void
  onSkip?: () => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="font-semibold text-foreground">Choose a provider</h2>
          <p className="text-xs text-muted-foreground">See their exact rates instead of platform base pricing</p>
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
        <div className="space-y-2.5">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                {p.subtitle && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" /> {p.subtitle}
                  </p>
                )}
                {p.minPriceKg !== null && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    Starting {formatINR(p.minPriceKg)}/kg
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <Star className="h-3 w-3 fill-current" /> {p.rating?.toFixed(1) ?? '—'}
              </div>
            </button>
          ))}
        </div>
      )}

      {allowSkip && onSkip && (
        <button
          onClick={onSkip}
          className={cn(
            'mt-4 w-full rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted'
          )}
        >
          Skip — show platform base rates for this area instead
        </button>
      )}
    </div>
  )
}
