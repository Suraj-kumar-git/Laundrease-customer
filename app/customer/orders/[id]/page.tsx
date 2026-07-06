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
  ChevronRight, Loader2, AlertCircle, Edit2, X,
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
  special_instructions: string | null; is_express: boolean
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  payment_status: string; payment_method: string
  created_at: string; updated_at: string; can_reschedule: boolean; can_cancel: boolean
  provider: { id: number; name: string; address: string; city: string; phone: string } | null
  delivery_partner: { name: string; phone: string } | null
}

interface GarmentClaim {
  id: number; order_item_id: number; claim_type: 'damaged' | 'lost' | 'stolen'
  description: string; status: string; cleaning_charge_snapshot: number; cap_amount: number
  compensation_amount: number | null; decision_note: string | null; created_at: string
}

interface ItemProtectionPolicy {
  multiplier: number; max_cap_amount: number; claim_window_hours: number; is_active: boolean
}

interface OrderItem {
  id: number; quantity: number; weight_kg: number | null; garment_label: string | null
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
  assigned_for_pickup: { label: 'Delivery Partner Assigned', color: 'text-blue-700', bg: 'bg-green-100 dark:bg-blue-950/40',     step: 2 },
  picked_up:        { label: 'Picked Up',        color: 'text-violet-700',  bg: 'bg-violet-100 dark:bg-violet-950/40', step: 3 },
  at_laundry:       { label: 'Delivered to Laundry',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 7 },
  processing:       { label: 'Being Cleaned',    color: 'text-indigo-700',  bg: 'bg-indigo-100 dark:bg-indigo-950/40', step: 4 },
  ready:            { label: 'Ready',            color: 'text-teal-700',    bg: 'bg-teal-100 dark:bg-teal-950/40',     step: 5 },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-emerald-700', bg: 'bg-emerald-100 dark:bg-emerald-950/40', step: 6 },
  delivered:        { label: 'Delivered',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 7 },
  completed:        { label: 'Completed',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40',   step: 8 },
  cancelled:        { label: 'Cancelled',        color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40',       step: -1 },
  failed:           { label: 'Order Failed',     color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40',       step: -1 },
  // returned:         { label: 'Returned',         color: 'text-orange-700',  bg: 'bg-orange-100 dark:bg-orange-950/40', step: -1 },
}

const PROGRESS_STEPS = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'processing', label: 'Cleaning' },
  { key: 'ready', label: 'Ready' },
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
function Section({ title, icon: Icon, children, className }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3.5 py-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  )
}

// ---- Reschedule modal ---------------------------------------
function RescheduleModal({
  orderId, currentDate, currentSlot, onClose, onSuccess,
}: {
  orderId: string; currentDate: string; currentSlot: string
  onClose: () => void; onSuccess: (date: string, slot: string, estimatedDeliveryDate: string | null) => void
}) {
  const { toast }         = useToast()
  const [selectedDate, setSelectedDate] = useState<string>(currentDate)
  const [selectedSlot, setSelectedSlot] = useState<string>(currentSlot)
  const [saving,       setSaving]       = useState(false)
  const availableDates = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(new Date()), i + 1))

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
              const ds      = format(date, 'yyyy-MM-dd')
              const isActive = selectedDate === ds
              return (
                <button key={ds} type="button" onClick={() => setSelectedDate(ds)}
                  className={cn(
                    'flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-all',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/50 bg-card hover:border-primary/40'
                  )}>
                  <span className={cn('text-[10px] font-medium', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {format(date, 'EEE')}
                  </span>
                  <span className={cn('text-base font-bold', isActive ? 'text-primary-foreground' : 'text-foreground')}>
                    {format(date, 'd')}
                  </span>
                  <span className={cn('text-[10px]', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                    {format(date, 'MMM')}
                  </span>
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

        {/* Actions */}
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-border/50 py-3 text-sm font-medium text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !selectedDate || !selectedSlot}
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
  orderId, totalAmount, paymentStatus, gatewayProvider, onClose, onSuccess,
}: {
  orderId: string; totalAmount: number; paymentStatus: string; gatewayProvider: string | null
  onClose: () => void; onSuccess: (message: string) => void
}) {
  const { toast }     = useToast()
  const [reason,   setReason]   = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [refundMethod, setRefundMethod] = useState<'wallet' | 'original'>('wallet')
  const willRefund = paymentStatus === 'paid'
  // Only PayU/Cashfree-paid orders can be refunded back to the original
  // method — wallet-paid or COD orders have nothing else to refund to.
  const canRefundToOriginal = willRefund && ['payu', 'cashfree'].includes(gatewayProvider || '')

  const handleConfirm = async () => {
    setCancelling(true)
    setError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reason: reason.trim() || undefined,
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
            <> ₹{totalAmount.toFixed(2)} will be credited to your Laundrease wallet.</>
          )}
        </p>

        {canRefundToOriginal && (
          <div className="mb-4 space-y-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Refund ₹{totalAmount.toFixed(2)} to
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'wallet' as const, label: 'Laundrease wallet', hint: 'Instant credit' },
                { key: 'original' as const, label: 'Original payment method', hint: '5-7 business days' },
              ].map(opt => (
                <button key={opt.key} type="button" onClick={() => setRefundMethod(opt.key)}
                  className={`rounded-xl border p-3 text-left transition-colors
                    ${refundMethod === opt.key ? 'border-primary bg-primary/5' : 'border-border/50 hover:bg-muted'}`}>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={500}
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
          <button type="button" onClick={handleConfirm} disabled={cancelling}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:bg-red-700">
            {cancelling ? <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling...</> : 'Yes, Cancel Order'}
          </button>
        </div>
      </motion.div>
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

        <div className="mb-3 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 px-3 py-2.5">
          <p className="text-xs text-violet-700 dark:text-violet-400">
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
  const [showAllHistory, setShowAllHistory] = useState(false)
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
  const isCancelled = order.status === 'cancelled' || order.status === 'returned' || order.status === 'failed'
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
          {/* Pickup & Delivery schedule */}
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
                {order.delivered_at ? (
                  // Actual delivery — show exact timestamp from delivered_at
                  <>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Delivered</p>
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(order.delivered_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Clock className="h-3 w-3" />
                      {new Date(order.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </>
                ) : (
                  // Not yet delivered — show estimated delivery date when available
                  <>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Estimated Delivery</p>
                    {order.estimated_delivery_date ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">{formatDate(order.estimated_delivery_date)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Time slot confirmed once out for delivery</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">To be scheduled</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </Section>

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
              {order.assignment_status === 'unassigned' && (
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
                    const canReportIssue = itemProtectionPolicy?.is_active
                      && ['delivered', 'completed'].includes(order.status)
                      && withinWindow
                      && !claim

                    const claimStatusCls: Record<string, string> = {
                      submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
                      under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
                      approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
                      paid: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
                      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
                    }

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
                            <p className="truncate text-sm font-medium text-foreground">{item.product_type_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.weight_kg ? `${item.weight_kg} kg` : `×${item.quantity}`}
                              {item.is_express && <span className="ml-1 text-amber-600">· Express</span>}
                            </p>
                            {claim && (
                              <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${claimStatusCls[claim.status] || 'bg-muted text-muted-foreground'}`}>
                                {claim.claim_type} claim — {claim.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-semibold text-foreground">
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
                <span className="font-bold text-foreground">Total</span>
                <span className="font-bold text-primary">{formatINR(order.total_amount)}</span>
              </div>
            </div>
          </Section>

          {/* Payment — shows split clearly for wallet+COD / wallet+UPI */}
          <Section title="Payment" icon={CreditCard}>
            {(() => {
              const NOT_PAYABLE = new Set(['delivered', 'completed', 'cancelled', 'returned', 'failed'])
              const canPayOnline = order.payment_method?.toLowerCase().includes('cod')
                && order.payment_status !== 'paid'
                && !NOT_PAYABLE.has(order.status)
              if (!canPayOnline) return null
              return (
                <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/20">
                  <p className="text-sm font-medium text-foreground">
                    Skip the cash/card at the door — pay online any time before delivery.
                  </p>
                  {payError && <p className="mt-1.5 text-xs text-destructive">{payError}</p>}
                  <button onClick={handlePayOnline} disabled={payLoading}
                    className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-60">
                    {payLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    {payLoading ? 'Processing…' : 'Pay Online Now'}
                  </button>
                </div>
              )
            })()}
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment records yet</p>
            ) : (
              <div className="space-y-3">
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
                      isWallet ? 'bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800' :
                      isCOD    ? 'bg-amber-50  dark:bg-amber-950/20  border border-amber-200  dark:border-amber-800'  :
                      'bg-muted/30'
                    )}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{methodLabel(p.payment_method)}</p>
                        {isWallet && p.status === 'completed' && (
                          <p className="mt-0.5 text-xs text-violet-600 dark:text-violet-400">Paid from wallet balance</p>
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

          {/* Special instructions */}
          {order.special_instructions && (
            <Section title="Special Instructions" icon={Info}>
              <p className="text-sm text-muted-foreground">{order.special_instructions}</p>
            </Section>
          )}

          {/* Status history — collapsed to the latest 3 entries by default
              since this list grows unbounded and was the main contributor
              to an overly long scroll on orders with many status changes. */}
          <Section title="Order Timeline" icon={Clock}>
            {(() => {
              const sorted = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              const visible = showAllHistory ? sorted : sorted.slice(0, 3)
              return (
                <>
                  <div className="relative space-y-3 pl-5">
                    <div className="absolute left-2 top-1 bottom-1 w-px bg-border/50" />
                    {visible.map((entry, i) => {
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
                  {sorted.length > 3 && (
                    <button type="button" onClick={() => setShowAllHistory(v => !v)}
                      className="mt-2 text-xs font-medium text-primary hover:underline">
                      {showAllHistory ? 'Show less' : `Show ${sorted.length - 3} more`}
                    </button>
                  )}
                </>
              )
            })()}
          </Section>

          {/* Help CTA */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4 lg:col-span-2">
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
      </div>

      {/* Reschedule modal */}
      <AnimatePresence>
        {showReschedule && (
          <RescheduleModal
            orderId={order.id}
            currentDate={order.pickup_date}
            currentSlot={order.pickup_time_slot}
            onClose={() => setShowReschedule(false)}
            onSuccess={handleRescheduleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Cancel order modal */}
      <AnimatePresence>
        {showCancel && (
          <CancelOrderModal
            orderId={order.id}
            totalAmount={order.total_amount}
            paymentStatus={order.payment_status}
            gatewayProvider={payments.find(p => p.status === 'completed')?.provider ?? null}
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
              toast({ title: 'Claim submitted', description: 'Our support team will review it shortly' })
              fetchOrder()
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}
