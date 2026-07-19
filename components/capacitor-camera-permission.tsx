'use client'
// Proactively requests the camera runtime permission. This app never calls
// the Camera plugin's own capture UI — plain <input type="file"> attachment
// pickers (support tickets, lost/damaged item reports) rely on Capacitor's
// WebView to offer a "Camera" option alongside gallery/files, but it only
// does that once android.permission.CAMERA is actually *granted*, not just
// declared in the manifest. Nothing else in the app ever triggers that OS
// prompt, so without this the picker silently stays gallery/files-only
// forever. No-ops outside the native app.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'

export function CapacitorCameraPermission() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    Camera.checkPermissions()
      .then((status) => {
        if (status.camera === 'prompt' || status.camera === 'prompt-with-rationale') {
          return Camera.requestPermissions({ permissions: ['camera'] })
        }
      })
      .catch((err) => console.error('[camera] permission check/request failed', err))
  }, [])

  return null
}
