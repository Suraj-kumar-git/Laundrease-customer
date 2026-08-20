'use client'
// components/nav/use-nav-accordion.ts
//
// Open/closed state for a grouped sidebar, shared by the admin and support
// apps (and their mobile drawers) so no two of them disagree about what is
// expanded.
//
// The stored map holds only groups the user has explicitly toggled. Anything
// absent falls back to "open if it contains the current page", which means a
// fresh session shows exactly one expanded group — the one you are in — with
// no stored state required. Deriving the default rather than seeding it also
// keeps the first server render and the first client render identical, so
// there is no hydration mismatch to paper over.
//
// The caller resolves which group is active, because only it knows how its
// own routes map to groups. This hook is just the memory.

import { useCallback, useEffect, useState } from 'react'

export function useNavAccordion(activeGroup: string | null, storageKey: string) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated]   = useState(false)

  // Loaded once on mount, after the first paint, so SSR and the initial
  // client render agree.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') setOverrides(parsed)
      }
    } catch { /* private mode, quota, corrupt JSON — defaults are fine */ }
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(overrides))
    } catch { /* non-fatal: the accordion just won't persist */ }
  }, [overrides, hydrated, storageKey])

  // Navigating into a group reveals it, even if it was collapsed earlier.
  // Keyed on the active group only, so collapsing the group you are currently
  // in stays collapsed until you navigate — an explicit close is not
  // immediately undone.
  useEffect(() => {
    if (!activeGroup) return
    setOverrides(prev => (prev[activeGroup] === false ? { ...prev, [activeGroup]: true } : prev))
  }, [activeGroup])

  const isOpen = useCallback(
    (title: string) => overrides[title] ?? (activeGroup === title),
    [overrides, activeGroup]
  )

  const toggle = useCallback(
    (title: string) => setOverrides(prev => ({
      ...prev,
      [title]: !(prev[title] ?? (activeGroup === title)),
    })),
    [activeGroup]
  )

  return { isOpen, toggle }
}
