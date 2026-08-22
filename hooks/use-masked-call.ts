'use client'
// hooks/use-masked-call.ts
//
// Placing a masked call from any persona. The three roles hit different
// endpoints but need identical feedback, and getting that feedback wrong is
// what makes a call button feel broken: nothing visibly happens for a few
// seconds, because the ringing starts on the caller's own handset rather than
// in the browser.

import { useCallback, useEffect, useRef, useState } from 'react'

export type MaskedCallState =
  | 'idle'
  | 'calling'   // request in flight
  | 'placed'    // provider accepted — the caller's phone is about to ring
  | 'closed'    // this line is no longer open
  | 'error'

/**
 * How long the outcome message stays before the button returns to idle. Long
 * enough to read "your phone will ring first", short enough that a partner who
 * genuinely needs to call again isn't left staring at a stale banner.
 */
const RESET_AFTER_MS = 8_000

export function useMaskedCall(endpoint: string) {
  const [state,   setState]   = useState<MaskedCallState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A pending reset must not fire onto an unmounted component, and a partner
  // navigating between jobs unmounts these constantly.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setState('idle')
    setMessage(null)
  }, [])

  const call = useCallback(async (body?: Record<string, unknown>) => {
    if (state === 'calling') return          // in flight; ignore the second tap
    if (timer.current) clearTimeout(timer.current)

    setState('calling')
    setMessage(null)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body ?? {}),
      })
      const json = await res.json().catch(() => null)

      if (res.ok && json?.success) {
        setState('placed')
        setMessage(json.data?.message ?? 'Connecting — your phone will ring first')
      } else {
        // 409 is the line having closed, which is a normal part of the
        // lifecycle rather than a fault, and reads better without the alarm.
        setState(res.status === 409 ? 'closed' : 'error')
        setMessage(json?.error ?? 'Could not place the call')
      }
    } catch {
      setState('error')
      setMessage('Could not place the call — check your connection')
    }

    timer.current = setTimeout(() => {
      setState('idle')
      setMessage(null)
    }, RESET_AFTER_MS)
  }, [endpoint, state])

  return { state, message, call, reset, busy: state === 'calling' }
}
