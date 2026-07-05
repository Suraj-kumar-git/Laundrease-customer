'use client'
// components/common/PlaceAutocompleteInput.tsx
//
// Lightweight Google Places autocomplete text input.
//
// Uses the new google.maps.places.AutocompleteSuggestions API (required for
// API keys created after March 1 2025). Falls back to the legacy
// AutocompleteService for older keys. Place resolution uses the new
// Place.fetchFields() first, falling back to Geocoder.
//
// Two usage modes:
//   1. Service area / location picker — onPlaceSelected fires with lat/lng
//   2. Address auto-fill — onAddressComponents fires with parsed street/city/state/pincode

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { loadScript } from '@/lib/payment-client'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

declare global {
  interface Window {
    google?: any
  }
}

// Module-level singleton: all component instances share one load promise.
// Without this, a second instance mounting while the first is still loading
// would call loadScript, find the <script> tag already in the DOM, resolve
// immediately, check window.google (not ready yet) and stay in mapsReady=false.
let _mapsLoadPromise: Promise<void> | null = null

function loadMapsOnce(): Promise<void> {
  if (!MAPS_KEY) return Promise.resolve()
  if (!_mapsLoadPromise) {
    _mapsLoadPromise = (async () => {
      await loadScript(
        `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&loading=async`
      )
      // With loading=async the places library is not auto-populated on
      // window.google.maps.places — it must be explicitly imported.
      if (window.google?.maps?.importLibrary) {
        await window.google.maps.importLibrary('places')
      }
    })().catch(err => {
      _mapsLoadPromise = null
      throw err
    })
  }
  return _mapsLoadPromise
}

export interface PlaceSelection {
  label: string
  lat: number
  lng: number
}

export interface ParsedAddress {
  address_line1: string
  city: string
  state: string
  postal_code: string
}

export interface PlaceAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  onPlaceSelected?: (place: PlaceSelection) => void
  onAddressComponents?: (parsed: ParsedAddress) => void
  placeholder?: string
  className?: string
  types?: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchSuggestions(
  input: string,
  types: string[]
): Promise<{ place_id: string; description: string }[]> {
  const places = window.google?.maps?.places

  // New API (available for all keys, required for keys post-March 2025)
  if (places?.AutocompleteSuggestions) {
    try {
      const { suggestions } = await places.AutocompleteSuggestions.fetchAutocompleteSuggestions({
        input,
        includedRegionCodes: ['in'],
      })
      return (suggestions ?? []).map((s: any) => ({
        place_id: s.placePrediction?.placeId ?? '',
        description: s.placePrediction?.text?.text ?? s.placePrediction?.description ?? '',
      })).filter((s: any) => s.place_id)
    } catch {
      // fall through to legacy
    }
  }

  // Legacy fallback (still works for keys created before March 2025)
  if (places?.AutocompleteService) {
    return new Promise(resolve => {
      new places.AutocompleteService().getPlacePredictions(
        { input, componentRestrictions: { country: 'in' }, types },
        (results: any[] | null) => {
          resolve(results?.map(r => ({ place_id: r.place_id, description: r.description })) ?? [])
        }
      )
    })
  }

  return []
}

async function resolvePlace(
  placeId: string,
  description: string,
  onPlaceSelected?: (p: PlaceSelection) => void,
  onAddressComponents?: (p: ParsedAddress) => void
) {
  const places = window.google?.maps?.places

  // Try new Place.fetchFields() first
  if (places?.Place) {
    try {
      const place = new places.Place({ id: placeId })
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress', 'displayName'] })

      if (place.location) {
        onPlaceSelected?.({
          label: description,
          lat: place.location.lat(),
          lng: place.location.lng(),
        })
      }

      if (onAddressComponents && place.addressComponents) {
        const comps: any[] = place.addressComponents
        const get = (type: string) =>
          comps.find((c: any) => c.types?.includes(type))?.longText ?? ''

        const streetNumber = get('street_number')
        const route        = get('route')
        const sublocality  = get('sublocality_level_1') || get('sublocality')
        const locality     = get('locality')
        const district     = get('administrative_area_level_2')
        const state        = get('administrative_area_level_1')
        const postalCode   = get('postal_code')

        const streetPart    = [streetNumber, route].filter(Boolean).join(' ')
        const address_line1 = streetPart || description.split(',')[0].trim()
        const city          = locality || district || sublocality

        onAddressComponents({ address_line1, city, state, postal_code: postalCode })
      }
      return
    } catch {
      // fall through to Geocoder
    }
  }

  // Fallback: legacy Geocoder
  const geocoder = window.google?.maps?.Geocoder
    ? new window.google.maps.Geocoder()
    : null
  if (!geocoder) return

  geocoder.geocode({ placeId }, (results: any[] | null, status: string) => {
    if (status !== 'OK' || !results?.[0]) return
    const result = results[0]
    const loc    = result.geometry.location

    onPlaceSelected?.({ label: description, lat: loc.lat(), lng: loc.lng() })

    if (onAddressComponents) {
      const comps: any[] = result.address_components ?? []
      const get = (type: string) =>
        comps.find((c: any) => c.types.includes(type))?.long_name ?? ''

      const streetNumber = get('street_number')
      const route        = get('route')
      const sublocality  = get('sublocality_level_1') || get('sublocality')
      const locality     = get('locality')
      const district     = get('administrative_area_level_2')
      const state        = get('administrative_area_level_1')
      const postalCode   = get('postal_code')

      const streetPart    = [streetNumber, route].filter(Boolean).join(' ')
      const address_line1 = streetPart || description.split(',')[0].trim()
      const city          = locality || district || sublocality

      onAddressComponents({ address_line1, city, state, postal_code: postalCode })
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlaceAutocompleteInput({
  value, onChange, onPlaceSelected, onAddressComponents, placeholder, className, types = ['geocode'],
}: PlaceAutocompleteInputProps) {
  const [predictions, setPredictions] = useState<{ place_id: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [mapsReady, setMapsReady]       = useState(false)
  const [resolving, setResolving]       = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!MAPS_KEY) return
    loadMapsOnce()
      .then(() => {
        if (window.google?.maps) setMapsReady(true)
      })
      .catch(() => setMapsReady(false))
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleChange(v: string) {
    onChange(v)
    if (!mapsReady) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!v.trim()) { setPredictions([]); setShowDropdown(false); return }

    debounceRef.current = setTimeout(async () => {
      const results = await fetchSuggestions(v, types)
      setPredictions(results)
      setShowDropdown(results.length > 0)
    }, 250)
  }

  async function selectPrediction(p: { place_id: string; description: string }) {
    onChange(p.description)
    setShowDropdown(false)
    setResolving(true)
    try {
      await resolvePlace(p.place_id, p.description, onPlaceSelected, onAddressComponents)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={className ?? 'w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm'}
        />
        {resolving && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl max-h-60 overflow-y-auto">
          {predictions.map(p => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => selectPrediction(p)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-gray-700"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span className="truncate text-foreground">{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
