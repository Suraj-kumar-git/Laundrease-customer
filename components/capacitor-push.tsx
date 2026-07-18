'use client'
// Registers this device for push notifications once a user is logged in,
// and sends the resulting FCM token to the backend so it can be targeted
// later. No-ops outside the native app and while logged out.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { useAuth } from '@/components/auth-provider'

export function CapacitorPush() {
  const { user } = useAuth()
  const router = useRouter()
  const registeredForUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (!user) return
    if (registeredForUserId.current === user.id) return

    let cancelled = false

    async function sendToken(token: Token) {
      try {
        await fetch('/api/customer/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: token.value, platform: 'android' }),
        })
        registeredForUserId.current = user!.id
      } catch {
        // Best-effort — a missed registration just means this device won't
        // get pushes until the next app open, not worth surfacing to the user.
      }
    }

    const registrationListener = PushNotifications.addListener('registration', (token) => {
      if (!cancelled) sendToken(token)
    })

    const registrationErrorListener = PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registration error', err)
    })

    // Deep-link into the relevant order when a notification is tapped —
    // the backend attaches { orderId } as custom data when it sends one.
    const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const orderId = action.notification.data?.orderId
      if (orderId) router.push(`/customer/orders/${orderId}`)
    })

    ;(async () => {
      const current = await PushNotifications.checkPermissions()
      let granted = current.receive === 'granted'
      if (!granted && current.receive !== 'denied') {
        const requested = await PushNotifications.requestPermissions()
        granted = requested.receive === 'granted'
      }
      if (granted && !cancelled) await PushNotifications.register()
    })()

    return () => {
      cancelled = true
      registrationListener.then((h) => h.remove())
      registrationErrorListener.then((h) => h.remove())
      actionListener.then((h) => h.remove())
    }
  }, [user, router])

  return null
}
