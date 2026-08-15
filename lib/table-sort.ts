// lib/table-sort.ts
//
// Shared, injection-safe ORDER BY builder for the admin/support list tables.
//
// Every list endpoint paginates with LIMIT/OFFSET, so sorting has to happen in
// SQL — reordering client-side would only shuffle the current page. That means
// the sort key arrives from the URL, and raw user input must never reach the
// query. So each route declares a whitelist of `key -> ORDER BY fragment` and
// anything unrecognised silently falls back to the route's default.
//
// Generalises the pattern that already existed inline in
// app/api/admin/support/route.ts (newest/oldest/priority/sla).

export interface SortSpec {
  /** Whitelisted sort key → SQL ORDER BY fragment. Keys come from the URL. */
  columns: Record<string, string>
  /** Used when the request specifies no key, or one that isn't whitelisted. */
  defaultKey: string
  /**
   * Ordering applied BEFORE the sort fragment on the DEFAULT view only — this
   * is how queues float rows that need action (pending approvals, SLA
   * breaches, flagged reviews) to the top. Once someone explicitly clicks a
   * column they want that column to win outright, so the prefix is dropped.
   */
  triagePrefix?: string
  /**
   * Unique, always-appended final key (e.g. 'o.id DESC'). Without one, rows
   * that tie on the sort column can swap places between requests and appear
   * twice — or not at all — across LIMIT/OFFSET page boundaries.
   */
  tiebreaker?: string
}

/**
 * Resolves a URL sort key into a safe ORDER BY body (no 'ORDER BY' keyword).
 * Returns the default ordering for unknown/absent keys rather than throwing —
 * a stale bookmarked sort param should degrade, not error.
 */
export function buildOrderBy(sort: string | null | undefined, spec: SortSpec): string {
  const explicit = sort && Object.prototype.hasOwnProperty.call(spec.columns, sort)
    ? sort
    : null

  const fragment = spec.columns[explicit ?? spec.defaultKey] ?? spec.columns[spec.defaultKey]

  const parts: string[] = []
  if (!explicit && spec.triagePrefix) parts.push(spec.triagePrefix)
  parts.push(fragment)
  if (spec.tiebreaker) parts.push(spec.tiebreaker)

  return parts.join(', ')
}

/** True when the request is on the route's default (triage) ordering. */
export function isDefaultSort(sort: string | null | undefined, spec: SortSpec): boolean {
  return !(sort && Object.prototype.hasOwnProperty.call(spec.columns, sort))
}
