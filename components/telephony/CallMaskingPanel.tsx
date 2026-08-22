'use client'
// components/telephony/CallMaskingPanel.tsx
//
// Masking configuration, shared by the admin settings page and the support
// mirror. Only the endpoint and whether the viewer can save differ, so both
// pass those in rather than keeping two copies of a form that must agree.

import { useCallback, useEffect, useState } from 'react'
import {
  Phone, ShieldCheck, AlertTriangle, Loader2, CheckCircle2,
  XCircle, RefreshCw, Save,
} from 'lucide-react'

interface Readiness { label: string; ok: boolean }

interface Config {
  is_active: boolean
  provider: string
  api_subdomain: string
  exophone: string | null
  record_calls: boolean
  announcement_url: string | null
  call_time_limit_seconds: number
  ring_timeout_seconds: number
  inbound_redial_window_minutes: number
  support_forward_number: string | null
  support_hours_start: string
  support_hours_end: string
  credentials_configured: boolean
  readiness: Readiness[]
}

const INPUT =
  'w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60'

export function CallMaskingPanel({ endpoint, canWrite }: {
  endpoint: string
  canWrite: boolean
}) {
  const [config,  setConfig]  = useState<Config | null>(null)
  const [draft,   setDraft]   = useState<Partial<Config>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res  = await fetch(endpoint, { credentials: 'include' })
      const json = await res.json()
      if (json.success) { setConfig(json.data); setDraft({}) }
      else setMsg({ text: json.error ?? 'Could not load settings', ok: false })
    } catch {
      setMsg({ text: 'Could not load settings', ok: false })
    } finally { setLoading(false) }
  }, [endpoint])

  useEffect(() => { load() }, [load])

  const value = <K extends keyof Config>(key: K): Config[K] | undefined =>
    (key in draft ? draft[key] : config?.[key]) as Config[K] | undefined

  const set = <K extends keyof Config>(key: K, v: Config[K]) =>
    setDraft(d => ({ ...d, [key]: v }))

  const dirty = Object.keys(draft).length > 0

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res  = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (json.success) { setConfig(json.data); setDraft({}); setMsg({ text: 'Saved', ok: true }) }
      else setMsg({ text: json.error ?? 'Could not save', ok: false })
    } catch {
      setMsg({ text: 'Could not save', ok: false })
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading call settings…
      </div>
    )
  }
  if (!config) {
    return <p className="p-6 text-sm text-muted-foreground">Call settings unavailable.</p>
  }

  const active = value('is_active')
  const blockers = config.readiness.filter(r => !r.ok)

  return (
    <div className="space-y-5">

      {/* Master switch. Sits at the top because during an incident this is the
          only control anyone is looking for. */}
      <div className={`rounded-2xl border p-4 ${active
        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10'
        : 'border-border bg-card'}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Phone className="h-4 w-4" /> Masked calling
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {active
                ? 'On. Customers and partners reach each other through the platform number.'
                : 'Off. Nobody can call anyone through the app — turn this on once setup is complete.'}
            </p>
          </div>
          <button type="button" disabled={!canWrite}
            onClick={() => set('is_active', !active)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50
              ${active ? 'bg-red-600 text-white hover:bg-red-700'
                       : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
            {active ? 'Turn off' : 'Turn on'}
          </button>
        </div>

        {blockers.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Not ready yet
            </p>
            <ul className="mt-1.5 space-y-1">
              {config.readiness.map(r => (
                <li key={r.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {r.ok
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    : <XCircle className="h-3 w-3 text-amber-600" />}
                  {r.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Numbers */}
      <Section title="Numbers" icon={Phone}>
        <Field label="Virtual number (ExoPhone)"
          hint="Shown to both parties in place of each other's number.">
          <input className={INPUT} disabled={!canWrite}
            value={value('exophone') ?? ''}
            onChange={e => set('exophone', e.target.value)}
            placeholder="+918047115777" />
        </Field>
        <Field label="Support number for inbound calls"
          hint="Where callers land when there's no live conversation to reconnect them to.">
          <input className={INPUT} disabled={!canWrite}
            value={value('support_forward_number') ?? ''}
            onChange={e => set('support_forward_number', e.target.value)}
            placeholder="+919812345678" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Support hours from">
            <input type="time" className={INPUT} disabled={!canWrite}
              value={(value('support_hours_start') ?? '09:00:00').slice(0, 5)}
              onChange={e => set('support_hours_start', `${e.target.value}:00`)} />
          </Field>
          <Field label="Support hours to"
            hint="Outside these hours inbound calls go to voicemail.">
            <input type="time" className={INPUT} disabled={!canWrite}
              value={(value('support_hours_end') ?? '21:00:00').slice(0, 5)}
              onChange={e => set('support_hours_end', `${e.target.value}:00`)} />
          </Field>
        </div>
      </Section>

      {/* Recording */}
      <Section title="Recording" icon={ShieldCheck}>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" disabled={!canWrite}
            checked={value('record_calls') ?? false}
            onChange={e => set('record_calls', e.target.checked)} />
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Record calls.</span>{' '}
            Kept as evidence for item reports, then deleted when the claim window closes.
          </span>
        </label>
        <Field label="Recording notice audio (WAV URL)"
          hint="Played to both parties before they are connected. Required while recording is on — callers must be told.">
          <input className={INPUT} disabled={!canWrite}
            value={value('announcement_url') ?? ''}
            onChange={e => set('announcement_url', e.target.value)}
            placeholder="https://…/recording-notice.wav" />
        </Field>
      </Section>

      {/* Limits */}
      <Section title="Call limits" icon={RefreshCw}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Max call length (sec)">
            <input type="number" className={INPUT} disabled={!canWrite}
              value={value('call_time_limit_seconds') ?? 600}
              onChange={e => set('call_time_limit_seconds', parseInt(e.target.value, 10) || 0)} />
          </Field>
          <Field label="Ring timeout (sec)">
            <input type="number" className={INPUT} disabled={!canWrite}
              value={value('ring_timeout_seconds') ?? 30}
              onChange={e => set('ring_timeout_seconds', parseInt(e.target.value, 10) || 0)} />
          </Field>
          <Field label="Redial window (min)"
            hint="How long a call-back still reconnects.">
            <input type="number" className={INPUT} disabled={!canWrite}
              value={value('inbound_redial_window_minutes') ?? 30}
              onChange={e => set('inbound_redial_window_minutes', parseInt(e.target.value, 10) || 0)} />
          </Field>
        </div>
      </Section>

      {msg && (
        <p className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>
      )}

      {canWrite && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save changes
          </button>
          {dirty && (
            <button type="button" onClick={() => setDraft({})}
              className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
              Discard
            </button>
          )}
        </div>
      )}

      {!canWrite && (
        <p className="text-xs text-muted-foreground">
          You can view these settings but not change them.
        </p>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
