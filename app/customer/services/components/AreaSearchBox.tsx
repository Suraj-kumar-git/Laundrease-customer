'use client'
// app/customer/services/components/AreaSearchBox.tsx
//
// Area search for the public services page. If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// is configured, shows live Places predictions as the visitor types (biased
// towards their current location when available) and resolves the chosen
// place to lat/lng for a radius-based provider search. Without that key, it
// gracefully degrades to a plain text box that searches by city/pincode.

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search, LocateFixed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadScript } from '@/lib/payment-client'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export interface AreaSelection {
  label: string
  lat: number
  lng: number
}

interface AreaSearchBoxProps {
  loading?: boolean
  onAreaSelected: (area: AreaSelection) => void
  onFreeTextSearch: (text: string) => void
}

declare global {
  interface Window {
    google?: any
  }
}

export function AreaSearchBox({ loading, onAreaSelected, onFreeTextSearch }: AreaSearchBoxProps) {
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

  // Load Google Maps (places) only if a publishable key is configured.
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

  // Best-effort silent geolocation, used only to bias autocomplete results —
  // never blocks typing or shows a permission nag on its own.
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
    if (!geocoder.current) return
    setResolving(true)
    geocoder.current.geocode({ placeId: p.place_id }, (results: any[] | null, status: string) => {
      setResolving(false)
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location
        onAreaSelected({ label: p.description, lat: loc.lat(), lng: loc.lng() })
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
        onAreaSelected({ label: 'Current location', lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => setResolving(false),
      { timeout: 8000 }
    )
  }

  function handleSubmit() {
    if (!query.trim()) return
    setShowDropdown(false)
    onFreeTextSearch(query.trim())
  }

  const busy = loading || resolving

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-lg">
      <div className="flex items-center gap-1.5 rounded-xl bg-white p-1.5 shadow-lg dark:bg-gray-800">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="Search your area or pincode"
            className="w-full rounded-lg border-2 border-transparent bg-gray-50 py-2.5 pl-9 pr-2 text-sm transition-all focus:border-violet-500 focus:outline-none dark:bg-gray-700 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          aria-label="Search"
          className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2.5 text-white transition-all hover:shadow-md disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </div>

      {mapsReady && (
        <button
          type="button"
          onClick={useMyLocation}
          disabled={busy}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/90 hover:text-white hover:underline disabled:opacity-50"
        >
          <LocateFixed className="h-3 w-3" /> Use my current location
        </button>
      )}

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800">
          {predictions.map(p => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => selectPrediction(p)}
              className={cn(
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors',
                'hover:bg-violet-50 dark:hover:bg-gray-700'
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span className="truncate text-gray-800 dark:text-gray-100">{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
