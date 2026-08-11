'use client'
// app/customer/orders/[id]/page.tsx

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { format, addDays, startOfDay } from 'date-fns'
import {
  ArrowLeft, Package, MapPin, Store, Calendar, Clock,
  Receipt, CreditCard, Zap, CheckCircle, XCircle, Truck,
  ChevronRight, ChevronDown, Loader2, AlertCircle, Edit2, X,
  Phone, Shield, RefreshCw, Info,
  Download, Ban, Camera, ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { launchGatewayCheckout } from '@/lib/payment-client'
import { ProductIcon } from '@/components/customer/ProductIcon'
import { resolveProductIconSrc } from '@/lib/product-icons'

// ---- Types --------------------------------------------------
interface OrderDetail {
  id: string; order_number: string; status: string; assignment_status: string
  pickup_address: any; delivery_address: any
  pickup_date: string; pickup_time_slot: string
  delivery_date: string | null; delivery_time_slot: string | null
  estimated_delivery_date: string | null
  delivered_at: string | null
  rejection_reason: string | null; rejected_at: string | null
  special_instructions: string | null; is_express: boolean
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  original_subtotal: number | null; original_total_amount: number | null
  modified_by_delivery: boolean; delivery_modified_at: string | null
  amount_paid: number; balance_due: number
  payment_status: string; payment_method: string
  created_at: string; updated_at: string; can_reschedule: boolean; can_cancel: boolean
  // Actual money returned — NOT the same as a payment row's amount, which
  // stays at the captured value even once its status flips to 'refunded'.
  refund?: { wallet: number; gateway: number; total: number; feesRetained: number }
  provider: { id: number; name: string; address: string; city: string; phone: string } | null
  delivery_partner: { name: string; phone: string } | null
}

interface GarmentClaim {
  id: number; order_item_id: number; claim_type: 'damaged' | 'lost' | 'stolen'
  description: string; status: string; cleaning_charge_snapshot: number; cap_amount: number
  compensation_amount: number | null; decision_note: string | null; created_at: string
  paid_at: string | null
  provider_comment: string | null; provider_decided_at: string | null
  provider_name: string | null
}

// Customer-friendly labels + styling per claim status (new multi-stage flow)
const CLAIM_STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted:         { label: 'Awaiting laundry review',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  under_review:      { label: 'Under review',              cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  provider_approved: { label: 'Approved by laundry',       cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  provider_rejected: { label: 'Rejected by laundry',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  amount_issued:     { label: 'Compensation processing',   cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' },
  approved:          { label: 'Approved',                  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  paid:              { label: 'Credited to wallet',        cls: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  rejected:          { label: 'Rejected',                  cls: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
}

interface ItemProtectionPolicy {
  multiplier: number; max_cap_amount: number; claim_window_hours: number; is_active: boolean
}

interface OrderItem {
  id: number; quantity: number; weight_kg: number | null; garment_label: string | null
  item_status: string | null; modification_note: string | null
  product_type_name: string; icon: string
  service_id: number; service_name: string; service_category: string
  unit_price: number; line_total: number; is_express: boolean; express_multiplier: number
}

interface Payment {
  id: number; amount: number; payment_method: string; provider: string | null; status: string
  transaction_id: string | null; created_at: string
}

interface Adjustment {
  id: number; kind: string; amount: number; note: string; created_at: string
  metadata?: { fee_code?: string; coupon_code?: string; is_free?: boolean }
}
interface StatusEntry { status: string; notes: string | null; created_at: string; changed_by_name: string | null }

// ---- Status config ------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; step: number }> = {
  pending:          { label: 'Order Placed',     color: 'text-amber-700',   bg: 'bg-amber-100 dark:bg-amber-950/40',   step: 1 },
  confirmed:        { label: 'Confirmed',        color: 'text-blue-700',    bg: 'bg-blue-100 dark:bg-blue-950/40',     step: 2 },
  assigned_for_pickup: { label: 'Delivery Partner Assigned', color: 'text-blue-700', bg: 'bg-blue-100 dark:bg-blue-950/40',     step: 2 },
  out_for_pickup:   { label: 'Partner On the Way for Pickup', color: 'text-cyan-700', bg: 'bg-cyan-100 dark:bg-cyan-950/40',   step: 3 },
  picked_up:        { label: 'Picked Up',        color: 'text-blue-700',  bg: 'bg-blue-100 dark:bg-blue-950/40', step: 3 },
  // Step 3, same as picked_up: the parcel has reached the laundry but nothing
  // has been cleaned yet (that's 'processing' → step 4 "Cleaning"). This was
  // step 7, which lit the entire tracker up to "Delivered" and made a freshly
  // dropped-off order look finished.
  at_laundry:       { label: 'Delivered to Laundry',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 3 },
  processing:       { label: 'Being Cleaned',    color: 'text-indigo-700',  bg: 'bg-indigo-100 dark:bg-indigo-950/40', step: 4 },
  ready_for_delivery:{ label: 'Ready for Delivery', color: 'text-teal-700',    bg: 'bg-teal-100 dark:bg-teal-950/40',     step: 5 },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-emerald-700', bg: 'bg-emerald-100 dark:bg-emerald-950/40', step: 6 },
  delivered:        { label: 'Delivered',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 7 },
  completed:        { label: 'Completed',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 8 },
  cancelled:        { label: 'Cancelled',        color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40',       step: -1 },
  failed:           { label: 'Order Failed',     color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40',       step: -1 },
  rejected:         { label: 'Rejected',         color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40',       step: -1 },
  // returned:         { label: 'Returned',         color: 'text-orange-700',  bg: 'bg-orange-100 dark:bg-orange-950/40', step: -1 },
}

const PROGRESS_STEPS = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'processing', label: 'Cleaning' },
  { key: 'ready_for_delivery', label: 'Ready for Delivery' },
  { key: 'out_for_delivery', label: 'Delivery' },
  { key: 'delivered', label: 'Delivered' },
]

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
// Human-readable payment method label
function methodLabel(pm: string): string {
  const map: Record<string, string> = {
    wallet: 'Wallet', cod: 'Cash on Delivery', upi: 'UPI',
    card: 'Card', 'wallet+cod': 'Wallet + COD', 'wallet+upi': 'Wallet + UPI',
  }
  return map[pm.toLowerCase()] ?? pm.replace(/[_+]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---- Section card -------------------------------------------
function Section({ title, icon: Icon, children, className, collapsible = false, defaultOpen = false }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string
  collapsible?: boolean; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card overflow-hidden', className)}>
      <div
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
        className={cn(
          'flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3.5 py-2',
          collapsible && 'cursor-pointer select-none'
        )}>
        <Icon className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground flex-1">{title}</h3>
        {collapsible && (
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        )}
      </div>
      {collapsible ? (
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
              className="overflow-hidden">
              <div className="p-3.5">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="p-3.5">{children}</div>
      )}
    </div>
  )
}

// ---- Reschedule modal ---------------------------------------
function RescheduleModal({
  orderId, providerId, currentDate, currentSlot, onClose, onSuccess, onCancelled,
}: {
  orderId: string; providerId: number | null; currentDate: string; currentSlot: string
  onClose: () => void; onSuccess: (date: string, slot: string, estimatedDeliveryDate: string | null) => void
  onCancelled: (message: string) => void
}) {
  const { toast }         = useToast()
  const [selectedDate, setSelectedDate] = useState<string>(currentDate)
  const [selectedSlot, setSelectedSlot] = useState<string>(currentSlot)
  const [saving,       setSaving]       = useState(false)
  const [closedDates,  setClosedDates]  = useState<string[]>([])
  const [closedWeekdays, setClosedWeekdays] = useState<Set<number>>(new Set())
  const availableDates = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i + 1))

  // Which dates the provider isn't taking pickups on — mirrors the same
  // check already enforced on the provider-selection and checkout steps of
  // order creation, previously missing here entirely.
  useEffect(() => {
    if (!providerId) return
    fetch(`/api/customer/laundry-providers/${providerId}/closed-dates`)
      .then(r => r.json())
      .then(j => { if (j.success) setClosedDates(j.data?.closed_dates ?? []) })
      .catch(() => {})

    fetch(`/api/customer/laundry-providers/${providerId}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          const closed = (j.data?.operating_hours ?? [])
            .filter((h: { is_closed: boolean }) => h.is_closed)
            .map((h: { day_of_week: number }) => h.day_of_week)
          setClosedWeekdays(new Set(closed))
        }
      })
      .catch(() => {})
  }, [providerId])

  const isDateClosed = (d: Date) =>
    closedDates.includes(format(d, 'yyyy-MM-dd')) || closedWeekdays.has(d.getDay())

  const TIME_SLOTS = [
    { id: 'morning',   label: 'Morning',   range: '09:00 – 12:00', value: '09:00-12:00' },
    { id: 'afternoon', label: 'Afternoon', range: '12:00 – 15:00', value: '12:00-15:00' },
    { id: 'evening',   label: 'Evening',   range: '15:00 – 18:00', value: '15:00-18:00' },
  ]

  const handleSave = async () => {
    if (!selectedDate || !selectedSlot) return
    setSaving(true)
    try {
      const res  = await fetch(`/api/customer/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pickup_date: selectedDate, pickup_time_slot: selectedSlot }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to reschedule')
      if (json.data.cancelled) {
        toast({ title: 'Order Cancelled', description: json.data.message })
        onCancelled(json.data.message)
        return
      }
      toast({ title: 'Pickup Rescheduled ✓', description: `New date: ${formatDate(selectedDate)}` })
      onSuccess(selectedDate, selectedSlot, json.data.estimated_delivery_date ?? null)
    } catch (err: any) {
      toast({ title: 'Reschedule failed', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Reschedule Pickup</h2>
            <p className="text-xs text-muted-foreground">Choose a new date and time slot</p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Date picker */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Select Date
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {availableDates.map(date => {
              const ds       = format(date, 'yyyy-MM-dd')
              const isActive = selectedDate === ds
              const isClosed = isDateClosed(date)
              return (
                <button key={ds} type="button" disabled={isClosed}
                  onClick={() => { if (!isClosed) setSelectedDate(ds) }}
                  className={cn(
                    'flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-all',
                    isClosed
                      ? 'cursor-not-allowed border-border/30 bg-muted/30 opacity-40'
                      : isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/50 bg-card hover:border-primary/40'
                  )}>
                  <span className={cn('text-[10px] font-medium', isActive && !isClosed ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {format(date, 'EEE')}
                  </span>
                  <span className={cn('text-base font-bold', isActive && !isClosed ? 'text-primary-foreground' : 'text-foreground')}>
                    {format(date, 'd')}
                  </span>
                  <span className={cn('text-[10px]', isActive && !isClosed ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {format(date, 'MMM')}
                  </span>
                  {isClosed && (
                    <span className="mt-1 rounded-full bg-destructive/20 px-1 py-0.5 text-[8px] text-destructive">
                      Closed
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Time slots */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Select Time Slot
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map(slot => {
              const isActive = selectedSlot === slot.value
              return (
                <button key={slot.id} type="button" onClick={() => setSelectedSlot(slot.value)}
                  className={cn(
                    'flex flex-col items-center rounded-xl border px-2 py-3 text-center transition-all',
                    isActive
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border/50 bg-card hover:border-primary/30'
                  )}>
                  <span className={cn('text-sm font-bold', isActive ? 'text-primary' : 'text-foreground')}>
                    {slot.label}
                  </span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">{slot.range}</span>
                  {isActive && <CheckCircle className="mt-1 h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>

        {selectedDate && isDateClosed(new Date(selectedDate + 'T00:00:00')) && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Provider is closed on this date. Please select another.
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="button" onClick={handleSave}
            disabled={saving || !selectedDate || !selectedSlot || isDateClosed(new Date(selectedDate + 'T00:00:00'))}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Cancel order modal ---------------------------------------
function CancelOrderModal({
  orderId, payments, onClose, onSuccess,
}: {
  orderId: string; payments: Payment[]
  onClose: () => void; onSuccess: (message: string) => void
}) {
  const { toast }     = useToast()
  const [reason,   setReason]   = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [refundMethod, setRefundMethod] = useState<'wallet' | 'original'>('wallet')

  // What was actually captured, by source (mirrors the backend's
  // getRefundBreakdown). The wallet-paid slice can only return to the
  // wallet; only the gateway slice offers a destination choice — this is
  // what gives wallet+online split orders the choice too.
  const completed   = payments.filter(p => p.status === 'completed')
  const walletPaid  = completed.filter(p => p.payment_method === 'wallet').reduce((s, p) => s + p.amount, 0)
  const gatewayPaid = completed.filter(p => ['payu', 'cashfree'].includes(p.provider || '')).reduce((s, p) => s + p.amount, 0)
  const totalRefundable = walletPaid + gatewayPaid
  const willRefund = totalRefundable > 0
  const canRefundToOriginal = gatewayPaid > 0

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Please tell us why you\'re cancelling this order')
      return
    }
    setCancelling(true)
    setError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: reason.trim(),
          refund_method: canRefundToOriginal ? refundMethod : undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to cancel order')
      toast({ title: 'Order Cancelled', description: json.data.message })
      onSuccess(json.data.message)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40">
              <Ban className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Cancel Order</h2>
              <p className="text-xs text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Are you sure you want to cancel this order?
          {willRefund && !canRefundToOriginal && (
            <> ₹{totalRefundable.toFixed(2)} will be credited to your Laundrease wallet.</>
          )}
        </p>

        {canRefundToOriginal && (
          <div className="mb-4 space-y-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refund ₹{gatewayPaid.toFixed(2)} to
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'wallet' as const, label: 'Laundrease wallet', hint: 'Instant credit' },
                { key: 'original' as const, label: 'Original payment method', hint: '5-7 business days' },
              ].map(opt => {
                const selected = refundMethod === opt.key
                return (
                  <button key={opt.key} type="button" onClick={() => setRefundMethod(opt.key)}
                    aria-pressed={selected}
                    className={`relative rounded-xl border-2 p-3 pr-8 text-left transition-all
                      ${selected
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/25 shadow-sm'
                        : 'border-border/50 hover:border-border hover:bg-muted'}`}>
                    {selected && (
                      <CheckCircle className="absolute right-2 top-2 h-4 w-4 text-primary"/>
                    )}
                    <p className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.hint}</p>
                  </button>
                )
              })}
            </div>
            {walletPaid > 0 && (
              <p className="text-[11px] text-muted-foreground">
                ₹{walletPaid.toFixed(2)} paid from your wallet will be credited back to your wallet in both cases.
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason <span className="text-red-600">*</span>
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            required
            placeholder="Let us know why you're cancelling…"
            className="w-full resize-none rounded-xl border border-border/50 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={cancelling}
            className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            Keep Order
          </button>
          <button type="button" onClick={handleConfirm} disabled={cancelling || !reason.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-red-700">
            {cancelling ? <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling...</> : 'Yes, Cancel Order'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Claim status detail modal --------------------------------
// Shows the customer where their report stands: a stage timeline, the
// laundry provider's decision comment, and the credited amount once paid.
function ClaimStatusModal({ claim, itemName, onClose }: {
  claim: GarmentClaim; itemName: string; onClose: () => void
}) {
  const meta = CLAIM_STATUS_META[claim.status] ?? { label: claim.status.replace(/_/g, ' '), cls: 'bg-muted text-foreground' }
  const isRejected = ['provider_rejected', 'rejected'].includes(claim.status)

  // Ordered stages for the progress timeline (rejection short-circuits it)
  const stages = [
    { key: 'submitted', label: 'Report submitted', done: true, at: claim.created_at },
    {
      key: 'provider',
      label: isRejected && claim.status === 'provider_rejected' ? 'Rejected by laundry provider' : 'Laundry provider review',
      done: !!claim.provider_decided_at || ['provider_approved', 'amount_issued', 'paid', 'approved'].includes(claim.status),
      at: claim.provider_decided_at,
      failed: claim.status === 'provider_rejected',
    },
    {
      key: 'amount',
      label: 'Compensation determined',
      done: ['amount_issued', 'paid'].includes(claim.status),
      at: null,
      hidden: isRejected,
    },
    {
      key: 'paid',
      label: claim.compensation_amount != null && claim.status === 'paid'
        ? `${formatINR(claim.compensation_amount)} credited to your wallet`
        : 'Amount credited to wallet',
      done: claim.status === 'paid',
      at: claim.paid_at,
      hidden: isRejected,
    },
  ].filter(s => !('hidden' in s && s.hidden))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Your report — {itemName}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground"/></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
            <span className="text-xs text-muted-foreground capitalize">{claim.claim_type} item</span>
          </div>

          {/* Timeline */}
          <div className="space-y-0">
            {stages.map((s, i) => (
              <div key={s.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0
                    ${('failed' in s && s.failed) ? 'bg-red-100 dark:bg-red-900/20'
                      : s.done ? 'bg-green-100 dark:bg-green-900/20' : 'bg-muted'}`}>
                    {('failed' in s && s.failed)
                      ? <XCircle className="w-3.5 h-3.5 text-red-600"/>
                      : s.done
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-600"/>
                        : <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"/>}
                  </div>
                  {i < stages.length - 1 && <div className="w-0.5 h-6 bg-border"/>}
                </div>
                <div className="pt-0.5 pb-2">
                  <p className={`text-sm ${s.done ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                  {s.at && <p className="text-[10px] text-muted-foreground">{formatDateTime(s.at)}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Your description */}
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">What you reported</p>
            <p className="text-sm text-foreground">{claim.description}</p>
          </div>

          {/* Provider's comment */}
          {claim.provider_comment && (
            <div className={`rounded-xl p-3 border ${claim.status === 'provider_rejected'
              ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'}`}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                {claim.provider_name || 'Laundry provider'}&apos;s response
              </p>
              <p className={`text-sm ${claim.status === 'provider_rejected' ? 'text-red-700 dark:text-red-400' : 'text-blue-800 dark:text-blue-300'}`}>
                {claim.provider_comment}
              </p>
            </div>
          )}

          {claim.status === 'paid' && claim.compensation_amount != null && (
            <div className="rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-400">
              {formatINR(claim.compensation_amount)} has been credited to your Laundrease wallet. Thank you for your patience.
            </div>
          )}
          {claim.status === 'provider_rejected' && (
            <p className="text-[11px] text-muted-foreground">
              This decision is final. If you believe it is incorrect, please reach out to our support team from the Help section.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- All reported items — consolidated list ------------------
// The per-item badge (in Services & Items) is easy to miss once there's
// more than a couple of items — this surfaces every claim on the order in
// one place, each row opening the same ClaimStatusModal for full detail.
function AllClaimsModal({ claims, items, onSelect, onClose }: {
  claims: GarmentClaim[]
  items: OrderItem[]
  onSelect: (entry: { claim: GarmentClaim; itemName: string }) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Reported items ({claims.length})</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground"/></button>
        </div>

        <div className="space-y-2">
          {claims.map(claim => {
            const item = items.find(i => i.id === claim.order_item_id)
            const itemName = item?.product_type_name ?? 'Item'
            const meta = CLAIM_STATUS_META[claim.status] ?? { label: claim.status.replace(/_/g, ' '), cls: 'bg-muted text-foreground' }
            return (
              <button key={claim.id} onClick={() => onSelect({ claim, itemName })}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/50 p-3 text-left transition-colors hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{itemName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{claim.claim_type} · reported {formatDateTime(claim.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground"/>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- Report an issue modal (item-protection claim) -----------
function ReportIssueModal({
  orderId, item, policy, onClose, onSuccess,
}: {
  orderId: string; item: OrderItem; policy: ItemProtectionPolicy
  onClose: () => void; onSuccess: () => void
}) {
  const [claimType, setClaimType] = useState<'damaged' | 'lost' | 'stolen'>('damaged')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const estimatedCap = Math.min(item.line_total * policy.multiplier, policy.max_cap_amount)

  function addPhotos(incoming: FileList | null) {
    if (!incoming) return
    const toAdd = Array.from(incoming).slice(0, 5 - photos.length)
    setPhotos(prev => [...prev, ...toAdd])
  }

  async function handleSubmit() {
    if (!description.trim() || description.trim().length < 10) {
      setError('Please describe what happened (min 10 characters)'); return
    }
    setSaving(true); setError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${orderId}/claims`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ order_item_id: item.id, claim_type: claimType, description: description.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to submit claim')

      const claimId = json.data.id
      for (const file of photos) {
        const fd = new FormData()
        fd.append('file', file)
        await fetch(`/api/customer/orders/${orderId}/claims/${claimId}/photos`, {
          method: 'POST', body: fd, credentials: 'include',
        }).catch(() => {})
      }
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40">
              <ShieldAlert className="h-4.5 w-4.5"/>
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Report an issue</h2>
              <p className="text-xs text-muted-foreground">{item.product_type_name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5"/>
          </button>
        </div>

        <div className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 px-3 py-2.5">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Up to <span className="font-bold">₹{estimatedCap.toFixed(2)}</span> compensation if approved
            ({policy.multiplier}× the service charge for this item, capped at ₹{policy.max_cap_amount.toLocaleString('en-IN')}).
          </p>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happened?</label>
          <div className="grid grid-cols-3 gap-2">
            {(['damaged', 'lost', 'stolen'] as const).map(t => (
              <button key={t} type="button" onClick={() => setClaimType(t)}
                className={`rounded-xl border-2 py-2 text-xs font-semibold capitalize transition-all
                  ${claimType === t ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={1000}
            placeholder="Describe the damage, or when/how you noticed it was missing…"
            className="w-full resize-none rounded-xl border border-border/50 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"/>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Photos <span className="normal-case font-normal">(optional, up to 5 — strengthens your claim)</span>
          </label>
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/50 py-4 text-xs text-muted-foreground cursor-pointer hover:border-primary/50">
            <Camera className="h-4 w-4"/> {photos.length > 0 ? `${photos.length} photo(s) selected` : 'Add photos'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
              onChange={e => addPhotos(e.target.files)} disabled={photos.length >= 5}/>
          </label>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0"/> {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-amber-700">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin"/> Submitting…</> : 'Submit claim'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ---- Main page ----------------------------------------------
export default function OrderDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const router    = useRouter()
  const { toast } = useToast()

  const [order,      setOrder]      = useState<OrderDetail | null>(null)
  const [items,      setItems]      = useState<OrderItem[]>([])
  const [payments,   setPayments]   = useState<Payment[]>([])
  const [adjustments,setAdjustments]= useState<Adjustment[]>([])
  const [history,    setHistory]    = useState<StatusEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showCancel,    setShowCancel]    = useState(false)
  // Invoice download state
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceError,   setInvoiceError]   = useState<string | null>(null)
  // fee_code → display_name from order_fee_config (loaded once)
  const [feeLabels,  setFeeLabels]  = useState<Record<string, string>>({})
  // Pay-online state (COD orders paying before delivery)
  const [payLoading, setPayLoading] = useState(false)
  const [payError,   setPayError]   = useState<string | null>(null)
  // Item-protection claims
  const [claims, setClaims] = useState<GarmentClaim[]>([])
  const [itemProtectionPolicy, setItemProtectionPolicy] = useState<ItemProtectionPolicy | null>(null)
  const [reportIssueItem, setReportIssueItem] = useState<OrderItem | null>(null)
  const [viewClaim, setViewClaim] = useState<{ claim: GarmentClaim; itemName: string } | null>(null)
  const [showAllClaims, setShowAllClaims] = useState(false)

  useEffect(() => {
    // Load fee labels from order_fee_config (once per page load)
    fetch('/api/customer/orders/fee-labels', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setFeeLabels(j.data.labels) })
      .catch(() => {})
  }, [])

  const fetchOrder = async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/customer/orders/${id}`, { credentials: 'include' })
      const json = await res.json()
      if (res.status === 404) { setError('Order not found'); return }
      if (!json.success) throw new Error(json.error ?? 'Failed')
      setOrder(json.data.order)
      setItems(json.data.items)
      setPayments(json.data.payments)
      setAdjustments(json.data.adjustments)
      setHistory(json.data.status_history)
      setClaims(json.data.claims || [])
      setItemProtectionPolicy(json.data.item_protection_policy || null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOrder() }, [id])

  const handleRescheduleSuccess = (date: string, slot: string, estimatedDeliveryDate: string | null) => {
    setOrder(prev => prev ? {
      ...prev, pickup_date: date, pickup_time_slot: slot,
      estimated_delivery_date: estimatedDeliveryDate ?? prev.estimated_delivery_date,
    } : prev)
    setShowReschedule(false)
  }
  const handleCancelSuccess = (message: string) => {
    setOrder(prev => prev ? { ...prev, status: 'cancelled', can_cancel: false, can_reschedule: false } : prev)
    setShowCancel(false)
  }
  // A reschedule can itself trigger an auto-cancellation once an order hits
  // 3 reschedules — the modal shows a toast for that case instead of the
  // normal "rescheduled" one, so this must NOT set a new pickup_date.
  const handleRescheduleCancelled = () => {
    setOrder(prev => prev ? { ...prev, status: 'cancelled', can_cancel: false, can_reschedule: false } : prev)
    setShowReschedule(false)
    fetchOrder()
  }

  // Pay online any time before delivery — eliminates needing a card/scanner
  // at the door for COD orders. Razorpay's modal stays in-app, so on success
  // we just refetch the order instead of navigating away; PayU/Cashfree
  // redirect the whole browser to the gateway and come back via the
  // existing server-side callback routes.
  const handlePayOnline = async () => {
    if (!order) return
    setPayLoading(true); setPayError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${order.id}/pay`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to initiate payment')

      await launchGatewayCheckout(json.data, {
        orderNumber: order.order_number,
        onRazorpaySuccess: async (paymentId, signature, gatewayOrderId) => {
          const vRes  = await fetch('/api/customer/payments/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
              order_id: order.id, gateway_order_id: gatewayOrderId,
              gateway_payment_id: paymentId, signature,
            }),
          })
          const vData = await vRes.json()
          if (!vData.success || !vData.data.verified) throw new Error('Payment verification failed')
          toast({ title: 'Payment successful ✓', description: 'Your order is now fully paid.' })
          fetchOrder()
        },
      })
    } catch (err: any) {
      setPayError(err.message || 'Payment failed. Please try again.')
    } finally {
      setPayLoading(false)
    }
  }
  const handleDownloadInvoice = async () => {
    if (!id) return
    setInvoiceLoading(true)
    setInvoiceError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${id}/invoice`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success || !json.data?.url) {
        setInvoiceError('Could not generate invoice. Please try again.')
        return
      }
      // Open pre-signed S3 URL — browser will download the PDF
      window.open(json.data.url, '_blank')
    } catch {
      setInvoiceError('Network error. Please try again.')
    } finally {
      setInvoiceLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-medium text-foreground">{error ?? 'Order not found'}</p>
        <Link href="/customer/orders"
          className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: 'text-foreground', bg: 'bg-muted', step: 0 }
  const isCancelled = order.status === 'cancelled' || order.status === 'returned' || order.status === 'failed' || order.status === 'rejected'
  const currentStep = statusCfg.step

  // Group items by service category for display
  const itemsByService = items.reduce<Record<string, OrderItem[]>>((acc, item) => {
    const key = item.service_name
    acc[key] = acc[key] ?? []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <>
      {/* Full-page payment redirect overlay */}
      {payLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/90 backdrop-blur-sm">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20"/>
            <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-primary"/>
          </div>
          <div className="text-center space-y-1.5 px-6">
            <p className="text-base font-semibold text-foreground">Connecting to payment partner…</p>
            <p className="text-sm text-muted-foreground">You will be redirected to our secure payment page shortly. Please do not close or refresh this tab.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-sm">
            <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            256-bit SSL encrypted &amp; secure
          </div>
        </div>
      )}

      <div className="container mx-auto max-w-5xl px-4 py-6">
        {/* Back + header */}
        <div className="mb-6">
          <Link
            href="/customer/orders"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All Orders
          </Link>
          <div className="space-y-3 md:space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="text-xl font-bold text-foreground font-mono">
                  #{order.order_number}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Placed {formatDateTime(order.created_at)}
                </p>
              </div>
              <div className="flex items-start gap-2 md:items-end md:justify-end">
                <span
                  className={cn(
                    'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                    statusCfg.bg,
                    statusCfg.color
                  )}
                >
                  {statusCfg.label}
                </span>
                {order.is_express && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    <Zap className="h-3 w-3" /> Express
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {/* No invoice for an order that never went through — nothing
                  was actually billed/serviced. */}
              {!isCancelled && (
                <button
                  onClick={handleDownloadInvoice}
                  disabled={invoiceLoading}
                  title="Download invoice as PDF"
                  aria-label="Download invoice as PDF"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:justify-start"
                >
                  {invoiceLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {/* Short label on mobile, longer on desktop */}
                  <span>
                    {invoiceLoading ? 'Generating Invoice…' : 'Download Invoice PDF'}
                  </span>
                </button>
              )}

              {claims.length > 0 && (
                <button
                  onClick={() => setShowAllClaims(true)}
                  title="View reported items"
                  aria-label="View reported items"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 shadow-sm transition-all hover:bg-amber-100 active:scale-95 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50 sm:w-auto sm:justify-start"
                >
                  <ShieldAlert className="h-4 w-4" />
                  <span>Reported Items ({claims.length})</span>
                </button>
              )}

              {order.can_cancel && (
                <button
                  onClick={() => setShowCancel(true)}
                  title="Cancel this order"
                  aria-label="Cancel this order"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition-all hover:bg-red-100 active:scale-95 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 sm:w-auto sm:justify-start"
                >
                  <Ban className="h-4 w-4" />
                  <span>Cancel Order</span>
                </button>
              )}
            </div>

            {/* Error (keep compact and visible below the button) */}
            {invoiceError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {invoiceError}
              </div>
            )}
          </div>
        </div>

        {/* Rejection banner — laundry provider declined this order before confirming it */}
        {order.status === 'rejected' && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                  This order was rejected by the laundry provider
                </p>
                {order.rejection_reason && (
                  <p className="text-sm text-red-700 dark:text-red-400">
                    <span className="font-medium">Reason: </span>{order.rejection_reason}
                  </p>
                )}
                <p className="text-sm text-red-700/90 dark:text-red-400/90">
                  {/* Quote what was actually refunded, not the order total.
                      A rejection returns the full captured amount (fees
                      included), but "captured" is below total_amount whenever
                      only part of the order was paid up front — e.g. a
                      wallet+COD split, where the COD leg was never collected. */}
                  {order.payment_status === 'refunded'
                    ? `₹${(order.refund?.total ?? order.total_amount).toLocaleString('en-IN')} has been credited to your Laundrease wallet. `
                    : order.payment_status === 'refund_processing'
                      ? `Your refund of ₹${(order.refund?.total ?? order.total_amount).toLocaleString('en-IN')} has been initiated to your original payment method (5–7 business days). `
                      : ''}
                  Please place a new order and we&apos;ll match you with another laundry provider.
                </p>
                <Link
                  href="/customer/orders/create"
                  className="mt-1 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                >
                  Place a New Order
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Progress tracker — hidden if cancelled/returned */}
        {!isCancelled && (
          <div className="mb-5 rounded-2xl border border-border/50 bg-card p-4">
            <div className="flex items-center justify-between">
              {PROGRESS_STEPS.map((step, i) => {
                const done    = currentStep > (i + 1)
                const active  = currentStep === (i + 1)
                const pending = currentStep < (i + 1)
                return (
                  <div key={step.key} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      {/* Connector left */}
                      {i > 0 && (
                        <div className={cn('h-0.5 flex-1', done || active ? 'bg-primary' : 'bg-border/50')} />
                      )}
                      <div className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                        done   ? 'bg-primary text-primary-foreground' :
                        active ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1' :
                        'bg-muted text-muted-foreground'
                      )}>
                        {done ? <CheckCircle className="h-4 w-4" /> : i + 1}
                      </div>
                      {/* Connector right */}
                      {i < PROGRESS_STEPS.length - 1 && (
                        <div className={cn('h-0.5 flex-1', done ? 'bg-primary' : 'bg-border/50')} />
                      )}
                    </div>
                    <span className={cn(
                      'mt-1.5 hidden text-[9px] font-medium sm:block',
                      active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground'
                    )}>
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          {/* Left column — content grows independently of the right column,
              so a short card here is never stretched by a taller card next
              to it (which is what a flat grid row-pairing used to do). */}
          <div className="flex flex-col gap-4">
          {/* Pickup & Delivery schedule — meaningless once the order never
              went through (cancelled/rejected/returned/failed), so hidden
              alongside the progress tracker for those statuses. */}
          {!isCancelled && (
            <Section title="Schedule" icon={Calendar}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pickup</p>
                  <p className="text-sm font-semibold text-foreground">{formatDate(order.pickup_date)}</p>
                  {order.pickup_time_slot && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" /> {order.pickup_time_slot}
                    </p>
                  )}
                  {/* Reschedule button */}
                  {order.can_reschedule && (
                    <button
                      type="button"
                      onClick={() => setShowReschedule(true)}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      <Edit2 className="h-3 w-3" /> Change date
                    </button>
                  )}
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery</p>
                  {order.delivered_at ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{formatDateTime(order.delivered_at)}</p>
                      <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">Delivered</p>
                    </>
                  ) : order.delivery_date ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{formatDate(order.delivery_date)}</p>
                      {order.delivery_time_slot && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {order.delivery_time_slot}
                        </p>
                      )}
                    </>
                  ) : order.estimated_delivery_date ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">{formatDate(order.estimated_delivery_date)}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Estimated — exact time slot confirmed once out for delivery</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">To be scheduled</p>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* Addresses */}
          <Section title="Addresses" icon={MapPin}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Pickup', addr: order.pickup_address, color: 'border-primary/20' },
                { label: 'Delivery', addr: order.delivery_address, color: 'border-emerald-200 dark:border-emerald-800' },
              ].map(({ label, addr, color }) => (
                <div key={label} className={cn('rounded-xl border p-3', color)}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  {addr ? (
                    <div className="text-sm">
                      {addr.label && <p className="font-semibold text-foreground">{addr.label}</p>}
                      <p className="text-muted-foreground">{addr.address_line1}</p>
                      <p className="text-muted-foreground">{addr.city} - {addr.postal_code}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Same as pickup</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Provider */}
          {order.provider && (
            <Section title="Laundry Provider" icon={Store}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{order.provider.name}</p>
                  {order.provider.city && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{order.provider.address ? `${order.provider.address}, ` : ''}{order.provider.city}</p>
                  )}
                </div>
                {order.provider.phone && (
                  <a href={`tel:${order.provider.phone}`}
                    className="flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
              </div>
              {order.delivery_partner && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/30 p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery Partner</p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{order.delivery_partner.name}</p>
                  </div>
                  {order.delivery_partner.phone && (
                    <a href={`tel:${order.delivery_partner.phone}`}
                      className="flex items-center gap-1.5 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
                      <Phone className="h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </div>
              )}
              {!isCancelled && order.assignment_status === 'unassigned' && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                  <Info className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">Delivery partner will be assigned soon</p>
                </div>
              )}
            </Section>
          )}

          {/* Services & Items */}
          <Section title="Services & Items" icon={Package}>
            {Object.entries(itemsByService).map(([serviceName, serviceItems]) => (
              <div key={serviceName} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">{serviceName}</p>
                <div className="space-y-2">
                  {serviceItems.map(item => {
                    const claim = claims.find(c => c.order_item_id === item.id)
                    const withinWindow = itemProtectionPolicy && order.delivered_at
                      ? (() => {
                          const deadline = new Date(order.delivered_at!)
                          deadline.setHours(deadline.getHours() + itemProtectionPolicy.claim_window_hours)
                          return new Date() <= deadline
                        })()
                      : false
                    // Per-kg items are a whole weighed batch, not one
                    // identifiable garment — no reliable way to verify a
                    // damage/loss claim against a single piece within it.
                    const canReportIssue = itemProtectionPolicy?.is_active
                      && ['delivered', 'completed'].includes(order.status)
                      && withinWindow
                      && !claim
                      && item.weight_kg == null

                    const claimMeta = claim
                      ? (CLAIM_STATUS_META[claim.status] ?? { label: claim.status.replace(/_/g, ' '), cls: 'bg-muted text-muted-foreground' })
                      : null

                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ProductIcon
                            src={resolveProductIconSrc(item.product_type_name)}
                            fallbackEmoji={item.icon ?? '🧺'}
                            alt={item.product_type_name}
                            size={28}
                            className="shrink-0 rounded-md"
                          />
                          <div className="min-w-0">
                            <p className={cn('truncate text-sm font-medium',
                              item.item_status === 'not_picked_up' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                              {item.product_type_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.weight_kg ? `${item.weight_kg} kg` : `×${item.quantity}`}
                              {item.is_express && <span className="ml-1 text-amber-600">· Express</span>}
                            </p>
                            {item.item_status === 'not_picked_up' && (
                              <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400"
                                title={item.modification_note || undefined}>
                                Not picked up
                              </span>
                            )}
                            {item.item_status === 'added_by_delivery' && (
                              <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                                title={item.modification_note || undefined}>
                                Added at pickup
                              </span>
                            )}
                            {claim && claimMeta && (
                              <button
                                onClick={() => setViewClaim({ claim, itemName: item.product_type_name })}
                                className={`mt-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold hover:opacity-80 transition-opacity ${claimMeta.cls}`}
                                title="View report status"
                              >
                                <span className="capitalize">{claim.claim_type}</span> report — {claimMeta.label}
                                <ChevronRight className="h-2.5 w-2.5"/>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={cn('text-sm font-semibold',
                            item.item_status === 'not_picked_up' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                            {formatINR(item.line_total)}
                          </span>
                          {canReportIssue && (
                            <button onClick={() => setReportIssueItem(item)}
                              className="flex items-center gap-1 text-[10px] font-medium text-amber-600 hover:underline">
                              <ShieldAlert className="h-3 w-3"/> Report an issue
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </Section>

          {/* Price breakdown — labels sourced from order_fee_config via feeLabels */}
          <Section title="Price Breakdown" icon={Receipt}>
            <div className="space-y-2 text-sm">
              {/* Subtotal */}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">{formatINR(order.subtotal)}</span>
              </div>

              {/* All positive adjustments (fees from order_fee_config) */}
              {adjustments
                .filter(a => a.amount > 0)
                .map(adj => {
                  // Read display_name from fee-labels API (keyed by metadata.fee_code)
                  // Fallback: use the note stored at order creation time
                  const feeCode = adj.metadata?.fee_code
                  const label   = (feeCode && feeLabels[feeCode]) ? feeLabels[feeCode] : adj.note
                  return (
                    <div key={adj.id} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-foreground">
                        {adj.metadata?.is_free ? 'Free' : `+${formatINR(adj.amount)}`}
                      </span>
                    </div>
                  )
                })
              }

              {/* Coupon discounts */}
              {adjustments
                .filter(a => a.amount < 0)
                .map(adj => (
                  <div key={adj.id} className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>{adj.note || 'Discount'}</span>
                    <span className="font-semibold">-{formatINR(Math.abs(adj.amount))}</span>
                  </div>
                ))
              }

              <div className="flex justify-between border-t border-border/40 pt-2.5 text-base">
                <span className="font-bold text-foreground">
                  Total
                  {order.modified_by_delivery && order.original_total_amount != null
                    && order.original_total_amount !== order.total_amount && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                      {formatINR(order.original_total_amount)}
                    </span>
                  )}
                </span>
                <span className="font-bold text-primary">{formatINR(order.total_amount)}</span>
              </div>

              {/* Paid vs balance — only interesting once the totals diverge */}
              {order.modified_by_delivery && order.amount_paid > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid so far</span>
                    <span className="font-medium text-emerald-600">{formatINR(order.amount_paid)}</span>
                  </div>
                  {order.balance_due > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance due</span>
                      <span className="font-semibold text-amber-600">{formatINR(order.balance_due)}</span>
                    </div>
                  )}
                  {order.amount_paid > order.total_amount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Overpaid (credited to wallet after pickup)</span>
                      <span className="font-semibold text-blue-600">{formatINR(Math.round((order.amount_paid - order.total_amount) * 100) / 100)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* Special instructions */}
          {order.special_instructions && (
            <Section title="Special Instructions" icon={Info}>
              <p className="text-sm text-muted-foreground">{order.special_instructions}</p>
            </Section>
          )}
          </div>

          {/* Right column — its own independent height, same reasoning as
              the left column above. */}
          <div className="flex flex-col gap-4">

          {/* Payment — shows split clearly for wallet+COD / wallet+UPI */}
          <Section title="Payment" icon={CreditCard}>
            {(() => {
              const NOT_PAYABLE = new Set(['delivered', 'completed', 'cancelled', 'returned', 'failed', 'rejected'])
              // A positive balance covers both classic COD orders and prepaid
              // orders whose total grew after items were modified at pickup.
              const canPayOnline = order.balance_due > 0
                && order.payment_status !== 'paid'
                && !NOT_PAYABLE.has(order.status)
              if (!canPayOnline) return null
              return (
                <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/20">
                  <p className="text-sm font-medium text-foreground">
                    {order.modified_by_delivery && order.amount_paid > 0
                      ? `Your order was updated at pickup — ₹${order.balance_due.toFixed(2)} is remaining to pay.`
                      : 'Skip the cash/card at the door — pay online any time before delivery.'}
                  </p>
                  {payError && <p className="mt-1.5 text-xs text-destructive">{payError}</p>}
                  <button onClick={handlePayOnline} disabled={payLoading}
                    className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-60">
                    {payLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {payLoading ? 'Processing…' : `Pay ${formatINR(order.balance_due)} Online Now`}
                  </button>
                </div>
              )
            })()}
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment records yet</p>
            ) : (
              <div className="space-y-3">
                {/* Refund summary. The payment rows below keep showing what was
                    CAPTURED — flipping one to 'refunded' never rewrites its
                    amount — so without this the card read "₹318.88 Refunded"
                    on an order where only ₹300 came back. */}
                {order.refund && order.refund.total > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Refunded</p>
                      <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                        {formatINR(order.refund.total)}
                      </p>
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-xs text-emerald-700/90 dark:text-emerald-400/90">
                      {order.refund.wallet > 0 && (
                        <p>{formatINR(order.refund.wallet)} credited to your wallet</p>
                      )}
                      {order.refund.gateway > 0 && (
                        <p>{formatINR(order.refund.gateway)} to your original payment method (5–7 business days)</p>
                      )}
                      {order.refund.feesRetained > 0 && (
                        <p className="text-muted-foreground">
                          {formatINR(order.refund.feesRetained)} in delivery and platform fees is non-refundable
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Split summary banner when multiple payment rows exist */}
                {payments.length > 1 && (
                  <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Payment Split</p>
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{methodLabel(p.payment_method)}</span>
                        <span className={cn('font-semibold',
                          p.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'
                        )}>{formatINR(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Individual payment rows */}
                {payments.map(p => {
                  const isWallet = p.payment_method === 'wallet'
                  const isCOD    = p.payment_method === 'cod'
                  const isPending = p.status === 'pending'
                  const isFailed  = p.status === 'failed'
                  return (
                    <div key={p.id} className={cn(
                      'flex items-start justify-between gap-3 rounded-xl px-4 py-3',
                      isWallet ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800' :
                      isCOD    ? 'bg-amber-50  dark:bg-amber-950/20  border border-amber-200  dark:border-amber-800'  :
                      'bg-muted/30'
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{methodLabel(p.payment_method)}</p>
                        {isWallet && p.status === 'completed' && (
                          <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">Paid from wallet balance</p>
                        )}
                        {isCOD && isPending && (
                          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">To be collected at delivery</p>
                        )}
                        {!isWallet && !isCOD && isPending && (
                          <p className="mt-0.5 text-xs text-muted-foreground">Awaiting payment</p>
                        )}
                        {p.transaction_id && (
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">Ref: {p.transaction_id.slice(-12)}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDateTime(p.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-foreground">{formatINR(p.amount)}</p>
                        {/* This row's amount is what was charged, not what came
                            back — say so, or the "Refunded" badge underneath
                            makes it read as the refund figure. */}
                        {p.status === 'refunded' && (
                          <p className="text-[10px] text-muted-foreground">amount paid</p>
                        )}
                        <span className={cn(
                          'mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          p.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : isFailed
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                            : isCOD
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                        )}>
                          {isCOD && isPending ? 'Pending Collection'
                            : p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Order Timeline — an accordion, collapsed by default. Every
              reschedule (customer, delivery partner, admin/support, or the
              automatic "not picked up" sweep) logs a note here, so this can
              grow long — hidden until the customer taps to expand it. */}
          <Section title={`Order Timeline (${history.length})`} icon={Clock} collapsible defaultOpen={false}>
            {(() => {
              const sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              return (
                <div className="relative space-y-3 pl-5">
                  <div className="absolute left-2 top-1 bottom-1 w-px bg-border/50" />
                  {sorted.map((entry, i) => {
                    const cfg = STATUS_CONFIG[entry.status] ?? { label: entry.status, bg: 'bg-muted', color: 'text-foreground' }
                    return (
                      <div key={i} className="relative flex gap-3">
                        <div className={cn('absolute -left-5 mt-0.5 h-4 w-4 rounded-full border-2 border-background', cfg.bg)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-semibold', cfg.color)}>{cfg.label}</span>
                            {entry.changed_by_name && (
                              <span className="text-[11px] text-muted-foreground">by {entry.changed_by_name}</span>
                            )}
                          </div>
                          {entry.notes && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.notes}</p>
                          )}
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </Section>

          </div>
        </div>

        {/* Help CTA — full width below both columns */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4">
          <Shield className="h-8 w-8 shrink-0 text-primary/40" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Need help with this order?</p>
            <p className="text-xs text-muted-foreground">Our support team is here for you</p>
          </div>
          <Link href={`/customer/support?category=order&order_id=${order.id}`}
            className="shrink-0 rounded-xl border border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
            Get Help
          </Link>
        </div>
      </div>

      {/* Reschedule modal */}
      <AnimatePresence>
        {showReschedule && (
          <RescheduleModal
            orderId={order.id}
            providerId={order.provider?.id ?? null}
            currentDate={order.pickup_date}
            currentSlot={order.pickup_time_slot}
            onClose={() => setShowReschedule(false)}
            onSuccess={handleRescheduleSuccess}
            onCancelled={handleRescheduleCancelled}
          />
        )}
      </AnimatePresence>

      {/* Cancel order modal */}
      <AnimatePresence>
        {showCancel && (
          <CancelOrderModal
            orderId={order.id}
            payments={payments}
            onClose={() => setShowCancel(false)}
            onSuccess={handleCancelSuccess}
          />
        )}
      </AnimatePresence>

      {/* Report an issue modal (item-protection claim) */}
      <AnimatePresence>
        {reportIssueItem && itemProtectionPolicy && (
          <ReportIssueModal
            orderId={order.id}
            item={reportIssueItem}
            policy={itemProtectionPolicy}
            onClose={() => setReportIssueItem(null)}
            onSuccess={() => {
              setReportIssueItem(null)
              toast({ title: 'Report submitted', description: 'The laundry provider will review it shortly' })
              fetchOrder()
            }}
          />
        )}
      </AnimatePresence>

      {/* All reported items — consolidated list */}
      {showAllClaims && (
        <AllClaimsModal
          claims={claims}
          items={items}
          onClose={() => setShowAllClaims(false)}
          onSelect={entry => { setShowAllClaims(false); setViewClaim(entry) }}
        />
      )}

      {/* Claim status detail modal */}
      {viewClaim && (
        <ClaimStatusModal
          claim={viewClaim.claim}
          itemName={viewClaim.itemName}
          onClose={() => setViewClaim(null)}
        />
      )}
    </>
  )
}
