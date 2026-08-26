// lib/provider-label.ts
//
// Naming a provider when several of them are the same business.
//
// A multi-branch provider appears once per branch, each with its own distance,
// delivery fee, rating and prices. Three cards reading "Fresh Clean Services"
// are indistinguishable, and picking the wrong one means a different shop, a
// different price and a different pickup.
//
// But the branch is not always worth showing. `branch_name` was backfilled
// from the city in scripts/64, so a single-branch provider would read
// "Fresh Clean Services · Pune" for no reason at all. Two rules, then, and
// which one applies depends on whether the surface can be ambiguous:
//
//   ON COLLISION   a list, where the label is only needed when two rows share
//                  a business name. Nothing else changes.
//   ALWAYS         a comparison, where the two things being held side by side
//                  are chosen deliberately and identical headers would make
//                  the whole view unreadable.

export interface LabelledProvider {
  business_name: string
  branch_name?:  string | null
}

/**
 * Business names appearing more than once in this list — exactly the ones that
 * need disambiguating.
 */
export function duplicateBusinessNames(providers: readonly LabelledProvider[]): Set<string> {
  const counts = new Map<string, number>()
  for (const p of providers) {
    counts.set(p.business_name, (counts.get(p.business_name) ?? 0) + 1)
  }
  return new Set(
    [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name)
  )
}

/**
 * The branch suffix, or null when it should not be shown.
 *
 * Pass `duplicates` for the on-collision rule; omit it (or pass `always`) where
 * the branch must always be visible.
 */
export function branchSuffix(
  provider: LabelledProvider,
  opts: { duplicates?: Set<string>; always?: boolean } = {},
): string | null {
  if (!provider.branch_name) return null
  if (opts.always) return provider.branch_name
  if (opts.duplicates && !opts.duplicates.has(provider.business_name)) return null
  if (!opts.duplicates && !opts.always) return null
  return provider.branch_name
}

/** The full name as one string, for titles and plain-text contexts. */
export function providerLabel(
  provider: LabelledProvider,
  opts: { duplicates?: Set<string>; always?: boolean } = {},
): string {
  const suffix = branchSuffix(provider, opts)
  return suffix ? `${provider.business_name} · ${suffix}` : provider.business_name
}
