'use client'
// components/common/PlaceAutocompleteInput.tsx
//
// Lightweight Google Places autocomplete text input. Type to search, pick a
// suggestion from the dropdown. Degrades to a plain text input (no dropdown)
// if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't configured.

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { loadScript } from '@/lib/payment-client'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

declare global {
  interface Window {
    google?: any
  }
}

export interface PlaceSelection {
  label: string
  lat: number
  lng: number
}

interface PlaceAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  onPlaceSelected: (place: PlaceSelection) => void
  placeholder?: string
  className?: string
}

export function PlaceAutocompleteInput({
  value, onChange, onPlaceSelected, placeholder, className,
}: PlaceAutocompleteInputProps) {
  const [predictions, setPredictions] = useState<{ place_id: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [mapsReady, setMapsReady] = useState(false)
  const [resolving, setResolving] = useState(false)

  const autocompleteService = useRef<any>(null)
  const geocoder = useRef<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleChange(v: string) {
    onChange(v)
    if (!mapsReady || !autocompleteService.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!v.trim()) { setPredictions([]); setShowDropdown(false); return }

    debounceRef.current = setTimeout(() => {
      autocompleteService.current.getPlacePredictions(
        { input: v, componentRestrictions: { country: 'in' }, types: ['geocode'] },
        (results: any[] | null) => {
          setPredictions(results?.map(r => ({ place_id: r.place_id, description: r.description })) ?? [])
          setShowDropdown(true)
        }
      )
    }, 250)
  }

  function selectPrediction(p: { place_id: string; description: string }) {
    onChange(p.description)
    setShowDropdown(false)
    if (!geocoder.current) return
    setResolving(true)
    geocoder.current.geocode({ placeId: p.place_id }, (results: any[] | null, status: string) => {
      setResolving(false)
      if (status === 'OK' && results?.[0]) {
        const loc = results[0].geometry.location
        onPlaceSelected({ label: p.description, lat: loc.lat(), lng: loc.lng() })
      }
    })
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
