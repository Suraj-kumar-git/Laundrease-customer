'use client'
// components/telephony/OrderCallLog.tsx
//
// Every masked call placed on one order. Shown to admin and support, who are
// the people resolving disputes about what was said and whether anyone picked
// up. Real numbers are never included — names identify the parties, and a
// call log has no business doubling as a directory.

import { useCallback, useEffect, useState } from 'react'
import { Phone, PhoneOff, PhoneMissed, Loader2 } from 'lucide-react'

interface CallEntry {
  id: string
  pair_type: string
  initiated_by_role: string
  initiator_name: string | null
  counterparty_name: string | null
  call_status: string | null
  duration_seconds: number | null
  started_at: string | null
  recording_url: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed:     { label: 'Answered',   cls: 'text-emerald-600' },
  'in-progress': { label: 'In progress',cls: 'text-blue-600' },
  queued:        { label: 'Ringing',    cls: 'text-blue-600' },
  'no-answer':   { label: 'No answer',  cls: 'text-amber-600' },
  busy:          { label: 'Busy',       cls: 'text-amber-600' },
  failed:        { label: 'Failed',     cls: 'text-red-600' },
  canceled:      { label: 'Cancelled',  cls: 'text-muted-foreground' },
}

export function OrderCallLog({ endpoint }: { endpoint: string }) {
  const [calls,   setCalls]   = useState<CallEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(endpoint, { credentials: 'include' })
      const json = await res.json()
      if (json.success) setCalls(json.data.calls ?? [])
    } catch { /* the empty state below covers it */ }
    finally { setLoading(false) }
  }, [endpoint])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading calls…
      </p>
    )
  }

  if (calls.length === 0) {
    return <p className="text-xs text-muted-foreground">No calls were placed on this order.</p>
  }

  return (
    <div className="space-y-2">
      {calls.map(call => {
        const meta = STATUS_META[call.call_status ?? ''] ?? { label: call.call_status ?? 'Unknown', cls: 'text-muted-foreground' }
        const answered = call.call_status === 'completed'
        const Icon = answered ? Phone : call.call_status === 'no-answer' ? PhoneMissed : PhoneOff

        return (
          <div key={call.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Icon className={`h-3.5 w-3.5 ${meta.cls}`} />
                  {call.initiator_name ?? initiatorLabel(call.initiated_by_role)}
                  <span className="text-muted-foreground">→</span>
                  {call.counterparty_name ?? counterpartyLabel(call.pair_type, call.initiated_by_role)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  <span className={meta.cls}>{meta.label}</span>
                  {call.duration_seconds != null && ` · ${formatDuration(call.duration_seconds)}`}
                  {call.started_at && ` · ${new Date(call.started_at).toLocaleString('en-IN')}`}
                </p>
              </div>
            </div>

            {call.recording_url && (
              // Signed per page load and short-lived, so a link copied out of
              // here stops working rather than becoming a permanent handle on
              // someone's conversation.
              <audio controls preload="none" src={call.recording_url}
                className="mt-2 h-8 w-full" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function initiatorLabel(role: string): string {
  return role === 'delivery' ? 'Delivery partner'
    : role === 'laundry'     ? 'Laundry'
    : 'Customer'
}

function counterpartyLabel(pairType: string, initiatedBy: string): string {
  if (initiatedBy === 'customer') {
    return pairType === 'customer_delivery' ? 'Delivery partner' : 'Laundry'
  }
  return 'Customer'
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}
