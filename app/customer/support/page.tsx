'use client'
// app/customer/support/page.tsx
// Customer support — ticket list, category-wise creation, and threaded replies.
// Fully dynamic: categories/sub-categories/priorities come from
// support_ticket_categories / support_ticket_priorities (DB-driven, admin-manageable).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, RefreshCw, AlertCircle, MessageSquare, X,
  CheckCircle2, Clock, ArrowLeft, Send, ChevronDown,
  ChevronLeft, ChevronRight, Paperclip, Loader2,
  FileText, ImageIcon, Film, AlertTriangle, Package,
  LifeBuoy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Category {
  code:             string
  display_name:     string
  icon:             string
  description:      string
  sub_categories:   string[]
  default_priority: string | null
}
interface Priority {
  code: string; description: string; sort_order: number
  first_response_sla_minutes: number | null; resolution_sla_minutes: number | null
}
interface Status { code: string; description: string; sort_order: number; is_terminal: boolean }

interface Ticket {
  id: number
  category: string; category_label: string; category_icon: string
  priority: string; status: string; status_label: string
  subject: string
  order_id: number | null; order_number: string | null
  created_at: string; updated_at: string
  first_response_at: string | null; resolved_at: string | null
  sla_breached: boolean
  metadata: any
  reply_count: number; attachment_count: number
}

interface Attachment {
  id: number; filename: string; content_type: string
  size_bytes: number; storage_key: string; url: string | null; created_at: string
}
interface Comment {
  id: number; body: string; created_at: string
  author_name: string; author_role: 'reporter' | 'agent'
}
interface TicketDetail {
  ticket: any
  comments: Comment[]
  attachments: Attachment[]
  status_history: Array<{ from_status: string | null; to_status: string; note: string | null; created_at: string }>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hold:        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed:      'bg-muted text-muted-foreground',
  reopened:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
}
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-muted-foreground',
}
const ALLOWED_TYPES = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','video/mp4','video/quicktime']
const MAX_FILE_SIZE = 10 * 1024 * 1024

const INPUT    = 'w-full rounded-xl border border-border/60 bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground'
const TEXTAREA = `${INPUT} resize-none`

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
function ticketRef(id: number) { return `#TICKET-${String(id).padStart(5, '0')}` }
function fileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <ImageIcon className="h-4 w-4" />
  if (contentType.startsWith('video/')) return <Film className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── Bottom-sheet wrapper (full-screen on mobile, centered modal on desktop) ───

function SheetModal({ onClose, children, widthClass = 'sm:max-w-lg' }: {
  onClose: () => void; children: React.ReactNode; widthClass?: string
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <motion.div
          initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className={cn(
            'pointer-events-auto flex w-full flex-col bg-background',
            'max-h-[92vh] rounded-t-3xl border-t border-border/50',
            'sm:max-h-[85vh] sm:rounded-2xl sm:border',
            widthClass
          )}
        >
          {children}
        </motion.div>
      </div>
    </>
  )
}

// ─── New Ticket Form ────────────────────────────────────────────────────────

function NewTicketForm({
  meta, onSuccess, onClose, lockedCategory, lockedOrder,
}: {
  meta: { categories: Category[]; priorities: Priority[] }
  onSuccess: (id: number, ref: string) => void
  onClose: () => void
  lockedCategory?: string
  lockedOrder?: { id: string; order_number: string } | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const initialCat = lockedCategory ? meta.categories.find(c => c.code === lockedCategory) ?? null : null
  const [step,   setStep]   = useState<'category' | 'details'>(initialCat ? 'details' : 'category')
  const [selCat, setSelCat] = useState<Category | null>(initialCat)
  const [form, setForm] = useState({ sub_category: '', subject: '', description: '', priority: '' })
  const [files,     setFiles]     = useState<File[]>([])
  const [fileError, setFileError] = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (initialCat) setForm(f => ({ ...f, priority: initialCat.default_priority || '' }))
  }, [initialCat])

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setFileError('')
    const toAdd: File[] = []
    for (const f of Array.from(incoming)) {
      if (!ALLOWED_TYPES.includes(f.type)) { setFileError(`"${f.name}" is not an allowed file type.`); continue }
      if (f.size > MAX_FILE_SIZE)          { setFileError(`"${f.name}" exceeds the 10 MB limit.`); continue }
      if (files.length + toAdd.length >= 5){ setFileError('Maximum 5 attachments per ticket.'); break }
      toAdd.push(f)
    }
    setFiles(prev => [...prev, ...toAdd])
  }

  async function submit() {
    if (!form.subject.trim())     { setError('Subject is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    if (form.description.trim().length < 20) { setError('Please describe in more detail (min 20 characters)'); return }

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/customer/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          category:     selCat!.code,
          sub_category: form.sub_category || undefined,
          subject:      form.subject.trim(),
          description:  form.description.trim(),
          priority:     form.priority || selCat!.default_priority || undefined,
          order_id:     lockedOrder?.id,
        }),
      })
      const json = await res.json()
      if (!json.success) { setError(json.error || 'Submission failed'); return }

      const { ticket_id, ticket_ref } = json.data

      if (files.length > 0) {
        for (const file of files) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('ticket_id', String(ticket_id))
          await fetch('/api/customer/support/upload', { method: 'POST', body: fd, credentials: 'include' })
            .catch(() => {})
        }
      }
      onSuccess(ticket_id, ticket_ref)
    } catch { setError('Something went wrong') }
    finally { setSaving(false) }
  }

  // ── Step 1: category picker ──
  if (step === 'category') {
    return (
      <>
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <h2 className="text-base font-bold text-foreground">What do you need help with?</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-muted-foreground">Choose the category that best fits your issue</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {meta.categories.map(cat => (
              <button key={cat.code}
                onClick={() => {
                  setSelCat(cat)
                  setForm(f => ({ ...f, priority: cat.default_priority || '', sub_category: '' }))
                  setStep('details')
                }}
                className="flex items-start gap-3 rounded-2xl border border-border/60 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="text-2xl shrink-0">{cat.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{cat.display_name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{cat.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </>
    )
  }

  // ── Step 2: details ──
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
        {!lockedCategory && (
          <button onClick={() => setStep('category')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <span className="text-xl">{selCat!.icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-foreground">{selCat!.display_name}</h3>
          <p className="truncate text-[10px] text-muted-foreground">{selCat!.description}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted shrink-0"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {lockedOrder && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-primary">
            <Package className="h-4 w-4 shrink-0" />
            Regarding order <span className="font-semibold">#{lockedOrder.order_number}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {selCat!.sub_categories.length > 0 && (
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Specific issue</label>
            <select className={INPUT} value={form.sub_category}
              onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))}>
              <option value="">Select specific issue (optional)</option>
              {selCat!.sub_categories.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subject *</label>
          <input className={INPUT} value={form.subject} maxLength={255}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder={selCat!.sub_categories[0] || 'Brief summary of your issue'} />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Description * <span className="font-normal normal-case">(min 20 characters)</span>
          </label>
          <textarea className={TEXTAREA} rows={5} value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe your issue in detail. Include order numbers, error messages, or steps that led to the problem..." />
          <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{form.description.length} chars</p>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Urgency</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {meta.priorities.map(p => (
              <button key={p.code} type="button"
                onClick={() => setForm(f => ({ ...f, priority: p.code }))}
                className={cn(
                  'flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition-all',
                  (form.priority || selCat!.default_priority) === p.code
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 hover:border-muted-foreground'
                )}>
                <div className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[p.code] || 'bg-muted-foreground')} />
                <span className="text-xs font-medium capitalize text-foreground">{p.code}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Attachments <span className="font-normal normal-case">(images, PDF, video — max 10MB each, up to 5)</span>
          </label>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <span className="shrink-0 text-muted-foreground">{fileIcon(f.type)}</span>
                <span className="flex-1 truncate text-foreground">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {fileError && (
              <p className="flex items-center gap-1 text-[10px] text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {fileError}
              </p>
            )}
            {files.length < 5 && (
              <>
                <input ref={fileRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden"
                  onChange={e => addFiles(e.target.files)} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  <Paperclip className="h-3.5 w-3.5" /> Attach file
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t border-border/50 px-5 py-4">
        <button onClick={onClose} className="flex-1 rounded-xl border border-border/60 py-2.5 text-sm text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <button onClick={submit} disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit ticket
        </button>
      </div>
    </>
  )
}

// ─── Ticket Detail ──────────────────────────────────────────────────────────

function TicketDetailModal({ ticket, onClose, onReplied }: {
  ticket: Ticket; onClose: () => void; onReplied: () => void
}) {
  const [detail,       setDetail]       = useState<TicketDetail | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [replyText,    setReplyText]    = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyError,   setReplyError]   = useState('')

  const load = useCallback(() => {
    return fetch(`/api/customer/support/${ticket.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setDetail(j.data) })
  }, [ticket.id])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  // Light polling for new agent replies while the conversation is open.
  useEffect(() => {
    const interval = setInterval(() => { load() }, 15000)
    return () => clearInterval(interval)
  }, [load])

  async function sendReply() {
    if (!replyText.trim()) return
    setReplySending(true); setReplyError('')
    try {
      const res = await fetch(`/api/customer/support/${ticket.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText.trim() }), credentials: 'include',
      })
      const json = await res.json()
      if (!json.success) { setReplyError(json.error || 'Failed'); return }
      setReplyText('')
      await load()
      onReplied()
    } catch { setReplyError('Failed to send') }
    finally { setReplySending(false) }
  }

  const isTerminal = detail?.ticket?.status_is_terminal

  return (
    <SheetModal onClose={onClose} widthClass="sm:max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-4 shrink-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{ticketRef(ticket.id)}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_STYLES[ticket.status] || 'bg-muted text-muted-foreground')}>
              {ticket.status.replace('_', ' ')}
            </span>
            <div className="flex items-center gap-1">
              <div className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[ticket.priority] || 'bg-muted-foreground')} />
              <span className="text-[10px] capitalize text-muted-foreground">{ticket.priority}</span>
            </div>
            {ticket.sla_breached && (
              <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-600">
                <AlertTriangle className="h-2.5 w-2.5" /> SLA breached
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{ticket.subject}</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {ticket.category_icon} {ticket.category_label}
            {ticket.order_number && ` · Order #${ticket.order_number}`}
            {' · '}Raised {timeAgo(ticket.created_at)}
          </p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">Failed to load ticket details</p>
        ) : (
          <>
            <div className="rounded-xl bg-muted/30 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your message</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{detail.ticket.description}</p>
            </div>

            {detail.attachments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Attachments ({detail.attachments.length})</p>
                <div className="space-y-2">
                  {detail.attachments.map(a => (
                    <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                      <span className="shrink-0 text-muted-foreground">{fileIcon(a.content_type)}</span>
                      <span className="flex-1 truncate text-foreground">{a.filename}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                      {a.url && (
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:underline">
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.comments.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Conversation</p>
                {detail.comments.map(c => (
                  <div key={c.id} className={cn('flex gap-3', c.author_role === 'reporter' && 'flex-row-reverse')}>
                    <div className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      c.author_role === 'reporter' ? 'bg-primary/10 text-primary' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                    )}>
                      {c.author_role === 'reporter' ? 'Y' : c.author_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex max-w-[80%] flex-1 flex-col gap-1">
                      <div className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                        c.author_role === 'reporter'
                          ? 'self-end rounded-tr-sm bg-primary text-primary-foreground'
                          : 'self-start rounded-tl-sm bg-muted text-foreground'
                      )}>
                        {c.body}
                      </div>
                      <p className={cn('px-1 text-[10px] text-muted-foreground', c.author_role === 'reporter' && 'self-end')}>
                        {c.author_role === 'reporter' ? 'You' : c.author_name} · {timeAgo(c.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detail.status_history.length > 1 && (
              <details className="group">
                <summary className="flex list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                  Status history ({detail.status_history.length})
                </summary>
                <div className="mt-2 space-y-1.5 border-l border-border/60 pl-4">
                  {detail.status_history.map((h, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground">
                      {h.from_status
                        ? <><span>{h.from_status.replace('_', ' ')}</span> → <strong className="text-foreground">{h.to_status.replace('_', ' ')}</strong></>
                        : <><strong className="text-foreground">Created</strong> as {h.to_status.replace('_', ' ')}</>}
                      {h.note && <span className="ml-1 italic">({h.note})</span>}
                      <span className="ml-2">{timeAgo(h.created_at)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {isTerminal && (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/10">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <p className="text-xs text-green-700 dark:text-green-400">
                  This ticket is {detail.ticket.status}. If the issue persists, please raise a new ticket.
                </p>
              </div>
            )}
            {ticket.status === 'open' && detail.comments.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
                <Clock className="h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  Your ticket is in the queue. Our team typically responds within 24 hours.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && detail && !isTerminal && (
        <div className="shrink-0 space-y-2 border-t border-border/50 px-5 py-4">
          {replyError && <p className="text-xs text-destructive">{replyError}</p>}
          <div className="flex gap-2">
            <textarea rows={2} value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) sendReply() }}
              placeholder="Add a reply… (Ctrl+Enter to send)"
              className={`flex-1 ${TEXTAREA}`} />
            <button onClick={sendReply} disabled={replySending || !replyText.trim()}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {replySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </SheetModal>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function CustomerSupportContent() {
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [view,         setView]         = useState<'list' | 'new' | 'success'>('list')
  const [meta,         setMeta]         = useState<{ categories: Category[]; priorities: Priority[]; statuses: Status[] } | null>(null)
  const [tickets,      setTickets]      = useState<Ticket[]>([])
  const [pagination,   setPagination]   = useState<any>(null)
  const [loading,      setLoading]      = useState(true)
  const [metaLoading,  setMetaLoading]  = useState(true)
  const [error,        setError]        = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [successRef,   setSuccessRef]   = useState('')
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [lockedOrder,  setLockedOrder]  = useState<{ id: string; order_number: string } | null>(null)
  const [prefillHandled, setPrefillHandled] = useState(false)

  useEffect(() => {
    fetch('/api/customer/support/meta', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setMeta(j.data) })
      .catch(() => {})
      .finally(() => setMetaLoading(false))
  }, [])

  // ?category=order&order_id=123 from the order details page's "Get Help" button.
  useEffect(() => {
    if (prefillHandled) return
    const orderId = searchParams.get('order_id')
    const category = searchParams.get('category')
    if (!category) { setPrefillHandled(true); return }

    if (orderId) {
      fetch(`/api/customer/orders/${orderId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(j => {
          if (j.success) setLockedOrder({ id: j.data.order.id, order_number: j.data.order.order_number })
        })
        .catch(() => {})
        .finally(() => { setView('new'); setPrefillHandled(true) })
    } else {
      setView('new'); setPrefillHandled(true)
    }
  }, [searchParams, prefillHandled])

  const lockedCategory = searchParams.get('category') || undefined

  const fetchTickets = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams({ page: String(page), limit: '10' })
      if (statusFilter) p.set('status', statusFilter)
      const res  = await fetch(`/api/customer/support?${p}`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setTickets(json.data.tickets)
      setPagination(json.data.pagination)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [page, statusFilter])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  function handleNewSuccess(id: number, ref: string) {
    setSuccessRef(ref); setView('success'); setLockedOrder(null); fetchTickets()
    toast({ title: 'Ticket raised', description: `Reference ${ref}` })
  }

  function startNewTicket() {
    setLockedOrder(null)
    setView('new')
  }

  const activeCount = tickets.filter(t => ['open', 'in_progress', 'reopened'].includes(t.status)).length

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:py-8">
      {/* Header */}
      <Link href="/customer/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <LifeBuoy className="h-6 w-6 text-primary" /> Support
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Raise a ticket and track its status here</p>
        </div>
      </div>

      {view === 'success' && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/50 bg-card py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Ticket raised!</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Our team will respond within 24 hours.</p>
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-3">
            <p className="text-xs text-muted-foreground">Your reference</p>
            <p className="font-mono text-xl font-bold text-primary">{successRef}</p>
          </div>
          <button onClick={() => setView('list')}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90">
            View my tickets
          </button>
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {pagination?.total || 0} tickets
              {activeCount > 0 && <span className="ml-2 font-medium text-primary">· {activeCount} active</span>}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={fetchTickets}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3 w-3" />
              </button>
              <button onClick={startNewTicket}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Raise a ticket
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border/50">
            <button onClick={() => { setStatusFilter(''); setPage(1) }}
              className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
                !statusFilter ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              All
            </button>
            {meta?.statuses.map(s => (
              <button key={s.code} onClick={() => { setStatusFilter(s.code); setPage(1) }}
                className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium capitalize transition-colors',
                  statusFilter === s.code ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {s.code.replace('_', ' ')}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-16 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">No tickets yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Need help with an order or your account?</p>
              <button onClick={startNewTicket}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                <Plus className="h-3.5 w-3.5" /> Raise a ticket
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map(t => (
                <button key={t.id} onClick={() => setDetailTicket(t)}
                  className="w-full rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{ticketRef(t.id)}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', STATUS_STYLES[t.status] || 'bg-muted text-muted-foreground')}>
                          {t.status.replace('_', ' ')}
                        </span>
                        {t.sla_breached && <span className="text-[10px] font-medium text-red-600">SLA breached</span>}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{t.subject}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                        <span>{t.category_icon} {t.category_label}</span>
                        {t.order_number && <span>· Order #{t.order_number}</span>}
                        <span>· {timeAgo(t.created_at)}</span>
                        {t.reply_count > 0 && (
                          <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" /> {t.reply_count}</span>
                        )}
                        {t.attachment_count > 0 && (
                          <span className="flex items-center gap-0.5"><Paperclip className="h-2.5 w-2.5" /> {t.attachment_count}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1">
                        <div className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[t.priority] || 'bg-muted-foreground')} />
                        <span className="text-[10px] capitalize text-muted-foreground">{t.priority}</span>
                      </div>
                      {t.first_response_at
                        ? <span className="flex items-center gap-0.5 text-[10px] text-green-600"><CheckCircle2 className="h-2.5 w-2.5" /> Responded</span>
                        : t.status === 'open' ? <span className="flex items-center gap-0.5 text-[10px] text-amber-600"><Clock className="h-2.5 w-2.5" /> Awaiting</span>
                        : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {pagination && pagination.total_pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Page {page} of {pagination.total_pages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.has_next}
                  className="rounded-lg border border-border/60 p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {view === 'new' && (
          <SheetModal onClose={() => setView('list')} widthClass="sm:max-w-xl">
            {metaLoading || !meta ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <NewTicketForm
                meta={meta}
                onSuccess={handleNewSuccess}
                onClose={() => setView('list')}
                lockedCategory={lockedCategory}
                lockedOrder={lockedOrder}
              />
            )}
          </SheetModal>
        )}
        {detailTicket && (
          <TicketDetailModal
            ticket={detailTicket}
            onClose={() => setDetailTicket(null)}
            onReplied={fetchTickets}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function CustomerSupportPage() {
  return (
    <SearchParamProvider>
      <CustomerSupportContent />
    </SearchParamProvider>
  )
}
