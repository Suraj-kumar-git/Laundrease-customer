// components/orders/MeasurementSummary.tsx
//
// How a dimension-priced item's price was arrived at.
//
// "₹1,350" on a carpet is the one line on an order nobody can check by eye.
// It only means something next to "9 ft × 6 ft = 54 sq ft at ₹25". So every
// screen that shows order items shows this, in the same shape, from the same
// component — a customer querying a charge and the agent answering them should
// be reading the identical thing.
//
// Read-only everywhere. The measurement is taken once, by the delivery partner,
// with the customer present. Nothing downstream gets to revise it.

export interface MeasurementSection {
  shape:       'rectangle' | 'circle'
  length_ft:   string | number | null
  width_ft:    string | number | null
  diameter_ft: string | number | null
  area_sqft:   string | number | null
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** "9 × 6 ft" or "⌀ 8 ft" — how the section was actually measured. */
function describe(sec: MeasurementSection): string {
  if (sec.shape === 'circle') {
    const d = num(sec.diameter_ft)
    return d == null ? 'circle' : `⌀ ${d} ft`
  }
  const l = num(sec.length_ft)
  const w = num(sec.width_ft)
  return l == null || w == null ? 'rectangle' : `${l} × ${w} ft`
}

export function MeasurementSummary({
  sections, areaSqft, ratePerSqft, className = '',
}: Readonly<{
  sections:     MeasurementSection[] | null | undefined
  areaSqft:     string | number | null
  /** Combined per-sq-ft rate across this item's services, when known. */
  ratePerSqft?: number | null
  className?:   string
}>) {
  const area = num(areaSqft)
  const list = sections ?? []

  // Not measured yet. Saying so beats an empty space that reads as "free".
  if (area == null || area <= 0) {
    return (
      <p className={`text-[11px] text-muted-foreground ${className}`}>
        Priced by size — measured by the delivery partner at pickup.
      </p>
    )
  }

  return (
    <div className={`rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
        {list.map((sec, i) => (
          <span key={i} className="text-muted-foreground">
            {describe(sec)}
            {num(sec.area_sqft) != null && (
              <span className="text-foreground"> = {num(sec.area_sqft)!.toFixed(2)} sq ft</span>
            )}
            {i < list.length - 1 && <span className="mx-1 text-muted-foreground">+</span>}
          </span>
        ))}
      </div>

      <div className="mt-1 border-t border-border/50 pt-1 text-[11px]">
        <span className="text-muted-foreground">
          {list.length > 1 ? 'Total measured ' : 'Measured '}
        </span>
        <span className="font-semibold text-foreground">{area.toFixed(2)} sq ft</span>
        {ratePerSqft != null && ratePerSqft > 0 && (
          <>
            <span className="text-muted-foreground"> × ₹{ratePerSqft}/sq ft = </span>
            <span className="font-semibold text-foreground">
              ₹{(Math.round(area * ratePerSqft * 100) / 100).toFixed(2)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
