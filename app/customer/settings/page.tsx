'use client'
// app/customer/settings/page.tsx
// Full settings page with live notification preferences, real linked accounts,
// and coming-soon sections (privacy, active sessions) with proper UI.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Shield, Link2, Monitor, Trash2, Loader2,
  Check, Mail, MessageSquare, Smartphone, Save,
  AlertCircle, CheckCircle2, Construction, LogOut,
  Eye, BarChart3, Megaphone, RefreshCw, Chrome,
  Facebook, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { useToast } from '@/hooks/use-toast'

// ---- Types -------------------------------------------------------------------
interface NotifCategory {
  category:    string
  label:       string
  description: string
  locked:      boolean
  channels: { email: boolean; sms: boolean; push: boolean }
}

interface LinkedAccount {
  provider:     string
  label:        string
  connected:    boolean
  connected_at: string | null
}

interface SettingsData {
  notifications:   NotifCategory[]
  linked_accounts: LinkedAccount[]
  sessions:        { total: number; other: number }
}

// ---- Helpers -----------------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Coming Soon Badge -------------------------------------------------------
function ComingSoon() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
      <Construction className="h-3 w-3" /> Coming Soon
    </span>
  )
}

// ---- Section Card ------------------------------------------------------------
function Section({
  icon: Icon, title, description, badge, children, dimmed,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  badge?: React.ReactNode
  children: React.ReactNode
  dimmed?: boolean
}) {
  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-opacity',
      dimmed && 'opacity-70'
    )}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {badge}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ---- Toggle ------------------------------------------------------------------
function Toggle({
  checked, onChange, disabled, label,
}: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { if (!disabled) onChange(!checked) }}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
        checked ? 'bg-primary' : 'bg-muted-foreground/25',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  )
}

// ---- Channel header icon -----------------------------------------------------
const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  sms:   MessageSquare,
  push:  Smartphone,
}

// ---- Notification prefs section ----------------------------------------------
function NotificationPrefs({ data, onChange }: {
  data: NotifCategory[]
  onChange: (updated: NotifCategory[]) => void
}) {
  const toggle = (category: string, channel: 'email' | 'sms' | 'push') => {
    onChange(data.map(p =>
      p.category === category && !p.locked
        ? { ...p, channels: { ...p.channels, [channel]: !p.channels[channel] } }
        : p
    ))
  }

  return (
    <div>
      {/* Column headers */}
      <div className="mb-2 grid grid-cols-[1fr_40px_40px_40px] items-center gap-2 px-2 text-center">
        <div />
        {(['email', 'sms', 'push'] as const).map(ch => {
          const Icon = CHANNEL_ICONS[ch]
          return (
            <div key={ch} className="flex flex-col items-center gap-0.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {ch}
              </span>
            </div>
          )
        })}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/40">
        {data.map(pref => (
          <div
            key={pref.category}
            className={cn(
              'grid grid-cols-[1fr_40px_40px_40px] items-center gap-2 px-4 py-3 transition-colors',
              pref.locked ? 'bg-muted/20' : 'hover:bg-muted/10'
            )}
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground">{pref.label}</p>
                {pref.locked && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                    Always On
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{pref.description}</p>
            </div>
            {(['email', 'sms', 'push'] as const).map(ch => (
              <div key={ch} className="flex justify-center">
                <Toggle
                  checked={pref.channels[ch]}
                  onChange={() => toggle(pref.category, ch)}
                  disabled={pref.locked}
                  label={`${pref.label} ${ch} notifications`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Security alerts are always enabled to keep your account safe.
      </p>
    </div>
  )
}

// ---- Provider icon -----------------------------------------------------------
function ProviderIcon({ provider }: { provider: string }) {
  if (provider === 'google')   return <Chrome className="h-5 w-5 text-blue-500" />
  if (provider === 'facebook') return <Facebook className="h-5 w-5 text-[#1877F2]" />
  return <Link2 className="h-5 w-5 text-muted-foreground" />
}

// ---- Linked accounts section -------------------------------------------------
function LinkedAccountsSection({ accounts }: { accounts: LinkedAccount[] }) {
  const anyConnected = accounts.some(a => a.connected)

  return (
    <div className="space-y-3">
      {!anyConnected && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No social accounts linked. Sign in with Google or Facebook on the login page to link your account automatically.
          </span>
        </div>
      )}
      {accounts.map(account => (
        <div
          key={account.provider}
          className={cn(
            'flex items-center justify-between rounded-xl border px-4 py-3 transition-all',
            account.connected
              ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-border/50 bg-muted/20'
          )}
        >
          <div className="flex items-center gap-3">
            <ProviderIcon provider={account.provider} />
            <div>
              <p className="text-sm font-medium text-foreground">{account.label}</p>
              <p className="text-xs text-muted-foreground">
                {account.connected
                  ? `Connected${account.connected_at ? ` · ${formatDate(account.connected_at)}` : ''}`
                  : 'Not connected — sign in with this provider to link'}
              </p>
            </div>
          </div>
          {account.connected && (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Unlink options will be available in an upcoming update.
      </p>
    </div>
  )
}

// ---- Privacy section (coming soon but showing real toggles grayed) -----------
function PrivacySection() {
  const items = [
    {
      icon: BarChart3,
      label:  'Personalised Recommendations',
      sub:    'Use your order history to suggest relevant services and providers',
    },
    {
      icon: Eye,
      label:  'Analytics & Performance Data',
      sub:    'Help us improve by sharing anonymised usage data',
    },
    {
      icon: Megaphone,
      label:  'Marketing Communications',
      sub:    'Receive promotional offers based on your preferences',
    },
  ]

  return (
    <div className="space-y-3">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-border/40 px-4 py-3"
          >
            <div className="flex items-start gap-3 min-w-0">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
            </div>
            <Toggle checked disabled onChange={() => {}} />
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">
        Granular privacy controls coming soon. Current defaults follow our{' '}
        <a href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</a>.
      </p>
    </div>
  )
}

// ---- Active sessions section (coming soon) -----------------------------------
function SessionsSection({ sessions }: { sessions: { total: number; other: number } }) {
  return (
    <div className="space-y-3">
      {sessions.total > 0 ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {sessions.total} active session{sessions.total !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sessions.other > 0
                    ? `${sessions.other} other device${sessions.other !== 1 ? 's' : ''} currently signed in`
                    : 'Only this device is signed in'}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Per-session management (view device info, revoke individual sessions) is coming soon.
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-border/40 px-4 py-4 text-center text-sm text-muted-foreground">
          No active sessions found
        </div>
      )}
    </div>
  )
}

// ---- Save bar (sticky bottom when unsaved changes) ---------------------------
function SaveBar({ visible, saving, saved, onSave }: {
  visible: boolean; saving: boolean; saved: boolean; onSave: () => void
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur"
        >
          <div className="container mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">You have unsaved changes</p>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {saving  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> :
               saved   ? <><Check className="h-4 w-4" /> Saved!</> :
               <><Save className="h-4 w-4" /> Save Preferences</>}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---- Toast notification helper -----------------------------------------------
function InlineStatus({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn(
        'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm',
        type === 'success'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
          : 'bg-destructive/10 text-destructive'
      )}
    >
      {type === 'success'
        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
        : <AlertCircle className="h-4 w-4 shrink-0" />}
      {message}
    </motion.div>
  )
}

// ---- Page -------------------------------------------------------------------
export default function SettingsPage() {
  const { user, isLoading, logout } = useAuth()
  const router  = useRouter()
  const { toast } = useToast()

  const [data,    setData]    = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Track unsaved changes: compare current notif prefs to last-saved
  const savedNotifRef = useRef<string>('')
  const [localNotif, setLocalNotif] = useState<NotifCategory[]>([])
  const [dirty,   setDirty]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Fetch all settings data
  const fetchSettings = useCallback(async () => {
    setLoading(true); setFetchError(null)
    try {
      const res  = await fetch('/api/customer/settings', { credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to load settings')
      setData(json.data)
      setLocalNotif(json.data.notifications)
      savedNotifRef.current = JSON.stringify(json.data.notifications)
      setDirty(false)
    } catch (err: any) {
      setFetchError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/customer/auth/login?returnTo=/customer/settings')
      return
    }
    if (user) fetchSettings()
  }, [user, isLoading, fetchSettings, router])

  // Track dirty state whenever localNotif changes
  const handleNotifChange = (updated: NotifCategory[]) => {
    setLocalNotif(updated)
    setSaved(false)
    setSaveErr(null)
    setDirty(JSON.stringify(updated) !== savedNotifRef.current)
  }

  // Save preferences
  const handleSave = async () => {
    setSaving(true); setSaveErr(null)
    try {
      // Flatten to [{category, channel, enabled}] array
      const payload = localNotif.flatMap(pref =>
        (['email', 'sms', 'push'] as const).map(ch => ({
          category: pref.category,
          channel:  ch,
          enabled:  pref.channels[ch],
        }))
      )

      const res  = await fetch('/api/customer/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notifications: payload }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to save')

      savedNotifRef.current = JSON.stringify(localNotif)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      toast({ title: 'Preferences saved ✓', description: 'Your notification settings have been updated' })
    } catch (err: any) {
      setSaveErr(err.message)
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ---- Render states ---------------------------------------------------------
  if (isLoading || (!data && loading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-medium text-foreground">Failed to load settings</p>
        <p className="mt-1 text-sm text-muted-foreground">{fetchError}</p>
        <button
          type="button"
          onClick={fetchSettings}
          className="mt-5 flex items-center gap-2 mx-auto rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Try Again
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="container mx-auto max-w-3xl px-4 py-8 pb-24">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your notification preferences and account settings
          </p>
        </div>

        <div className="space-y-5">

          {/* 1. Notification Preferences — LIVE */}
          <Section
            icon={Bell}
            title="Notification Preferences"
            description="Control how and when we contact you"
          >
            <NotificationPrefs data={localNotif} onChange={handleNotifChange} />

            {/* Inline save status */}
            <AnimatePresence>
              {saveErr && (
                <div className="mt-3">
                  <InlineStatus type="error" message={saveErr} />
                </div>
              )}
              {saved && !dirty && (
                <div className="mt-3">
                  <InlineStatus type="success" message="Notification preferences saved successfully" />
                </div>
              )}
            </AnimatePresence>

            {/* Desktop save button (also shows; mobile uses sticky bar) */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="hidden sm:flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40"
              >
                {saving  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> :
                 saved   ? <><Check className="h-4 w-4" /> Saved!</> :
                 <><Save className="h-4 w-4" /> Save Preferences</>}
              </button>
              {dirty && !saving && (
                <span className="hidden sm:block text-xs text-muted-foreground">
                  You have unsaved changes
                </span>
              )}
            </div>
          </Section>

          {/* 2. Privacy & Data — UI shown, toggles disabled (coming soon) */}
          <Section
            icon={Shield}
            title="Privacy & Data"
            description="Control how your data is used"
            badge={<ComingSoon />}
            dimmed
          >
            <PrivacySection />
          </Section>

          {/* 3. Linked Accounts — LIVE (reads from oauth_accounts) */}
          <Section
            icon={Link2}
            title="Linked Accounts"
            description="Social accounts connected to your Laundrease profile"
          >
            {data && <LinkedAccountsSection accounts={data.linked_accounts} />}
          </Section>

          {/* 4. Active Sessions — shows count, detail coming soon */}
          <Section
            icon={Monitor}
            title="Active Sessions"
            description="Devices currently signed into your account"
            badge={<ComingSoon />}
          >
            {data && <SessionsSection sessions={data.sessions} />}
          </Section>

          {/* 5. Account Deletion — keep as mailto */}
          <Section
            icon={Trash2}
            title="Account Deletion"
            description="Permanently delete your Laundrease account"
          >
            <p className="mb-4 text-sm text-muted-foreground">
              Deleting your account is permanent. All your orders, wallet balance, loyalty points,
              and personal data will be erased within 30 days. This cannot be undone.
            </p>
            <a
              href="mailto:support@laundrease.in?subject=Account%20Deletion%20Request"
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              Request Account Deletion
            </a>
          </Section>

        </div>
      </div>

      {/* Sticky save bar for mobile (shows when dirty) */}
      <SaveBar
        visible={dirty}
        saving={saving}
        saved={saved}
        onSave={handleSave}
      />
    </>
  )
}
