'use client'

// lib/use-ticket-chat.ts
// Shared "replica of websocket" hook for every ticket-chat surface (support
// agent, admin agent, customer, laundry, delivery). Polls a per-surface
// /poll endpoint on a short interval for new comments + who else is typing,
// and exposes a throttled notifyTyping() to wire into a reply textarea's
// onChange. Mirrors the silent-poll pattern already used by this codebase's
// notification bells (setInterval, fire-and-forget, no loading-state
// disruption) — just tightened to feel like live chat instead of a bell.

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS   = 3000
const TYPING_THROTTLE_MS = 2000

interface Typer {
  user_id:   string
  full_name: string
}

interface UseTicketChatOptions<TComment extends { id: number }> {
  pollUrl:        string
  typingUrl:      string
  comments:       TComment[]
  onNewComments:  (fresh: TComment[]) => void
  onStatusChange?: (status: string) => void
  // 'agent' surfaces (support/admin-tickets/admin-drawer) show the
  // reporter's name; 'reporter' surfaces (customer/laundry/delivery) show a
  // generic "Support is typing…" regardless of which agent it is.
  mode:           'agent' | 'reporter'
  enabled?:       boolean
}

interface UseTicketChatResult {
  typingLabel:  string | null
  notifyTyping: () => void
}

function computeTypingLabel(typers: Typer[], mode: 'agent' | 'reporter'): string | null {
  if (typers.length === 0) return null
  if (mode === 'reporter') return 'Support is typing…'
  return typers.length === 1 ? `${typers[0].full_name} is typing…` : 'Someone is typing…'
}

export function useTicketChat<TComment extends { id: number }>({
  pollUrl, typingUrl, comments, onNewComments, onStatusChange, mode, enabled = true,
}: UseTicketChatOptions<TComment>): UseTicketChatResult {
  const [typingLabel, setTypingLabel] = useState<string | null>(null)

  // Always reflects the highest comment id the page currently knows about —
  // kept in sync whether that list grew via a poll merge, the page's own
  // reply, or a full refetch after some other mutation. Reading this fresh
  // on every poll tick (rather than tracking a separate cursor) means there
  // is nothing to explicitly resync.
  const lastIdRef = useRef(0)
  useEffect(() => {
    if (comments.length > 0) lastIdRef.current = Math.max(...comments.map(c => c.id))
  }, [comments])

  const onNewCommentsRef = useRef(onNewComments)
  onNewCommentsRef.current = onNewComments
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const poll = useCallback(async () => {
    try {
      const res  = await fetch(`${pollUrl}?after_id=${lastIdRef.current}`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success) return
      const fresh: TComment[] = json.data.comments ?? []
      if (fresh.length > 0) onNewCommentsRef.current(fresh)
      if (json.data.status) onStatusChangeRef.current?.(json.data.status)
      setTypingLabel(computeTypingLabel(json.data.typers ?? [], mode))
    } catch { /* silent — a missed poll tick just gets picked up by the next one */ }
  }, [pollUrl, mode])

  useEffect(() => {
    if (!enabled) return
    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval) return
      poll()
      interval = setInterval(poll, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null }
    }

    if (document.visibilityState === 'visible') start()
    const onVisibility = () => { document.visibilityState === 'visible' ? start() : stop() }
    document.addEventListener('visibilitychange', onVisibility)

    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [enabled, poll])

  const lastTypingSentAt = useRef(0)
  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastTypingSentAt.current < TYPING_THROTTLE_MS) return
    lastTypingSentAt.current = now
    fetch(typingUrl, { method: 'POST', credentials: 'include' }).catch(() => { /* silent */ })
  }, [typingUrl])

  return { typingLabel, notifyTyping }
}
