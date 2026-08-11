'use client'
// app/customer/compare/components/AreaProviderSearch.tsx
//
// The single global search bar for the comparison page. It is deliberately
// INERT until the visitor arms a slot by tapping one of the compare cards —
// that is what makes the two cards, rather than the search box, the thing you
// interact with first, and it removes the "searched, now what?" dead end where
// results have nowhere to go.
//
// Area resolution mirrors the public services page (AreaSearchBox): live
// Google Places predictions when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set,
// degrading to a plain city/pincode text search when it isn't, so the page
// keeps working without the key.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, MapPin, Search, LocateFixed, Star, ShieldCheck, X, Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadScript } from '@/lib/payment-client'
import { formatDistance } from '@/lib/format-distance'
import type { CompareProvider } from '../types'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

declare global {
  interface Window { google?: any }
}

interface Props {
  /** Which slot is waiting to be filled. null = search is dormant. */
  armed: 'a' | 'b' | null
  areaLabel: string | null
  providers: CompareProvider[]
  loadingProviders: boolean
  searched: boolean
  /** Already-picked provider ids — shown as "Selected" and not re-pickable. */
  takenIds: number[]
  onAreaResolved: (label: string, coords: { lat: number; lng: number } | null) => void
  onPickProvider: (p: CompareProvider) => void
  onClearArea: () => void
  onCancelArming: () => void
}

export function AreaProviderSearch({
  armed, areaLabel, providers, loadingProviders, searched, takenIds,
  onAreaResolved, onPickProvider, onClearArea, onCancelArming,
}: Props) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<{ place_id: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [mapsReady, setMapsReady] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)

  const autocompleteService = useRef<any>(null)
  const geocoder = useRef<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!MAPS_KEY) return
    loadScript(`https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`)
      .then(() => {
        if (!window.google?.maps?.places) return
        autocompleteService.current = new window.google.maps.places.AutocompleteService()
        geocoder.current = new window.google.maps.Geocoder()
        setMapsReady(true)
      })
      .catch(() => setMapsReady(false))
  }, [])

  // Silent, best-effort — only biases predictions, never nags for permission.
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 4000 }
    )
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // The literal "cursor starts blinking in the search box" behaviour — arming a
  // slot moves focus here, so the next keystroke lands in the right place with
  // no second tap.
  useEffect(() => {
    if (armed && !areaLabel) inputRef.current?.focus()
  }, [armed, areaLabel])

  function handleChange(value: string) {
    setQuery(value)
    if (!mapsReady || !autocompleteService.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setPredictions([]); return }

    debounceRef.current = setTimeout(() => {
      const request: any = {
        input: value,
        componentRestrictions: { country: 'in' },
        types: ['geocode'],
      }
      if (userCoords) {
        request.location = new window.google.maps.LatLng(userCoords.lat, userCoords.lng)
        request.radius = 50000
      }
      autocompleteService.current.getPlacePredictions(request, (results: any[] | null) => {
        setPredictions(results?.map(r => ({ place_id: r.place_id, description: r.description })) ?? [])
        setShowDropdown(true)
      })
    }, 250)
  }

  function selectPrediction(p: { place_id: string; description: string }) {
    setQuery(p.description)
    setShowDropdown(false)
    if (!geocoder.current) { onAreaResolved(p.description, null); return }
    setResolving(true)
    geocoder.current.geocode({ placeId: p.place_id }, (results: any[] | null, status: string) => {
      setResolving(false)
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location
        onAreaResolved(p.description, { lat: loc.lat(), lng: loc.lng() })
      } else {
        onAreaResolved(p.description, null)
      }
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setResolving(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setResolving(false)
        setQuery('Current location')
        onAreaResolved('Current location', { lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => setResolving(false),
      { timeout: 8000 }
    )
  }

  function handleSubmit() {
    if (!query.trim()) return
    setShowDropdown(false)
    onAreaResolved(query.trim(), null)
  }

  function clearArea() {
    setQuery('')
    setPredictions([])
    onClearArea()
  }

  const busy = resolving || loadingProviders
  const dormant = !armed
  // Once an area is locked in, the input is read-only: re-searching is an
  // explicit "Change area" action, so a stray click can't silently drop the
  // provider list out from under a half-finished comparison.
  const locked = !!areaLabel

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-2xl">
      <motion.div
        animate={dormant ? {} : { boxShadow: [
          '0 0 0 0px rgba(37,99,235,0.35)',
          '0 0 0 6px rgba(37,99,235,0)',
        ] }}
        transition={dormant ? {} : { duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        className={cn(
          'flex items-center gap-1.5 rounded-2xl border bg-card p-1.5 transition-colors',
          dormant ? 'border-border/60 opacity-70' : 'border-primary/50 shadow-sm'
        )}
      >
        <div className="relative flex-1">
          <MapPin className={cn(
            'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
            dormant ? 'text-muted-foreground/50' : 'text-primary'
          )} />
          <input
            ref={inputRef}
            type="text"
            value={locked ? areaLabel! : query}
            readOnly={locked}
            disabled={dormant && !locked}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => !locked && predictions.length > 0 && setShowDropdown(true)}
            onKeyDown={e => e.key === 'Enter' && !locked && handleSubmit()}
            placeholder={dormant ? 'Pick a card below to start comparing' : 'Enter your area or pincode'}
            className={cn(
              'w-full rounded-xl border-2 border-transparent bg-muted/50 py-2.5 pl-9 pr-2 text-sm text-foreground',
              'placeholder:text-muted-foreground focus:border-primary focus:outline-none',
              'disabled:cursor-not-allowed',
              locked && 'font-medium'
            )}
          />
        </div>

        {locked ? (
          <button
            type="button" onClick={clearArea}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Change area</span>
          </button>
        ) : (
          <button
            type="button" onClick={handleSubmit} disabled={dormant || busy} aria-label="Search"
            className="flex shrink-0 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground transition-all hover:shadow-md disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        )}
      </motion.div>

      {mapsReady && !locked && !dormant && (
        <button
          type="button" onClick={useMyLocation} disabled={busy}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"
        >
          <LocateFixed className="h-3.5 w-3.5" /> Use my current location
        </button>
      )}

      {/* Places predictions */}
      <AnimatePresence>
        {showDropdown && predictions.length > 0 && !locked && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
          >
            {predictions.map(p => (
              <li key={p.place_id}>
                <button
                  type="button" onClick={() => selectPrediction(p)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-foreground">{p.description}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Provider results */}
      <AnimatePresence>
        {armed && locked && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="mt-4 rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {loadingProviders
                  ? 'Finding providers…'
                  : `Choose a provider for slot ${armed === 'a' ? '1' : '2'}`}
              </p>
              <button
                type="button" onClick={onCancelArming}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            {loadingProviders ? (
              <div className="space-y-2 p-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : providers.length === 0 && searched ? (
              <div className="px-3 py-8 text-center">
                <Store className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No providers serving this area yet.</p>
              </div>
            ) : (
              <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto">
                {providers.map((p, i) => {
                  const taken = takenIds.includes(p.id)
                  return (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.03 }}
                    >
                      <button
                        type="button"
                        onClick={() => !taken && onPickProvider(p)}
                        disabled={taken}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          taken
                            ? 'cursor-not-allowed border-border/40 bg-muted/40 opacity-60'
                            : 'border-border/60 hover:border-primary/50 hover:bg-primary/5'
                        )}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                          {p.business_name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{p.business_name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            {Number(p.rating) > 0 && (
                              <span className="flex items-center gap-0.5 font-medium text-foreground">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {Number(p.rating).toFixed(1)}
                              </span>
                            )}
                            {p.distance_km != null && <span>{formatDistance(p.distance_km)}</span>}
                            {p.is_verified && (
                              <span className="flex items-center gap-0.5 text-green-600">
                                <ShieldCheck className="h-3 w-3" /> Verified
                              </span>
                            )}
                          </div>
                        </div>
                        {taken && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            Selected
                          </span>
                        )}
                      </button>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
