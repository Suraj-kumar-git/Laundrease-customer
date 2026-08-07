'use client'

// components/common/SortableTh.tsx
//
// Clickable column header + the hook backing it, for the admin/support list
// tables. Sorting is server-side (see lib/table-sort.ts for why), so this only
// owns the sort key and hands it to the page's fetch as a `sort=` param.
//
// Columns declare semantic keys rather than raw column names — the same
// vocabulary the API whitelists ('newest'/'oldest', 'amount_high'/'amount_low')
// — so nothing the user can click ever becomes SQL.

import { useCallback, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

export interface SortKeys {
  /** Sort key for descending order (first click). */
  desc: string
  /** Sort key for ascending order (second click). */
  asc: string
}

export interface TableSortState {
  /** Current key, or '' while on the route's default ordering. */
  sort: string
  /** Appends `sort=` only when a column is actively selected. */
  sortParam: string
  /**
   * Cycles a column: unsorted → desc → asc → back to the route default, so
   * there's always a way back to the triage ordering the page opens with.
   */
  toggle: (keys: SortKeys) => void
}

export function useTableSort(onChange?: () => void): TableSortState {
  const [sort, setSort] = useState('')

  const toggle = useCallback((keys: SortKeys) => {
    setSort(prev => (prev === keys.desc ? keys.asc : prev === keys.asc ? '' : keys.desc))
    onChange?.()
  }, [onChange])

  return {
    sort,
    sortParam: sort ? `&sort=${encodeURIComponent(sort)}` : '',
    toggle,
  }
}

export function SortableTh({
  label, keys, state, align = 'left', className = '', thClassName,
}: {
  label: string
  keys: SortKeys
  state: TableSortState
  align?: 'left' | 'right'
  /** Extra classes appended to the default <th> styling (e.g. responsive hiding). */
  className?: string
  /**
   * Replaces the default <th> styling outright — for tables that use a
   * different header treatment (e.g. the uppercase 10px headers on the
   * delivery-partners list) so sortable columns don't stand out.
   */
  thClassName?: string
}) {
  const active = state.sort === keys.desc ? 'desc' : state.sort === keys.asc ? 'asc' : null
  const Icon = active === 'desc' ? ArrowDown : active === 'asc' ? ArrowUp : ChevronsUpDown

  return (
    <th className={thClassName ?? `text-${align} text-xs font-medium px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => state.toggle(keys)}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground
          ${align === 'right' ? 'flex-row-reverse' : ''}
          ${active ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
      >
        {label}
        <Icon className={`w-3 h-3 shrink-0 ${active ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
  )
}
