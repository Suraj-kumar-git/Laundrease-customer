'use client'
// components/common/AddressMapPicker.tsx
//
// The only way a customer address gets its coordinates now: drag the map
// under a fixed center pin (or jump there via search / "use current
// location"), reverse-geocode the center on every settle, and only allow
// confirming once that resolves to a real, complete address. No free-text
// fallback — every address saved from here on has real coordinates.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, LocateFixed, Loader2, MapPin, Search, AlertCircle } from 'lucide-react'
import { loadScript } from '@/lib/payment-client'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// Pimpri-Chinchwad / Pune — platform's primary service area. Only used when
// there's no existing address to re-center on and geolocation isn't available.
const DEFAULT_CENTER = { lat: 18.6298, lng: 73.7997 }

declare global {
  interface Window { google?: any }
}

export interface ResolvedLocation {
  latitude:           number
  longitude:          number
  address_line1:      string
  city:               string
  state:              string
  postal_code:        string
  country_code:       string
  formatted_address:  string
}

interface AddressMapPickerProps {
  initialLat?: number | null
  initialLng?: number | null
  onConfirm:   (location: ResolvedLocation) => void
  onCancel:    () => void
}

function parseAddressComponents(components: any[]) {
  const find = (type: string) => components.find((c: any) => c.types.includes(type))
  const streetNumber = find('street_number')?.long_name ?? ''
  const route         = find('route')?.long_name ?? ''
  const sublocality    = find('sublocality_level_1')?.long_name ?? find('sublocality')?.long_name ?? ''
  const locality       = find('locality')?.long_name ?? ''
  const district       = find('administrative_area_level_2')?.long_name ?? ''
  const state          = find('administrative_area_level_1')?.long_name ?? ''
  const postal_code    = find('postal_code')?.long_name ?? ''
  const country_code   = find('country')?.short_name ?? ''

  const streetPart = [streetNumber, route].filter(Boolean).join(' ')
  return {
    address_line1: streetPart || sublocality || locality,
    city:          locality || district || sublocality,
    state,
    postal_code,
    country_code,
  }
}

export function AddressMapPicker({ initialLat, initialLng, onConfirm, onCancel }: AddressMapPickerProps) {
  const mapDivRef     = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<any>(null)
  const geocoder      = useRef<any>(null)
  const autocompleteService = useRef<any>(null)
  const idleListener  = useRef<any>(null)

  const [mapsReady,   setMapsReady]   = useState(false)
  const [mapsError,   setMapsError]   = useState(false)
  const [resolving,   setResolving]   = useState(false)
  const [resolved,    setResolved]    = useState<ResolvedLocation | null>(null)
  const [resolveError,setResolveError]= useState<string | null>(null)
  const [locating,    setLocating]    = useState(false)

  // Whether the pin's postal code is one we actually serve (checked against
  // provider_service_areas) — null = not checked yet / unknown, which is
  // treated the same as "not serviceable" for confirm-button purposes, so a
  // failed check never silently lets an out-of-area address through.
  const [serviceable,     setServiceable]     = useState<boolean | null>(null)
  const [checkingService, setCheckingService] = useState(false)
  const [serviceError,    setServiceError]    = useState<string | null>(null)

  async function checkServiceability(postalCode: string) {
    setCheckingService(true); setServiceable(null); setServiceError(null)
    try {
      const res  = await fetch(`/api/customer/addresses/validate-postal-code?postalCode=${encodeURIComponent(postalCode)}`)
      const json = await res.json()
      if (!json.success) throw new Error()
      setServiceable(!!json.data?.isServiceable)
    } catch {
      setServiceError("Couldn't check service availability here — try again.")
    } finally {
      setCheckingService(false)
    }
  }

  const [query,        setQuery]        = useState('')
  const [predictions,  setPredictions]  = useState<{ place_id: string; description: string }[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  function reverseGeocodeCenter(map: any) {
    const center = map.getCenter()
    if (!center || !geocoder.current) return
    setResolving(true); setResolved(null); setResolveError(null)
    setServiceable(null); setServiceError(null)
    geocoder.current.geocode(
      { location: { lat: center.lat(), lng: center.lng() } },
      (results: any[] | null, status: string) => {
        setResolving(false)
        if (status !== 'OK' || !results?.length) {
          setResolveError("Couldn't find an address here — try moving the pin a little.")
          return
        }
        const result = results[0]
        const parsed = parseAddressComponents(result.address_components ?? [])
        if (!parsed.address_line1 || !parsed.postal_code || !parsed.city || !parsed.country_code) {
          setResolveError("Couldn't determine a complete address here — try moving the pin a little.")
          return
        }
        setResolved({
          latitude: center.lat(), longitude: center.lng(),
          ...parsed,
          formatted_address: result.formatted_address,
        })
        checkServiceability(parsed.postal_code)
      }
    )
  }

  // Load Maps JS SDK, then create the map once.
  useEffect(() => {
    if (!MAPS_KEY) { setMapsError(true); return }
    loadScript(`https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`)
      .then(() => {
        if (!window.google?.maps || !mapDivRef.current) { setMapsError(true); return }

        const center = (initialLat != null && initialLng != null)
          ? { lat: initialLat, lng: initialLng }
          : DEFAULT_CENTER

        const map = new window.google.maps.Map(mapDivRef.current, {
          center, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
        })
        mapRef.current  = map
        geocoder.current = new window.google.maps.Geocoder()
        autocompleteService.current = new window.google.maps.places.AutocompleteService()
        setMapsReady(true)

        idleListener.current = map.addListener('idle', () => reverseGeocodeCenter(map))

        // No existing address to re-center on — try a silent, best-effort
        // geolocation so the starting point is closer than the hardcoded default.
        if (initialLat == null && initialLng == null && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => reverseGeocodeCenter(map),
            { timeout: 4000 }
          )
        } else {
          reverseGeocodeCenter(map)
        }
      })
      .catch(() => setMapsError(true))

    return () => {
      if (idleListener.current) window.google?.maps?.event?.removeListener(idleListener.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSearchChange(value: string) {
    setQuery(value)
    if (!mapsReady || !autocompleteService.current) return
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    if (!value.trim()) { setPredictions([]); return }
    searchDebounce.current = setTimeout(() => {
      autocompleteService.current.getPlacePredictions(
        { input: value, componentRestrictions: { country: 'in' }, types: ['geocode'] },
        (results: any[] | null) => {
          setPredictions(results?.map(r => ({ place_id: r.place_id, description: r.description })) ?? [])
          setShowDropdown(true)
        }
      )
    }, 250)
  }

  function selectPrediction(p: { place_id: string; description: string }) {
    setQuery(p.description); setShowDropdown(false)
    if (!geocoder.current || !mapRef.current) return
    geocoder.current.geocode({ placeId: p.place_id }, (results: any[] | null, status: string) => {
      if (status !== 'OK' || !results?.[0]) return
      const loc = results[0].geometry.location
      mapRef.current.panTo({ lat: loc.lat(), lng: loc.lng() })
      mapRef.current.setZoom(17)
    })
  }

  function useMyLocation() {
    if (!navigator.geolocation || !mapRef.current) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        mapRef.current.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        mapRef.current.setZoom(17)
      },
      () => setLocating(false),
      { timeout: 8000 }
    )
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Cancel
        </button>
        <p className="text-sm font-medium text-foreground">Pin your exact location</p>
      </div>

      {mapsError ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">Couldn&apos;t load the map. Please check your connection and try again.</p>
        </div>
      ) : (
        <>
          <div ref={boxRef} className="relative mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => predictions.length > 0 && setShowDropdown(true)}
                placeholder="Search for your area or building…"
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {showDropdown && predictions.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                {predictions.map(p => (
                  <button key={p.place_id} type="button" onClick={() => selectPrediction(p)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{p.description}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={useMyLocation} disabled={locating}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50">
              {locating ? <Loader2 className="h-3 w-3 animate-spin" /> : <LocateFixed className="h-3 w-3" />}
              Use my current location
            </button>
          </div>

          <div className="relative h-[50vh] min-h-[320px] overflow-hidden rounded-2xl border border-border">
            <div ref={mapDivRef} className="h-full w-full" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
              <MapPin className="h-9 w-9 text-primary drop-shadow-md" fill="currentColor" />
            </div>
            {!mapsReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>

          <div className="mt-3 min-h-[3rem] rounded-xl border border-border/50 bg-card p-3">
            {resolving ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding address…
              </p>
            ) : resolveError ? (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {resolveError}
              </p>
            ) : resolved ? (
              <div className="space-y-1.5">
                <p className="flex items-start gap-2 text-sm text-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {resolved.formatted_address}
                </p>
                {checkingService ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking if we deliver here…
                  </p>
                ) : serviceError ? (
                  <p className="flex items-center gap-2 text-xs text-amber-600">
                    <AlertCircle className="h-3 w-3 shrink-0" /> {serviceError}
                  </p>
                ) : serviceable === false ? (
                  <p className="flex items-center gap-2 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" /> Sorry, we don&apos;t deliver to this area yet.
                  </p>
                ) : serviceable === true ? (
                  <p className="text-xs text-emerald-600">✓ We deliver here</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Move the map to place the pin on your address.</p>
            )}
          </div>

          <button type="button" onClick={() => resolved && serviceable && onConfirm(resolved)}
            disabled={!resolved || resolving || checkingService || serviceable !== true}
            className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            Confirm this location
          </button>
        </>
      )}
    </div>
  )
}
