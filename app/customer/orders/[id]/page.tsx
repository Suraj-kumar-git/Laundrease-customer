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
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

// ---- Types --------------------------------------------------
interface OrderDetail {
  id: number; order_number: string; status: string; assignment_status: string
  pickup_address: any; delivery_address: any
  pickup_date: string; pickup_time_slot: string
  delivery_date: string | null; delivery_time_slot: string | null
  special_instructions: string | null; is_express: boolean
  subtotal: number; tax_amount: number; discount_amount: number; total_amount: number
  payment_status: string; payment_method: string
  created_at: string; updated_at: string; can_reschedule: boolean
  provider: { id: number; name: string; address: string; city: string; phone: string } | null
  delivery_partner: { name: string; phone: string } | null
}

interface OrderItem {
  id: number; quantity: number; weight_kg: number | null; garment_label: string | null
  product_type_name: string; icon: string
  service_id: number; service_name: string; service_category: string
  unit_price: number; line_total: number; is_express: boolean; express_multiplier: number
}

interface Payment {
  id: number; amount: number; payment_method: string; status: string
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
    <div className={cn('rounded-2xl border border-border/50 bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ---- Reschedule modal ---------------------------------------
function RescheduleModal({
  orderId, currentDate, currentSlot, onClose, onSuccess,
}: {
  orderId: number; currentDate: string; currentSlot: string
  onClose: () => void; onSuccess: (date: string, slot: string) => void
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
      onSuccess(selectedDate, selectedSlot)
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
  const [coupons,    setCoupons]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showReschedule, setShowReschedule] = useState(false)
  // Invoice download state
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceError,   setInvoiceError]   = useState<string | null>(null)
  // fee_code → display_name from order_fee_config (loaded once)
  const [feeLabels,  setFeeLabels]  = useState<Record<string, string>>({})

  useEffect(() => {
    // Load fee labels from order_fee_config (once per page load)
    fetch('/api/customer/orders/fee-labels', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setFeeLabels(j.data.labels) })
      .catch(() => {})
  }, [])

  useEffect(() => {
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
        setCoupons(json.data.coupons)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [id])

  const handleRescheduleSuccess = (date: string, slot: string) => {
    setOrder(prev => prev ? { ...prev, pickup_date: date, pickup_time_slot: slot } : prev)
    setShowReschedule(false)
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
  const isCancelled = order.status === 'cancelled' || order.status === 'returned'
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
      <div className="container mx-auto max-w-2xl px-4 py-6">
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
            <div className="flex">
              <button
                onClick={handleDownloadInvoice}
                disabled={invoiceLoading}
                title="Download invoice as PDF"
                aria-label="Download invoice as PDF"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto md:justify-start"
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

        <div className="space-y-4">
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
                {order.delivery_date ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">{formatDate(order.delivery_date)}</p>
                    {order.delivery_time_slot && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {order.delivery_time_slot}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">To be scheduled</p>
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
                  {serviceItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg shrink-0">{item.icon ?? '🧺'}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{item.product_type_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.weight_kg ? `${item.weight_kg} kg` : `×${item.quantity}`}
                            {item.is_express && <span className="ml-1 text-amber-600">· Express</span>}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground">
                        {formatINR(item.line_total)}
                      </span>
                    </div>
                  ))}
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
              {/* order_coupons fallback */}
              {coupons.map(c => (
                <div key={c.coupon_code} className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Coupon ({c.coupon_code})</span>
                  <span className="font-semibold">-{formatINR(c.amount_discounted)}</span>
                </div>
              ))}

              <div className="flex justify-between border-t border-border/40 pt-2.5 text-base">
                <span className="font-bold text-foreground">Total</span>
                <span className="font-bold text-primary">{formatINR(order.total_amount)}</span>
              </div>
            </div>
          </Section>

          {/* Payment — shows split clearly for wallet+COD / wallet+UPI */}
          <Section title="Payment" icon={CreditCard}>
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

          {/* Status history */}
          <Section title="Order Timeline" icon={Clock}>
            <div className="relative space-y-4 pl-5">
              {/* Vertical line */}
              <div className="absolute left-2 top-1 bottom-1 w-px bg-border/50" />

              {history.map((entry, i) => {
                const cfg = STATUS_CONFIG[entry.status] ?? { label: entry.status, bg: 'bg-muted', color: 'text-foreground' }
                return (
                  <div key={i} className="relative flex gap-3">
                    {/* Dot */}
                    <div className={cn('absolute -left-5 mt-0.5 h-4 w-4 rounded-full border-2 border-background', cfg.bg)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
                        {entry.changed_by_name && (
                          <span className="text-xs text-muted-foreground">by {entry.changed_by_name}</span>
                        )}
                      </div>
                      {entry.notes && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.notes}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Help CTA */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4">
            <Shield className="h-8 w-8 shrink-0 text-primary/40" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Need help with this order?</p>
              <p className="text-xs text-muted-foreground">Our support team is here for you</p>
            </div>
            <Link href="/help-center"
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
    </>
  )
}
