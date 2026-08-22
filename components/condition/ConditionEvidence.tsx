'use client'
// components/condition/ConditionEvidence.tsx
//
// Read-only view of what the delivery partner recorded at pickup. Shared by
// every persona that judges or reads a claim — provider, support, admin — and
// by the customer on their own order.
//
// The three states matter as much as the photos:
//
//   photos          — damage that was already there before the laundry saw it
//   inspected, none — the partner looked and found nothing
//   not inspected   — nobody looked
//
// The last two are easy to collapse into "no photos", and doing so would be a
// real error in a dispute: "inspected, nothing wrong" is evidence the damage
// happened later, while "nobody looked" is no evidence at all. They must never
// render the same way.

import { Camera, CheckCircle2, AlertTriangle } from 'lucide-react'
import { DAMAGE_TYPE_LABELS, type ConditionPhoto } from '@/lib/condition-photo-types'

interface Props {
  photos:         ConditionPhoto[]
  /** Whole-consignment shots, when the caller has them. */
  generalPhotos?: ConditionPhoto[]
  /** orders.pickup_condition_checked_at — null means no inspection recorded. */
  checkedAt:      string | null
  /** Changes the copy only: is this about one garment or the whole order? */
  scope:          'item' | 'order'
  className?:     string
}

export function ConditionEvidence({
  photos, generalPhotos = [], checkedAt, scope, className,
}: Readonly<Props>) {
  const hasAny = photos.length > 0 || generalPhotos.length > 0

  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Camera className="h-3 w-3"/> Condition at pickup
      </p>

      {hasAny ? (
        <div className="space-y-3">
          {photos.length > 0 && (
            <PhotoGrid
              photos={photos}
              caption={scope === 'item'
                ? 'Photographed by the delivery partner when collecting this item'
                : 'Photographed by the delivery partner at pickup'}
            />
          )}

          {generalPhotos.length > 0 && (
            <PhotoGrid
              photos={generalPhotos}
              caption="Whole consignment — not tied to one garment"
            />
          )}
        </div>
      ) : checkedAt ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>
          <p className="text-xs text-emerald-800 dark:text-emerald-300">
            The delivery partner inspected {scope === 'item' ? 'this item' : 'these items'} at
            pickup and recorded no damage.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"/>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            No pickup inspection was recorded for this order — absence of photos here
            does not mean the {scope === 'item' ? 'item' : 'items'} were undamaged.
          </p>
        </div>
      )}
    </div>
  )
}

function PhotoGrid({ photos, caption }: Readonly<{ photos: ConditionPhoto[]; caption: string }>) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map(photo => (
          <div key={photo.id}>
            {photo.url ? (
              <a href={photo.url} target="_blank" rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg border border-amber-300 transition-opacity hover:opacity-80 dark:border-amber-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={DAMAGE_TYPE_LABELS[photo.damage_type] ?? 'Condition at pickup'}
                  className="h-full w-full object-cover"/>
              </a>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-muted text-[9px] text-muted-foreground">
                unavailable
              </div>
            )}
            {photo.item_label && (
              <p className="mt-1 truncate text-[9px] font-semibold text-foreground" title={photo.item_label}>
                {photo.item_label}
              </p>
            )}
            <p className={`text-[9px] font-semibold text-amber-700 dark:text-amber-500 ${photo.item_label ? '' : 'mt-1'}`}>
              {DAMAGE_TYPE_LABELS[photo.damage_type] ?? photo.damage_type}
            </p>
            {photo.note && (
              <p className="text-[9px] leading-tight text-muted-foreground">{photo.note}</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">{caption}</p>
    </div>
  )
}
