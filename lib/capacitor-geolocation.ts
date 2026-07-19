// Cross-platform current-position lookup for the native app shell.
//
// On the web, navigator.geolocation triggers the browser's own permission
// prompt directly. Inside the native app shell (WKWebView), that same API
// isn't reliable for triggering iOS's native location dialog, so this goes
// through @capacitor/geolocation instead, which talks to CoreLocation
// directly and is guaranteed to raise the system prompt (backed by
// NSLocationWhenInUseUsageDescription in Info.plist).
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface Coords { lat: number; lng: number }

export async function getCurrentCoords(timeout = 8000): Promise<Coords> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions()
    if (perm.location === 'denied') throw new Error('Location permission denied')
    const pos = await Geolocation.getCurrentPosition({ timeout })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  }
  if (!navigator.geolocation) throw new Error('Geolocation not supported')
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => reject(err),
      { timeout }
    )
  })
}
