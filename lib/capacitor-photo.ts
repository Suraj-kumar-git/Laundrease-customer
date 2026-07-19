// Cross-platform camera capture for the native app shell.
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false)
  useEffect(() => { setIsNative(Capacitor.isNativePlatform()) }, [])
  return isNative
}

// Forces live camera capture (CameraSource.Camera, not .Photos or .Prompt) —
// used for lost/damaged item claims as a fraud-prevention measure, so no
// gallery/file-picker fallback is offered for that flow even though it'd be
// easy to add. Support-ticket attachments use this alongside a normal file
// picker instead of in place of it.
export async function capturePhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    quality: 85,
  }).catch((err) => { console.error('[camera] capture failed/cancelled', err); return null })
  if (!photo?.webPath) return null
  const blob = await fetch(photo.webPath).then((r) => r.blob())
  const ext = photo.format || 'jpeg'
  return new File([blob], `photo_${Date.now()}.${ext}`, { type: blob.type || `image/${ext}` })
}
