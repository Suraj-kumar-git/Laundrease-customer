// lib/gst-pure.ts
// Pure GST math with zero server-only imports — safe to use from client
// components too (e.g. the laundry subscription tab needs to compute the
// exact same "what will this actually charge" figure the server already
// used, for a plan variant the server's response doesn't precompute).
// lib/gst.ts re-exports all of this for existing server-side call sites.

// Folds a GST rate into an amount. Used identically for both price and MRP
// so they scale the same way and the discount % stays mathematically
// consistent (e.g. 100/60 -> 118/70.80 is exactly this formula on both).
// Never mutates stored data — this is a read-time/display-time transform only.
export function applyGst(amount: number | null | undefined, rate: number): number | null {
  if (amount == null) return null
  return Math.round(amount * (1 + rate / 100) * 100) / 100
}

// ─── Subscription GST (Part 2) ───────────────────────────────────────────────

export type SubscriptionGstMode = 'inclusive' | 'exclusive'

export interface SubscriptionCharge {
  chargeAmount:  number // what the provider is actually charged at payment
  taxAmount:     number // the GST portion within/added to chargeAmount
  displayAmount: number // what the card shows as "the" price
}

// 'inclusive': the provider pays exactly basePrice — GST is treated as
// already embedded for accounting/invoice purposes (taxable value =
// basePrice / (1+rate), tax = the difference); nothing extra is charged.
// 'exclusive': the card still shows the bare basePrice, but GST is added on
// top at payment — the provider actually pays more than the sticker.
export function computeSubscriptionCharge(
  basePrice: number, mode: SubscriptionGstMode, rate: number
): SubscriptionCharge {
  if (mode === 'exclusive') {
    const chargeAmount = applyGst(basePrice, rate)!
    return { chargeAmount, taxAmount: Math.round((chargeAmount - basePrice) * 100) / 100, displayAmount: basePrice }
  }
  const taxAmount = Math.round((basePrice - basePrice / (1 + rate / 100)) * 100) / 100
  return { chargeAmount: basePrice, taxAmount, displayAmount: basePrice }
}
