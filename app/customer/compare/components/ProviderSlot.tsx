'use client'
// app/customer/compare/components/ProviderSlot.tsx
//
// One of the two comparison columns' headers. Three states: empty (a tap
// target that arms the search), loading, and filled.
//
// The empty state is a button rather than a passive placeholder because it is
// the page's primary call to action — the search bar above stays inert until
// one of these is tapped.

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Plus, X, Star, ShieldCheck, MapPin, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistance } from '@/lib/format-distance'
import type { CompareSlot, SlotId } from '../types'

interface Props {
  slotId: SlotId
  slot: CompareSlot | null
  armed: boolean
  loading: boolean
  onArm: () => void
  onClear: () => void
}

/** Slot A is the primary accent, B a contrasting one, so the two columns stay
 *  visually distinct all the way down the price table. */
const ACCENT: Record<SlotId, { ring: string; chip: string; dot: string }> = {
  a: {
    ring: 'border-primary/40',
    chip: 'bg-primary/10 text-primary',
    dot:  'bg-primary',
  },
  b: {
    ring: 'border-violet-400/50 dark:border-violet-500/40',
    chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    dot:  'bg-violet-500',
  },
}

export function ProviderSlot({ slotId, slot, armed, loading, onArm, onClear }: Props) {
  const accent = ACCENT[slotId]
  const label = slotId === 'a' ? '1' : '2'

  if (loading) {
    return (
      <div className="flex min-h-[9.5rem] flex-col items-center justify-center rounded-2xl border border-border/60 bg-card p-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="mt-2 text-xs text-muted-foreground">Loading rates…</p>
      </div>
    )
  }

  if (!slot) {
    return (
      <motion.button
        type="button"
        onClick={onArm}
        whileTap={{ scale: 0.98 }}
        animate={armed ? { scale: [1, 1.015, 1] } : { scale: 1 }}
        transition={armed ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        className={cn(
          'flex min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-colors',
          armed
            ? cn(accent.ring, 'bg-primary/5')
            : 'border-border hover:border-primary/40 hover:bg-muted/40'
        )}
      >
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', accent.chip)}>
          <Plus className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-foreground">
          {armed ? 'Now pick a provider' : `Add provider ${label}`}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {armed ? 'Choose from the list above' : 'Tap to search your area'}
        </span>
      </motion.button>
    )
  }

  const p = slot.provider
  const itemCount = slot.services.reduce((n, s) => n + s.product_types.length, 0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className={cn('relative flex min-h-[9.5rem] flex-col rounded-2xl border bg-card p-3.5 shadow-sm sm:p-4', accent.ring)}
    >
      <button
        type="button" onClick={onClear} aria-label={`Remove provider ${label}`}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-2.5 pr-6">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold', accent.chip)}>
          {p.business_name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{p.business_name}</p>
          {(p.service_area || p.city) && (
            <p className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{p.service_area || p.city}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {Number(p.rating) > 0 && (
          <span className="flex items-center gap-0.5 font-medium text-foreground">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {Number(p.rating).toFixed(1)}
            {p.rating_count > 0 && <span className="font-normal">({p.rating_count})</span>}
          </span>
        )}
        {p.distance_km != null && <span>{formatDistance(p.distance_km)}</span>}
        {p.is_verified && (
          <span className="flex items-center gap-0.5 text-green-600">
            <ShieldCheck className="h-3 w-3" /> Verified
          </span>
        )}
      </div>

      <div className="mt-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
        {itemCount} item{itemCount !== 1 ? 's' : ''} priced
        {p.min_price_kg != null && <> · from ₹{Math.round(p.min_price_kg)}/kg</>}
      </div>

      <Link
        href={`/customer/orders/create?provider=${p.id}`}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        Order from here <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </motion.div>
  )
}
