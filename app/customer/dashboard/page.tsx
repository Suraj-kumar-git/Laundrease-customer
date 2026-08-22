'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Package, MapPin, Wallet, Gift, Plus,
  ArrowRight, CheckCircle2, Truck, Star, Calendar,
  Loader2, AlertCircle, Sparkles, RefreshCw,
  ChevronRight, ChevronDown, Copy, Check, Zap,
  Home, Building2, ShoppingBag, Briefcase, Heart,
  X, Award, ArrowUpRight, ArrowDownLeft,
  ShieldCheck, Timer, Wind, Droplets, Play,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { cn } from '@/lib/utils'
import { getPreferredAddressId, setPreferredAddressId } from '@/lib/dashboard-address-pref'
import { formatDistance } from '@/lib/format-distance'
import { useCustomerLocation } from '@/lib/use-customer-location'
import { DeliveryFeePreview } from '@/types/order-types'

// ---- Types --------------------------------------------------

interface Address {
  id: number; label: string; addressLine1: string; addressLine2: string | null
  landmark: string | null; city: string; state: string; postalCode: string
  latitude: number | null; longitude: number | null
  isDefault: boolean; contactName: string | null; contactPhone: string | null
  instructions: string | null
}
interface StatusHistoryItem { status: string; notes: string | null; location: string | null; timestamp: string }
interface ActiveOrder {
  id: string; orderNumber: string; status: string; pickupAddress: string
  deliveryAddress: string; pickupDate: string; pickupTimeSlot: string | null
  deliveryDate: string | null; deliveryTimeSlot: string | null; totalAmount: number
  isExpress: boolean; laundryName: string | null; createdAt: string; updatedAt: string
  statusHistory: StatusHistoryItem[]
}
interface Coupon {
  code: string; name: string; description: string | null; discountType: string
  discountValue: number; maxDiscount: number | null; minOrderAmount: number | null
  expiresAt: string | null; isPersonal: boolean
  providerId: number | null; providerName: string | null
  eligible: boolean; ineligibleReason: string | null
}
interface DashboardData {
  profile: { fullName: string; email: string; phone: string; profileImage: string | null; loyaltyPoints: number; totalOrders: number; lastOrderAt: string | null }
  addresses: Address[]
  activeOrders: ActiveOrder[]
  wallet: { balance: number; currency: string }
  statistics: { completedOrders: number; activeOrders: number; totalSpent: number }
}
interface LoyaltyLedgerItem {
  id: number; kind: 'credit' | 'debit'; points: number; balance_after: number
  reason: string; order_number: string | null; created_at: string
}
interface WalletTransaction {
  id: number; kind: 'credit' | 'debit'; amount: number; reference: string
  order_number: string | null; created_at: string
}

// ---- Constants ----------------------------------------------

const ORDER_STEPS = [
  { key: 'pending',          label: 'Order Placed',     icon: Package },
  { key: 'confirmed',        label: 'Confirmed',        icon: CheckCircle2 },
  { key: 'picked_up',        label: 'Picked Up',        icon: Truck },
  { key: 'processing',      label: 'Processing',       icon: Sparkles },
  { key: 'ready',            label: 'Ready',            icon: CheckCircle2 },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
  { key: 'delivered',        label: 'Delivered',        icon: CheckCircle2 },
]

// Real order statuses → position on the 7-step visual timeline. The stepper's
// visual steps are coarser than the DB statuses (e.g. assigned/out_for_pickup
// both sit at "Confirmed" — the pickup hasn't happened yet).
const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  confirmed: 1, assigned_for_pickup: 1, out_for_pickup: 1,
  picked_up: 2,
  at_laundry: 3, processing: 3,
  ready_for_delivery: 4, ready: 4,
  out_for_delivery: 5,
  delivered: 6,
}

// Progress rank used to order the dashboard's active-order carousel: higher
// means closer to completion, so the carousel leads with whatever is nearest
// the customer's door and leaves not-yet-confirmed orders last.
// Deliberately finer-grained than STATUS_TO_STEP above — that one coarsens
// several distinct statuses onto a single visual timeline step, which would
// make e.g. out_for_pickup and assigned_for_pickup sort as equals here.
const ACTIVE_STATUS_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  assigned_for_pickup: 2,
  out_for_pickup: 3,
  picked_up: 4,
  at_laundry: 5,
  processing: 6,
  ready: 7, ready_for_delivery: 7,
  out_for_delivery: 8,
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending:             { label: 'Order Placed',        color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' },
  confirmed:           { label: 'Confirmed',           color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400' },
  assigned_for_pickup: { label: 'Pickup Assigned',     color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400' },
  out_for_pickup:      { label: 'Out for Pickup',      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400' },
  picked_up:           { label: 'Picked Up',           color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400' },
  at_laundry:          { label: 'At the Laundry',      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400' },
  processing:          { label: 'In Progress',         color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400' },
  ready_for_delivery:  { label: 'Ready for Delivery',  color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400' },
  ready:               { label: 'Ready',               color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400' },
  out_for_delivery:    { label: 'Out for Delivery',    color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400' },
  delivered:           { label: 'Delivered',           color: 'text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400' },
  cancelled:           { label: 'Cancelled',           color: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400' },
  rejected:            { label: 'Not Confirmed',       color: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400' },
  failed:              { label: 'Failed',              color: 'text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-400' },
}

const LOYALTY_LABELS: Record<string, string> = {
  order_completion:   'Order completed',
  redeemed_to_wallet: 'Converted to wallet',
  admin_adjustment:   'Admin adjustment',
}

const ADDRESS_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home, office: Building2, work: Briefcase, other: MapPin,
}
function AddressIcon({ label, className }: { label: string; className?: string }) {
  const key = label?.toLowerCase() ?? ''
  const Icon = Object.entries(ADDRESS_ICON_MAP).find(([k]) => key.includes(k))?.[1] ?? MapPin
  return <Icon className={className} />
}

// ---- Helpers ------------------------------------------------

function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amount)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
// Day + month only — used on the compact order cards, where the year would
// push the pickup/delivery row onto a second line on narrow cards.
function formatShortDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ---- Modal shell --------------------------------------------

function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] max-w-lg overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
              <h2 className="text-base font-bold text-foreground">{title}</h2>
              <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 64px)' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ---- Loyalty Modal ------------------------------------------

function LoyaltyModal({ open, onClose, currentPoints, onRedeemed }: {
  open: boolean; onClose: () => void; currentPoints: number
  onRedeemed: (newPoints: number, walletCredited: number) => void
}) {
  const [ledger,    setLedger]    = useState<LoyaltyLedgerItem[]>([])
  const [loading,   setLoading]   = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [success,   setSuccess]   = useState<{ points: number; amount: number } | null>(null)
  const canRedeem = currentPoints >= 100

  useEffect(() => {
    if (!open) return
    setLoading(true); setSuccess(null)
    fetch('/api/customer/loyalty', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setLedger(j.data.ledger ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  const handleRedeem = async () => {
    if (!canRedeem || redeeming) return
    setRedeeming(true)
    try {
      const res  = await fetch('/api/customer/loyalty/redeem', { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (json.success) {
        setSuccess({ points: json.data.redeemed_points, amount: json.data.wallet_credited })
        onRedeemed(json.data.new_balance, json.data.wallet_credited)
        fetch('/api/customer/loyalty', { credentials: 'include' })
          .then(r => r.json()).then(j => { if (j.success) setLedger(j.data.ledger ?? []) }).catch(() => {})
      }
    } catch { /* silent */ }
      finally { setRedeeming(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Loyalty Points">
      <div className="p-5 space-y-5">
        {/* Balance card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-4 left-8 h-16 w-16 rounded-full bg-white/10" />
          <div className="relative">
            <p className="text-sm font-medium text-white/80">Your Points</p>
            <p className="mt-1 text-4xl font-black">{currentPoints.toLocaleString('en-IN')}</p>
            <p className="mt-1 text-sm text-white/80">≈ {formatINR(currentPoints)} wallet value</p>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-border/40 bg-muted/30 p-4 space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How it works</p>
          <div className="flex items-start gap-2.5 text-sm">
            <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">Earn <span className="font-semibold text-foreground">1% of order value</span> as points after every completed order</p>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-muted-foreground">Convert <span className="font-semibold text-foreground">100+ points to wallet</span> — 1 point = ₹1</p>
          </div>
        </div>

        {/* Success flash */}
        {success && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-bold">{success.points} points</span> → <span className="font-bold">{formatINR(success.amount)}</span> added to wallet!
            </p>
          </motion.div>
        )}

        {/* Redeem button */}
        <button type="button" onClick={handleRedeem} disabled={!canRedeem || redeeming}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold transition-all',
            canRedeem
              ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25 hover:shadow-lg'
              : 'cursor-not-allowed bg-muted text-muted-foreground'
          )}>
          {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {canRedeem
            ? `Convert ${currentPoints} points → ${formatINR(currentPoints)}`
            : `Need ${100 - currentPoints} more points to redeem`}
        </button>

        {/* Ledger history */}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : ledger.length > 0 ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
            <div className="space-y-2">
              {ledger.map(item => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/30 bg-card px-4 py-3">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    item.kind === 'credit' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40' : 'bg-red-100 text-red-600 dark:bg-red-950/40')}>
                    {item.kind === 'credit' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {LOYALTY_LABELS[item.reason] ?? item.reason}
                    </p>
                    {item.order_number && <p className="text-xs text-muted-foreground font-mono">#{item.order_number}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-sm font-bold', item.kind === 'credit' ? 'text-emerald-600' : 'text-red-500')}>
                      {item.kind === 'credit' ? '+' : '-'}{item.points} pts
                    </p>
                    <p className="text-[10px] text-muted-foreground">Bal: {item.balance_after}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity yet. Complete your first order to earn points!
          </p>
        )}
      </div>
    </Modal>
  )
}

// ---- Wallet Modal -------------------------------------------

function WalletModal({ open, onClose, balance }: { open: boolean; onClose: () => void; balance: number }) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [loading,      setLoading]      = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/customer/wallet/transactions', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (j.success) setTransactions(j.data.transactions ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="My Wallet">
      <div className="p-5 space-y-5">
        {/* Balance card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-5 text-white">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <p className="text-sm font-medium text-white/80">Available Balance</p>
          <p className="mt-1 text-4xl font-black">{formatINR(balance)}</p>
          <p className="mt-1 text-xs text-white/60">Used automatically at checkout</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
        ) : (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transactions</p>
            <div className="space-y-2">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/30 bg-card px-4 py-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    t.kind === 'credit' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40' : 'bg-red-100 text-red-600 dark:bg-red-950/40')}>
                    {t.kind === 'credit' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.reference ?? 'Transaction'}</p>
                    {t.order_number && <p className="text-xs font-mono text-muted-foreground">#{t.order_number}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.created_at)}</p>
                  </div>
                  <p className={cn('shrink-0 text-sm font-bold', t.kind === 'credit' ? 'text-emerald-600' : 'text-red-500')}>
                    {t.kind === 'credit' ? '+' : '-'}{formatINR(t.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---- Address Dropdown (unchanged from page.txt) -------------

function AddressDropdown({ addresses, selectedId, onSelect, compact }: {
  addresses: Address[]; selectedId: number | null; onSelect: (id: number) => void
  // Minimal single-line trigger (icon + label + truncated address + chevron,
  // no card border) for the mobile compact header bar, where it shares a row
  // with the loyalty/wallet pills. The dropdown popup itself is unchanged.
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = addresses.find(a => a.id === selectedId) ?? addresses[0] ?? null

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!selected) {
    return compact ? (
      <Link href="/customer/addresses/new"
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">
        <Plus className="h-3.5 w-3.5 shrink-0" /> Add address
      </Link>
    ) : (
      <Link href="/customer/addresses/new"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
        <Plus className="h-4 w-4" /> Add your first address
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      {compact ? (
        <button onClick={() => setOpen(v => !v)}
          className="flex w-full items-center gap-1.5 text-left">
          <AddressIcon label={selected.label} className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            <span className="font-semibold">{selected.label}</span>
            <span className="text-muted-foreground"> · {selected.addressLine1}</span>
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </button>
      ) : (
      <button onClick={() => setOpen(v => !v)}
        className={cn('flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-all',
          open ? 'border-primary/40 shadow-sm' : 'border-border/50 hover:border-border')}>
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AddressIcon label={selected.label} className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{selected.label}</span>
            {selected.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Default</span>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {selected.addressLine1}{selected.landmark ? `, Near ${selected.landmark}` : ''}{`, ${selected.city} - ${selected.postalCode}`}
          </p>
        </div>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
      </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border/50 bg-popover shadow-xl shadow-black/10">
            <div className="max-h-64 overflow-y-auto">
              {addresses.map((addr, i) => (
                <button key={addr.id} onClick={() => { onSelect(addr.id); setOpen(false) }}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                    i < addresses.length - 1 && 'border-b border-border/30',
                    addr.id === selectedId ? 'bg-primary/5' : 'hover:bg-muted/50')}>
                  <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    addr.id === selectedId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    <AddressIcon label={addr.label} className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{addr.label}</span>
                      {addr.isDefault && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Default</span>}
                      {addr.id === selectedId && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{addr.addressLine1}{addr.city ? `, ${addr.city}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-border/40 p-2">
              <Link href="/customer/addresses" onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5">
                <Plus className="h-3.5 w-3.5" /> Manage all addresses
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
      }
// ---- Order Progress Timeline (unchanged) --------------------

function OrderTimeline({ order }: { order: ActiveOrder }) {
  // Map the real DB status onto the visual steps — falls back to key lookup
  // for safety, though STATUS_TO_STEP covers every known status.
  const currentIndex = STATUS_TO_STEP[order.status] ?? ORDER_STEPS.findIndex(s => s.key === order.status)
  return (
    <div>
      <div className="relative mb-6">
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-border/60" />
        <div className="absolute top-4 left-4 h-0.5 bg-primary transition-all duration-700"
          style={{ width: currentIndex <= 0 ? '0%' : `${(currentIndex / (ORDER_STEPS.length - 1)) * (100 - (8 / ORDER_STEPS.length))}%` }} />
        <div className="relative flex justify-between">
          {ORDER_STEPS.map((step, i) => {
            const done = i <= currentIndex; const current = i === currentIndex; const Icon = step.icon
            // On mobile only the current step and its neighbours get a label —
            // seven labels side by side collide on narrow screens. sm+ shows all.
            const showLabelOnMobile = Math.abs(i - currentIndex) <= 1
            return (
              <div key={step.key} className="flex flex-col items-center gap-1.5">
                <div className={cn('relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300',
                  done ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30' : 'border-border bg-card text-muted-foreground',
                  current && 'ring-4 ring-primary/20 scale-110')}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className={cn('text-[10px] text-center leading-tight max-w-14',
                  done ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  showLabelOnMobile ? 'block' : 'hidden sm:block')}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {order.statusHistory.length > 0 && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Activity</p>
          {[...order.statusHistory].reverse().slice(0, 4).map((h, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {STATUS_META[h.status]?.label ?? h.status}
                  {h.notes && <span className="ml-1 font-normal text-muted-foreground">— {h.notes}</span>}
                </p>
                {h.location && <p className="text-xs text-muted-foreground">{h.location}</p>}
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(h.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Coupon Card ----------------------------------------------
// Compact, fixed-width card (a carousel item on mobile, a row item on
// desktop) — 4 tight lines: code + discount, description, MOV/status,
// provider badge + copy. The API already excludes anything permanently
// dead for this customer (expired, fully used, forfeited first-order-only)
// — everything that reaches here is either usable now or could still
// become usable this session (e.g. a different provider or a bigger cart).

function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(coupon.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const discountLabel = coupon.discountType === 'percent' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`

  return (
    <div className={cn(
      'flex w-60 shrink-0 snap-start flex-col gap-1.5 rounded-xl border p-3.5',
      coupon.eligible ? 'border-primary/25 bg-primary/5' : 'border-dashed border-border/50 bg-card opacity-70',
    )}>
      <div className="flex items-center justify-between gap-2">
        <code className="truncate text-sm font-bold font-mono tracking-wide text-foreground">{coupon.code}</code>
        <span className="shrink-0 text-xs font-bold text-primary">{discountLabel}</span>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{coupon.description || coupon.name}</p>
      <p className={cn('truncate text-[10px]', !coupon.eligible ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>
        {!coupon.eligible && coupon.ineligibleReason
          ? coupon.ineligibleReason
          : coupon.minOrderAmount ? `Min. order ₹${coupon.minOrderAmount}` : 'No minimum order'}
      </p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        {coupon.providerId != null ? (
          <span className="truncate rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {coupon.providerName ?? 'Provider'}
          </span>
        ) : <span />}
        <button onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-primary hover:underline">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
    </div>
  )
}

// ---- Active offers --------------------------------------------
// Same pincode-scoped eligibility endpoint the checkout page's coupon
// picker uses (/api/customer/coupons/available) — one shared source of
// truth instead of a second, separately-maintained coupon query, so a
// provider's coupon can never be visible here but hidden at checkout (or
// vice versa). Refetches whenever the selected address changes. Rendered
// as a horizontal scroll-snap row — a carousel on narrow (mobile) viewports,
// and effectively a single row of cards once the viewport is wide enough
// to show them all without scrolling (desktop).

function ActiveOffers({ addressId }: { addressId: number | null }) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({ order_amount: '0' })
    if (addressId) params.set('address_id', String(addressId))
    fetch(`/api/customer/coupons/available?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j.success) return
        const mapped: Coupon[] = (j.data?.coupons ?? []).map((c: any) => ({
          code: c.code,
          name: c.name,
          description: c.description ?? null,
          discountType: c.discount_type,
          discountValue: parseFloat(c.discount_value),
          maxDiscount: c.max_discount ? parseFloat(c.max_discount) : null,
          minOrderAmount: c.min_order_amount ? parseFloat(c.min_order_amount) : null,
          expiresAt: c.expires_at ?? null,
          isPersonal: !!c.is_personal,
          providerId: c.provider_id ?? null,
          providerName: c.provider_name ?? null,
          eligible: c.eligible,
          ineligibleReason: c.ineligible_reason ?? null,
        }))
        setCoupons(mapped)
      })
      .catch(() => { if (!cancelled) setCoupons([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [addressId])

  if (!loading && coupons.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
      className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Your Offers
          {coupons.length > 0 && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{coupons.length}</span>
          )}
        </h2>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map(i => <div key={i} className="h-24 w-60 shrink-0 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {coupons.map(c => <CouponCard key={c.code} coupon={c} />)}
        </div>
      )}
    </motion.div>
  )
}

// ---- Providers near you -------------------------------------
// Horizontal scroll of provider cards. When the customer has a selected
// address, providers are for that address's pincode with real distance +
// delivery-fee preview from that pickup point (same search endpoint the
// order flow's step 1 uses). When they have no saved address at all, falls
// back to the customer's live geolocation — same distance-only behavior as
// the public landing page (no fee preview: there's no committed pickup
// point yet to compute a real fee against). "Create order" deep-links into
// the flow with that provider pre-selected (?provider=).

interface NearbyProvider {
  id: number; business_name: string; city: string
  rating: number; rating_count: number; is_verified: boolean
  distance_km?: number | null; logo_url?: string | null
  delivery_fee_preview?: DeliveryFeePreview | null
}

function DeliveryFeePill({ preview }: { preview: DeliveryFeePreview }) {
  // Same 3-state, non-misleading copy as AddressProviderStep.tsx's
  // DeliveryFeeBadge — never phrases the 'fee' state as "free above X" (see
  // scripts/48-fix-delivery-fee-below-mov-surcharge.sql for why that's wrong).
  if (preview.state === 'free') {
    return <span className="flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400"><Truck className="h-3 w-3" /> Free delivery</span>
  }
  if (preview.state === 'free_above') {
    return <span className="flex items-center gap-0.5 font-medium text-blue-600 dark:text-blue-400"><Truck className="h-3 w-3" /> Free above ₹{preview.free_above_amount}</span>
  }
  return <span className="flex items-center gap-0.5"><Truck className="h-3 w-3" /> ₹{preview.amount} delivery</span>
}

function ProvidersNearYou({ address }: { address: Address | null }) {
  const [providers, setProviders] = useState<NearbyProvider[]>([])
  const [loading,   setLoading]   = useState(false)
  // Only auto-requests geolocation when there's no saved address to key off
  // instead — a registered customer with an address on file is never
  // prompted for browser location permission just for this widget.
  const { coords } = useCustomerLocation(address === null)

  useEffect(() => {
    let cancelled = false

    if (address?.postalCode) {
      setLoading(true)
      const params = new URLSearchParams({ location: address.postalCode })
      if (address.latitude != null && address.longitude != null) {
        params.set('lat', String(address.latitude))
        params.set('lng', String(address.longitude))
      }
      fetch(`/api/customer/laundry-providers/search?${params}`)
        .then(r => r.json())
        .then(j => { if (!cancelled) setProviders(j.success ? (j.data?.providers ?? []) : []) })
        .catch(() => { if (!cancelled) setProviders([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else if (address === null && coords) {
      // No saved address at all — same public, distance-only endpoint the
      // landing page uses. Field names differ (name/image vs.
      // business_name/logo_url) and every row is implicitly verified
      // already (the route's WHERE already filters is_verified = TRUE).
      setLoading(true)
      const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng), limit: '8' })
      fetch(`/api/customer/public/home-data?${params}`)
        .then(r => r.json())
        .then(j => {
          if (cancelled) return
          const list: any[] = j.success ? (j.data?.providers ?? []) : []
          setProviders(list.map(p => ({
            id: p.id, business_name: p.name, city: p.city,
            rating: p.rating, rating_count: p.rating_count, is_verified: true,
            distance_km: p.distance_km, logo_url: p.image,
            delivery_fee_preview: null,
          })))
        })
        .catch(() => { if (!cancelled) setProviders([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setProviders([])
    }

    return () => { cancelled = true }
  }, [address?.postalCode, address?.latitude, address?.longitude, address, coords])

  if (!loading && providers.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Providers near you</h2>
      </div>
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map(i => <div key={i} className="h-32 w-52 shrink-0 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {providers.map(p => (
            <div key={p.id} className="flex w-52 shrink-0 flex-col rounded-xl border border-border/50 bg-background p-3.5">
              <div className="flex items-start gap-2.5">
                {p.logo_url ? (
                  <Image src={p.logo_url} alt={p.business_name} width={36} height={36}
                    className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {p.business_name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{p.business_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{p.city}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                {Number(p.rating) > 0 && (
                  <span className="flex items-center gap-0.5 font-medium text-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {Number(p.rating).toFixed(1)}
                    {p.rating_count > 0 && <span className="font-normal text-muted-foreground">({p.rating_count})</span>}
                  </span>
                )}
                {p.distance_km != null && <span>{formatDistance(p.distance_km)}</span>}
                {p.is_verified && (
                  <span className="flex items-center gap-0.5 text-green-600"><ShieldCheck className="h-3 w-3" /> Verified</span>
                )}
              </div>
              {p.delivery_fee_preview && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  <DeliveryFeePill preview={p.delivery_fee_preview} />
                </div>
              )}
              {/* mt-auto on the wrapper, not on the Link itself: the row
                  already stretches every card to the tallest one, but the
                  button was rendering wherever its own card's content happened
                  to end — a provider whose name wraps to two lines (or that has
                  a rating row the others lack) pushed its button down while the
                  shorter cards were left with dead space BELOW theirs. Pushing
                  the wrapper to the bottom puts every button on one baseline
                  and moves the slack above it instead. pt-3 preserves the gap
                  from the content on the tallest card, where mt-auto collapses
                  to zero — it lives on the wrapper so it can't collide with the
                  button's own py-2. */}
              <div className="mt-auto pt-3">
                <Link href={address?.id ? `/customer/orders/create?provider=${p.id}&address=${address.id}` : `/customer/orders/create?provider=${p.id}`}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                  Create order <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ---- Popular services ---------------------------------------
// Admin-ordered services (public catalog endpoint) as quick entry points
// into the order flow.

interface PopularService { id: number; name: string; category: string | null; icon: string | null }

function PopularServices() {
  const [services, setServices] = useState<PopularService[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/customer/public/services')
      .then(r => r.json())
      .then(j => { if (!cancelled && j.success) setServices((j.data?.services ?? []).slice(0, 6)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (services.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
      className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Popular services</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {services.map(s => (
          <Link key={s.id} href="/customer/orders/create"
            className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-xl border border-border/50 bg-background p-3 text-center transition-colors hover:border-primary/30 hover:bg-primary/5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xl">
              {s.icon || '🧺'}
            </span>
            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">{s.name}</span>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}

// ---- Refer & Earn sidebar promo ------------------------------

interface ReferralSummary { code: string; total_referrals: number; total_earnings: number }

function ReferralPromo() {
  const [data,   setData]   = useState<ReferralSummary | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/customer/referral', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.success) setData(j.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!data) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm">
      <div className="mb-2.5 flex items-center gap-2">
        <Gift className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refer & Earn</p>
      </div>
      <p className="text-sm text-foreground">
        Invite friends — you both get wallet credit when they place their first order.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-background px-3 py-2">
        <code className="flex-1 truncate text-sm font-bold tracking-wider text-primary">{data.code}</code>
        <button type="button" onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      {data.total_referrals > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{data.total_referrals}</span> friend{data.total_referrals !== 1 ? 's' : ''} joined
          {' · '}
          <span className="font-semibold text-foreground">{formatINR(data.total_earnings)}</span> earned
        </p>
      )}
      <Link href="/customer/refer-and-earn"
        className="mt-3 flex items-center justify-between text-sm font-medium text-primary hover:underline">
        View details <ChevronRight className="h-4 w-4" />
      </Link>
    </motion.div>
  )
}

// ---- Why Laundrease marketing section -----------------------

// function WhyLaundrease() {
//   const features = [
//     { icon: ShieldCheck, title: 'Quality Guaranteed',   desc: 'Every garment inspected before delivery. Not happy? We re-wash for free.' },
//     { icon: Timer,       title: 'Express in 12 Hours',  desc: 'Need it fast? Our express service delivers same-day in select areas.' },
//     { icon: Droplets,    title: 'Eco-Friendly Process', desc: 'Biodegradable detergents, water-saving machines, sustainable packaging.' },
//     { icon: Wind,        title: 'Free Pickup & Drop',   desc: 'We come to you. Schedule at your convenience — 7 AM to 10 PM.' },
//   ]
//   const stats = [
//     { value: '50,000+', label: 'Happy Customers' },
//     { value: '4.8★',    label: 'Avg. Rating'     },
//     { value: '200+',    label: 'Providers'        },
//     { value: '12hr',    label: 'Express'          },
//   ]
//   return (
//     <div className="space-y-5">
//       {/* Video placeholder — replace src with your real video URL */}
//       <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/80 to-blue-700 cursor-pointer shadow-lg"
//         style={{ aspectRatio: '16/9' }}>
//         <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
//           <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-110">
//             <Play className="h-7 w-7 fill-white" />
//           </div>
//           <p className="text-sm font-semibold">See how Laundrease works</p>
//           <p className="mt-1 text-xs text-white/70">2 min video</p>
//         </div>
//         <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-white/5" />
//         <span className="pointer-events-none absolute bottom-4 left-6 text-4xl opacity-20">👕</span>
//         <span className="pointer-events-none absolute top-4 right-10 text-3xl opacity-20">✨</span>
//       </div>

//       {/* Social proof stats */}
//       <div className="grid grid-cols-4 gap-2">
//         {stats.map(s => (
//           <div key={s.label} className="rounded-xl border border-border/40 bg-card p-3 text-center">
//             <p className="text-base font-black text-primary">{s.value}</p>
//             <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{s.label}</p>
//           </div>
//         ))}
//       </div>

//       {/* Feature grid */}
//       <div className="grid gap-3 sm:grid-cols-2">
//         {features.map(f => (
//           <div key={f.title} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4">
//             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
//               <f.icon className="h-4 w-4" />
//             </div>
//             <div>
//               <p className="text-sm font-semibold text-foreground">{f.title}</p>
//               <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* First order CTA */}
//       <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-primary to-blue-700 px-5 py-4">
//         <div>
//           <p className="text-sm font-bold text-white">First order? Use FIRST50</p>
//           <p className="text-xs text-white/70">Get 50% off on your first laundry order</p>
//         </div>
//         <Link href="/customer/orders/create"
//           className="flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/30">
//           Order Now <ArrowRight className="h-3.5 w-3.5" />
//         </Link>
//       </div>
//     </div>
//   )
// }

// ---- Active Order card ---------------------------------------
// One fixed-shape summary card at every breakpoint: header (order no.,
// express, status), a slim progress bar, the two key dates, then total +
// Track pinned to the bottom. Everything variable is single-line and
// truncated — including Express, which is an icon rather than a text pill,
// so an express order can never render taller than a normal one and the
// cards in a row all line up exactly.
//
// Below lg the card is an accordion: tapping the header unfolds the full
// timeline and slot details in place. From lg the accordion is dropped and
// the whole card becomes a link to the order page — implemented as a
// stretched overlay anchor so the mobile toggle button underneath still
// works below lg, where the overlay isn't rendered at all.

function ActiveOrderCard({ order }: { order: ActiveOrder }) {
  const [expanded, setExpanded] = useState(false)
  const statusMeta = STATUS_META[order.status] ?? STATUS_META.pending
  const stepIndex  = STATUS_TO_STEP[order.status] ?? 0
  // The pill already names where the order *is*, so the progress line names
  // what it's waiting on next instead of repeating the same thing coarser.
  const nextStep   = ORDER_STEPS[stepIndex + 1]

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm transition-all lg:hover:border-primary/40 lg:hover:shadow-md">
      {/* Desktop: the card itself is the link to the order detail page. */}
      <Link href={`/customer/orders/${order.id}`} aria-label={`Open order ${order.orderNumber}`}
        className="absolute inset-0 z-10 hidden lg:block" />

      <button type="button" onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-4 py-3 text-left lg:pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold text-foreground">#{order.orderNumber}</h2>
            {order.isExpress && (
              <span title="Express order"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                <Zap className="h-2.5 w-2.5 fill-current" />
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {order.laundryName ?? 'Awaiting provider'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', statusMeta?.color)}>
            {statusMeta?.label}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform lg:hidden', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Always-visible summary — the whole card body on lg+ */}
      <div className="space-y-3 px-4 py-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="truncate font-medium text-foreground">
              {nextStep ? `Next: ${nextStep.label}` : (statusMeta?.label ?? '')}
            </span>
            <span className="shrink-0 text-muted-foreground">{stepIndex + 1}/{ORDER_STEPS.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.max(6, (stepIndex / (ORDER_STEPS.length - 1)) * 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="truncate">Pickup {formatShortDate(order.pickupDate)}</span>
          </span>
          {order.deliveryDate && (
            <span className="flex min-w-0 items-center gap-1">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">Delivery {formatShortDate(order.deliveryDate)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Full detail — mobile accordion only. On lg the card links out to the
          order page instead of unfolding here. */}
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-in-out lg:hidden',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="border-t border-border/40 p-4">
            <OrderTimeline order={order} />
            <div className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Pickup</p>
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDate(order.pickupDate)}
                  {order.pickupTimeSlot && <span className="text-muted-foreground">· {order.pickupTimeSlot}</span>}
                </p>
              </div>
              {order.deliveryDate && (
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Expected Delivery</p>
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {formatDate(order.deliveryDate)}
                    {order.deliveryTimeSlot && <span className="text-muted-foreground">· {order.deliveryTimeSlot}</span>}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Total + action — mt-auto pins this to the bottom edge so cards of
          differing content height still line their footers up. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">Order Total</p>
          <p className="truncate text-base font-bold text-foreground">{formatINR(order.totalAmount)}</p>
        </div>
        {/* Above the desktop overlay link so it stays independently clickable */}
        <Link href={`/customer/orders/${order.id}`}
          className="relative z-20 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md">
          Track Order <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

// ---- Active orders section -----------------------------------
// Mobile: a snap carousel, one card per screen, with dot indicators — vertical
// space is the scarce resource there. lg+: the same cards as a full-width
// auto-fill grid, so every active order is visible at once and nothing is
// clipped by the sidebar. Identical DOM at both breakpoints; the flex→grid
// switch is pure CSS.

function ActiveOrdersSection({ orders }: { orders: ActiveOrder[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState(0)

  // Which card is currently parked at the scroller's left edge. Measured from
  // the DOM rather than tracked as an index because the cards are sized in vw
  // and the user can free-scroll between snap points.
  const syncActiveIdx = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    let best = 0
    let bestDist = Infinity
    Array.from(el.children).forEach((child, i) => {
      const dist = Math.abs((child as HTMLElement).offsetLeft - el.scrollLeft)
      if (dist < bestDist) { bestDist = dist; best = i }
    })
    setActiveIdx(best)
  }, [])

  const scrollToIndex = (i: number) => {
    const el   = scrollerRef.current
    const card = el?.children[i] as HTMLElement | undefined
    if (el && card) el.scrollTo({ left: card.offsetLeft, behavior: 'smooth' })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Package className="h-4 w-4 text-primary" />
          Active Orders
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{orders.length}</span>
        </h2>
        <Link href="/customer/orders"
          className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* `relative` matters: it makes this element the offsetParent, so each
          card's offsetLeft is directly comparable to the scroller's scrollLeft. */}
      <div ref={scrollerRef} onScroll={syncActiveIdx}
        className="relative flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] lg:items-stretch lg:overflow-visible lg:pb-0">
        {orders.map(order => (
          <div key={order.id} className="w-[85vw] max-w-sm shrink-0 snap-center sm:w-[22rem] lg:w-auto lg:max-w-none">
            <ActiveOrderCard order={order} />
          </div>
        ))}
      </div>

      {orders.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5 lg:hidden">
          {orders.map((order, i) => (
            <button key={order.id} type="button" onClick={() => scrollToIndex(i)}
              aria-label={`Show order ${i + 1} of ${orders.length}`}
              className={cn('h-1.5 rounded-full transition-all',
                i === activeIdx ? 'w-5 bg-primary' : 'w-1.5 bg-border')} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

  // ---- Main page ----------------------------------------------

export default function CustomerDashboard() {
  const { markUnauthorized } = useAuth()
  const router   = useRouter()

  const [data,              setData]             = useState<DashboardData | null>(null)
  const [loading,           setLoading]          = useState(true)
  const [refreshing,        setRefreshing]        = useState(false)
  const [error,             setError]            = useState(false)
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)

  function selectAddress(id: number) {
    setSelectedAddressId(id)
    setPreferredAddressId(id)
  }

  // Modal state
  const [loyaltyOpen, setLoyaltyOpen] = useState(false)
  const [walletOpen,  setWalletOpen]  = useState(false)

  // Local overrides so UI updates immediately after modal action, no full refetch needed
  const [localLoyalty, setLocalLoyalty] = useState<number | null>(null)
  const [localWallet,  setLocalWallet]  = useState<number | null>(null)

  const fetchDashboard = useCallback(async () => {
    try {
      setRefreshing(true); setError(false)
      const res  = await fetch('/api/customer/dashboard', { credentials: 'include' })
      if (res.status === 401 || res.status === 403) { markUnauthorized(); setError(true); return }
      if (!res.ok) { setError(true); return }
      const json = await res.json()
      if (!json.success) { setError(true); return }
      setData(json.data)
      setLocalLoyalty(null); setLocalWallet(null)
      if (json.data.addresses?.length > 0) {
        // Prefer whatever the customer last picked here (if it still exists
        // among their current addresses) over silently resetting to default.
        const stored = getPreferredAddressId()
        const remembered = stored && json.data.addresses.some((a: Address) => a.id === stored) ? stored : null
        const def = json.data.addresses.find((a: Address) => a.isDefault)
        setSelectedAddressId(remembered ?? def?.id ?? json.data.addresses[0].id)
      }
    } catch { setError(true) }
    finally { setLoading(false); setRefreshing(false) }
  }, [markUnauthorized])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // ---- Loading / error states ----
  if (loading) {
    // Skeleton mirroring the real layout (header strip → stats → address/CTA
    // → content cards) — consistent with the pulse loaders used elsewhere.
    return (
      <div className="flex-1 bg-muted/20">
        <div className="border-b border-border/50 bg-background pb-5 pt-6">
          <div className="container mx-auto animate-pulse space-y-4 px-4">
            <div className="h-7 w-48 rounded-lg bg-muted" />
            <div className="flex gap-2.5">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-[52px] flex-1 rounded-xl bg-muted" />)}
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <div className="h-12 flex-1 rounded-2xl bg-muted" />
              <div className="h-12 rounded-2xl bg-muted sm:w-36" />
            </div>
          </div>
        </div>
        <div className="container mx-auto animate-pulse px-4 pb-12">
          {/* Active orders row — full width, mirroring the real layout */}
          <div className="mt-4 grid gap-4 lg:grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
            <div className="h-48 rounded-2xl bg-muted" />
            <div className="hidden h-48 rounded-2xl bg-muted lg:block" />
            <div className="hidden h-48 rounded-2xl bg-muted lg:block" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-56 rounded-2xl bg-muted" />
              <div className="h-44 rounded-2xl bg-muted" />
            </div>
            <div className="hidden space-y-5 lg:block">
              <div className="h-48 rounded-2xl bg-muted" />
              <div className="h-40 rounded-2xl bg-muted" />
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive/60" />
          <h2 className="mb-2 text-lg font-semibold text-foreground">Could not load dashboard</h2>
          <p className="mb-6 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
          <button onClick={fetchDashboard}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
        </div>
      </div>
    )
  }

  const firstName    = data.profile.fullName.split(' ')[0]

  // Carousel order: nearest completion first (out for delivery leads),
  // not-yet-confirmed last. Within the same stage the longest-waiting order
  // comes first, since it's the one next in line to move.
  const sortedActiveOrders = [...data.activeOrders].sort((a, b) => {
    const byStage = (ACTIVE_STATUS_RANK[b.status] ?? -1) - (ACTIVE_STATUS_RANK[a.status] ?? -1)
    if (byStage !== 0) return byStage
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const displayPoints = localLoyalty ?? data.profile.loyaltyPoints
  const displayWallet = localWallet  ?? data.wallet.balance

  // ---- Stat pills config — now all interactive ----
  const statPills = [
    {
      icon: Package, value: data.statistics.activeOrders.toString(), label: 'Active Orders',
      onClick: () => router.push('/customer/orders'),
    },
    {
      icon: CheckCircle2, value: data.statistics.completedOrders.toString(), label: 'Completed',
      onClick: () => router.push('/customer/orders?status=delivered'),
    },
    {
      icon: Star, value: displayPoints.toString(), label: 'Loyalty Points',
      onClick: () => setLoyaltyOpen(true),
    },
    {
      icon: Wallet, value: formatINR(displayWallet), label: 'Wallet',
      onClick: () => setWalletOpen(true),
    },
  ]

  return (
    <>
      <div className="flex-1 overflow-x-hidden bg-muted/20">

        {/* ---- Compact header: greeting + stats, no heavy background ---- */}
        <div className="border-b border-border/50 bg-background pb-5 pt-6">
          <div className="container mx-auto px-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <h1 className="text-xl font-bold text-foreground sm:text-2xl">Hello, {firstName}! 👋</h1>
              </div>
              <button onClick={fetchDashboard} disabled={refreshing}
                className="rounded-full bg-muted p-2.5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50">
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </button>
            </div>

            {/* ---- Stat pills — sm+ only. On mobile, Loyalty/Wallet move into
                the compact address bar below and Active/Completed counts are
                dropped entirely (already one tap away via the bottom nav's
                Orders tab) to keep the first screenful tight. ---- */}
            <div className="mt-4 hidden gap-2.5 sm:grid sm:grid-cols-4">
              {statPills.map((stat, i) => (
                <motion.button
                  key={stat.label}
                  type="button"
                  onClick={stat.onClick}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex min-w-0 shrink items-center gap-2.5 rounded-xl border border-border/50 bg-card px-3 py-2 transition-all hover:border-primary/30 hover:bg-muted/40 active:scale-95 text-left cursor-pointer"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold leading-none text-foreground">{stat.value}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{stat.label}</div>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* ---- Address + New Order — sm+ only (unchanged) ---- */}
            <div className="mt-3 hidden gap-2.5 sm:flex">
              <div className="flex-1">
                <AddressDropdown addresses={data.addresses} selectedId={selectedAddressId} onSelect={selectAddress} />
              </div>
              <Link href={selectedAddressId ? `/customer/orders/create?address=${selectedAddressId}` : '/customer/orders/create'}
                className="group flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 sm:py-0">
                <Plus className="h-4 w-4" /> New Order
              </Link>
            </div>

            {/* ---- Mobile-only compact bar: address + loyalty + wallet, all
                in one row (no New Order button — the bottom nav already has
                one) — mirrors the quick-commerce pattern of address left,
                quick-glance pills right. ---- */}
            <div className="mt-4 flex items-center gap-2 sm:hidden">
              <div className="min-w-0 flex-1">
                <AddressDropdown addresses={data.addresses} selectedId={selectedAddressId} onSelect={selectAddress} compact />
              </div>
              <button type="button" onClick={() => setLoyaltyOpen(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-card px-2.5 py-1.5 transition-transform active:scale-95">
                <motion.span
                  animate={{ rotateY: [0, 360] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                  className="text-sm leading-none"
                  style={{ display: 'inline-block' }}
                >
                  🪙
                </motion.span>
                <span className="text-xs font-bold text-foreground">{displayPoints}</span>
              </button>
              <button type="button" onClick={() => setWalletOpen(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 bg-card px-2.5 py-1.5 transition-transform active:scale-95">
                <motion.span
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                  style={{ display: 'inline-block' }}
                >
                  <Wallet className="h-4 w-4 text-primary" />
                </motion.span>
                <span className="text-xs font-bold text-foreground">{formatINR(displayWallet)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ---- Main content ---- */}
        <div className="container mx-auto px-4 pb-12">

          {/* Active Orders — deliberately outside the two-column grid below.
              Inside the 2/3 column the carousel was clipped by the sidebar
              (cards read as "hidden behind" Quick Access), and it was also
              the single tallest thing in that column, which is what left the
              sidebar trailing off into a large empty gap. Full-width it fits
              every order on one screen and evens the two columns out. */}
          <div className="mt-4">
            {sortedActiveOrders.length === 0 ? (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingBag className="h-8 w-8" />
                </div>
                <h3 className="mb-1 font-semibold text-foreground">No Active Orders</h3>
                <p className="mb-5 text-sm text-muted-foreground">Place a laundry order and track it right here.</p>
                <Link href="/customer/orders/create"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Place New Order
                </Link>
              </motion.div>
            ) : (
              <ActiveOrdersSection orders={sortedActiveOrders} />
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">

            {/* ============ LEFT / MAIN COLUMN ============ */}
            <div className="min-w-0 space-y-6 lg:col-span-2">

              {/* Providers near you — based on the selected address, or the
                  customer's live location if they have none saved */}
              <ProvidersNearYou
                address={data.addresses.find(a => a.id === selectedAddressId) ?? null}
              />

              {/* Popular services */}
              <PopularServices />

              {/* Why Laundrease — marketing section */}
              {/* <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Why Customers Love Us</h2>
                </div>
                <WhyLaundrease />
              </motion.div> */}

              {/* Active Offers — pincode-scoped to the selected address, same
                  eligibility rules as checkout */}
              <ActiveOffers addressId={selectedAddressId} />
            </div>

            {/* ============ RIGHT / SIDEBAR ============ */}
            {/* Outer wrapper gets stretched by the grid to match the left
                column's (usually taller) height — that's what gives the
                inner sticky wrapper room to actually stick instead of
                trailing off into empty space once its own short content
                runs out while the left column keeps going. */}
            <div className="min-w-0">
            <div className="space-y-5 lg:sticky lg:top-20">

              {/* Quick links — desktop only; on mobile the bottom nav and the
                  new Book-again/providers/services sections cover these */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="hidden rounded-2xl border border-border/50 bg-card p-4 shadow-sm lg:block">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Access</p>
                <div className="space-y-1">
                  {[
                    { key: 'qp',  href: '/customer/quick-pickup',           icon: Zap,    label: 'Quick Pickup',      sub: 'No account needed',     onClick: null },
                    { key: 'wal', href: null,                       icon: Wallet, label: 'Wallet',             sub: formatINR(displayWallet), onClick: () => setWalletOpen(true) },
                    { key: 'ref', href: '/customer/refer-and-earn', icon: Gift,   label: 'Refer & Earn',       sub: 'Earn wallet credits',   onClick: null },
                    { key: 'cal', href: '/customer/pricing-calculator',      icon: Star,   label: 'Pricing Calculator', sub: 'Estimate your cost',    onClick: null },
                  ].map(item => {
                    const inner = (
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.sub}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    )
                    return item.onClick ? (
                      <button key={item.key} type="button" onClick={item.onClick} className="w-full text-left">{inner}</button>
                    ) : (
                      <Link key={item.key} href={item.href!}>{inner}</Link>
                    )
                  })}
                </div>
              </motion.div>

              {/* Refer & Earn — profile/settings/support are already one tap
                  away via the header menu and mobile bottom nav, so this
                  replaces those with something that isn't duplicated
                  anywhere else on the dashboard. */}
              <ReferralPromo />
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <LoyaltyModal
        open={loyaltyOpen}
        onClose={() => setLoyaltyOpen(false)}
        currentPoints={displayPoints}
        onRedeemed={(newPoints, walletAmt) => {
          setLocalLoyalty(newPoints)
          setLocalWallet((localWallet ?? data.wallet.balance) + walletAmt)
        }}
      />
      <WalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        balance={displayWallet}
      />
    </>
  )
}
