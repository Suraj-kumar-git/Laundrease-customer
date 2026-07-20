import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

// Capacitor.isNativePlatform() must not be called directly during render —
// it's the same value on every server render (SSR has no native runtime),
// so reading it there would only ever produce a hydration mismatch once the
// client re-evaluates on-device. Settling it in an effect avoids that.
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform())
  }, [])
  return isNative
}

/**
 * Opens the native camera and returns a File ready to hand to whatever
 * upload state a page already manages (e.g. setFiles(prev => [...prev, file])).
 * Resolves to null if the user cancels or the capture fails — callers
 * should just no-op on null rather than surface it as an error.
 */
export async function capturePhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 85,
  }).catch((err) => {
    // Cancelling the camera throws too, not just real failures.
    console.error('[camera] capture failed or cancelled', err)
    return null
  })

  if (!photo?.webPath) return null

  const blob = await fetch(photo.webPath).then((r) => r.blob())
  const ext = photo.format || 'jpeg'
  return new File([blob], `photo_${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` })
}
