'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Package, MapPin, Wallet, Gift, Clock, Plus,
  ArrowRight, CheckCircle2, Truck, Star, Calendar,
  Tag, Loader2, AlertCircle, Sparkles, RefreshCw,
  ChevronRight, ChevronDown, Copy, Check, Zap,
  Home, Building2, ShoppingBag, Briefcase, Heart,
  X, Award, ArrowUpRight, ArrowDownLeft,
  ShieldCheck, Timer, Wind, Droplets, Play,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { cn } from '@/lib/utils'

// ---- Types --------------------------------------------------

interface Address {
  id: number; label: string; addressLine1: string; addressLine2: string | null
  landmark: string | null; city: string; state: string; postalCode: string
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
}
interface DashboardData {
  profile: { fullName: string; email: string; phone: string; profileImage: string | null; loyaltyPoints: number; totalOrders: number; lastOrderAt: string | null }
  addresses: Address[]
  activeOrder: ActiveOrder | null
  wallet: { balance: number; currency: string }
  coupons: Coupon[]
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

function AddressDropdown({ addresses, selectedId, onSelect }: {
  addresses: Address[]; selectedId: number | null; onSelect: (id: number) => void
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
    return (
      <Link href="/customer/addresses/new"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
        <Plus className="h-4 w-4" /> Add your first address
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
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

// ---- Coupon Card (unchanged) --------------------------------

function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => { await navigator.clipboard.writeText(coupon.code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const discountLabel = coupon.discountType === 'percent' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`
  return (
    <div className={cn('relative overflow-hidden rounded-xl border p-4 bg-primary/5',
      coupon.isPersonal ? 'border-primary/30' : 'border-dashed border-border/60 bg-card')}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className={cn('mb-1 inline-block rounded-lg px-2.5 py-1 text-sm font-bold bg-primary',
            coupon.isPersonal ? 'text-primary-foreground' : 'text-background')}>
            {discountLabel}
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{coupon.name}</p>
        </div>
        {coupon.isPersonal && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Yours</span>}
      </div>
      {coupon.description && <p className="mb-3 text-xs text-muted-foreground">{coupon.description}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <code className="text-xs font-mono font-semibold tracking-wider text-foreground">{coupon.code}</code>
        </div>
        <button onClick={handleCopy}
          className="flex items-center gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary">
          {copied ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {coupon.minOrderAmount && <span>Min. order ₹{coupon.minOrderAmount}</span>}
        {coupon.expiresAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Valid till {formatDate(coupon.expiresAt)}</span>}
      </div>
    </div>
  )
}

// ---- Providers near you -------------------------------------
// Horizontal scroll of provider cards for the selected address's pincode —
// same public search endpoint the order flow's step 1 uses. "Create order"
// deep-links into the flow with that provider pre-selected (?provider=).

interface NearbyProvider {
  id: number; business_name: string; city: string
  rating: number; rating_count: number; is_verified: boolean
  distance?: number
}

function ProvidersNearYou({ postalCode }: { postalCode: string | null }) {
  const [providers, setProviders] = useState<NearbyProvider[]>([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!postalCode) { setProviders([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/customer/laundry-providers/search?location=${postalCode}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setProviders(j.success ? (j.data?.providers ?? []) : []) })
      .catch(() => { if (!cancelled) setProviders([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [postalCode])

  if (!postalCode || (!loading && providers.length === 0)) return null

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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {p.business_name.charAt(0)}
                </div>
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
                {p.distance != null && <span>{Number(p.distance).toFixed(1)} km</span>}
                {p.is_verified && (
                  <span className="flex items-center gap-0.5 text-green-600"><ShieldCheck className="h-3 w-3" /> Verified</span>
                )}
              </div>
              <Link href={`/customer/orders/create?provider=${p.id}`}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                Create order <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ---- Book again ---------------------------------------------
// Last delivered order with a one-tap path back into the order flow with the
// same provider pre-selected. Provider id isn't in the list API's payload, so
// it's fetched lazily from the order-detail endpoint on tap — both are
// existing endpoints, nothing server-side changed.

interface LastOrder {
  id: string; order_number: string; created_at: string
  item_count: number; total_amount: number; provider_name: string | null
}

function BookAgain() {
  const router = useRouter()
  const [order,      setOrder]      = useState<LastOrder | null>(null)
  const [navigating, setNavigating] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/customer/orders?status=delivered&limit=1', { credentials: 'include' })
      .then(r => r.json())
      .then(j => { if (!cancelled && j.success && j.data.orders?.length > 0) setOrder(j.data.orders[0]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!order) return null

  const handleBookAgain = async () => {
    setNavigating(true)
    try {
      const res  = await fetch(`/api/customer/orders/${order.id}`, { credentials: 'include' })
      const json = await res.json()
      const providerId = json.success ? json.data?.provider?.id : null
      router.push(providerId ? `/customer/orders/create?provider=${providerId}` : '/customer/orders/create')
    } catch {
      router.push('/customer/orders/create')
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <RefreshCw className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Book again</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.item_count} item{order.item_count !== 1 ? 's' : ''}
            {order.provider_name && ` with ${order.provider_name}`}
            {' · '}{formatINR(order.total_amount)}
          </p>
        </div>
      </div>
      <button type="button" onClick={handleBookAgain} disabled={navigating}
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-60">
        {navigating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
        Book again
      </button>
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
  // ---- Main page ----------------------------------------------

export default function CustomerDashboard() {
  const { user, markUnauthorized } = useAuth()
  const router   = useRouter()

  const [data,              setData]             = useState<DashboardData | null>(null)
  const [loading,           setLoading]          = useState(true)
  const [refreshing,        setRefreshing]        = useState(false)
  const [error,             setError]            = useState(false)
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null)

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
        const def = json.data.addresses.find((a: Address) => a.isDefault)
        setSelectedAddressId(def?.id ?? json.data.addresses[0].id)
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
      <div className="min-h-screen bg-muted/20">
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
        <div className="container mx-auto px-4 pb-12">
          <div className="mt-4 grid animate-pulse gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-72 rounded-2xl bg-muted" />
              <div className="h-20 rounded-2xl bg-muted" />
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
  const statusMeta   = data.activeOrder ? (STATUS_META[data.activeOrder.status] ?? STATUS_META.pending) : null
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
      <div className="min-h-screen overflow-x-hidden bg-muted/20">

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

            {/* ---- Stat pills — one horizontal strip on mobile, grid on sm+ ---- */}
            <div className="mt-4 flex gap-2.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible">
              {statPills.map((stat, i) => (
                <motion.button
                  key={stat.label}
                  type="button"
                  onClick={stat.onClick}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex min-w-[8.5rem] shrink-0 items-center gap-2.5 rounded-xl border border-border/50 bg-card px-3 py-2 transition-all hover:border-primary/30 hover:bg-muted/40 active:scale-95 text-left cursor-pointer sm:min-w-0 sm:shrink"
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

            {/* ---- Address + New Order — moved up from below to use this space efficiently ---- */}
            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <div className="flex-1">
                <AddressDropdown addresses={data.addresses} selectedId={selectedAddressId} onSelect={setSelectedAddressId} />
              </div>
              <Link href="/customer/orders/create"
                className="group flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 sm:py-0">
                <Plus className="h-4 w-4" /> New Order
              </Link>
            </div>
          </div>
        </div>

        {/* ---- Main content ---- */}
        <div className="container mx-auto px-4 pb-12">
          <div className="mt-4 grid gap-6 lg:grid-cols-3">

            {/* ============ LEFT / MAIN COLUMN ============ */}
            <div className="min-w-0 space-y-6 lg:col-span-2">

              {/* Active Order */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                {data.activeOrder ? (
                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
                    <div className="border-b border-border/50 bg-muted/30 px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-foreground">Active Order</h2>
                            {data.activeOrder.isExpress && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                <Zap className="h-3 w-3" /> Express
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">#{data.activeOrder.orderNumber}</p>
                        </div>
                        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', statusMeta?.color)}>
                          {statusMeta?.label}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      <OrderTimeline order={data.activeOrder} />
                      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="mb-1 text-xs text-muted-foreground">Pickup</p>
                          <p className="flex items-center gap-1.5 font-medium text-foreground">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatDate(data.activeOrder.pickupDate)}
                            {data.activeOrder.pickupTimeSlot && <span className="text-muted-foreground">· {data.activeOrder.pickupTimeSlot}</span>}
                          </p>
                        </div>
                        {data.activeOrder.deliveryDate && (
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">Expected Delivery</p>
                            <p className="flex items-center gap-1.5 font-medium text-foreground">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              {formatDate(data.activeOrder.deliveryDate)}
                              {data.activeOrder.deliveryTimeSlot && <span className="text-muted-foreground">· {data.activeOrder.deliveryTimeSlot}</span>}
                            </p>
                          </div>
                        )}
                      </div>
                      {data.activeOrder.laundryName && (
                        <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/40 px-4 py-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                            {data.activeOrder.laundryName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Processing at</p>
                            <p className="text-sm font-semibold text-foreground">{data.activeOrder.laundryName}</p>
                          </div>
                        </div>
                      )}
                      <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Order Total</p>
                          <p className="text-xl font-bold text-foreground">{formatINR(data.activeOrder.totalAmount)}</p>
                        </div>
                        <Link href={`/customer/orders/${data.activeOrder.id}`}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md">
                          Track Order <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ShoppingBag className="h-8 w-8" />
                    </div>
                    <h3 className="mb-1 font-semibold text-foreground">No Active Orders</h3>
                    <p className="mb-5 text-sm text-muted-foreground">Place a laundry order and track it right here.</p>
                    <Link href="/customer/orders/create"
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90">
                      <Plus className="h-4 w-4" /> Place New Order
                    </Link>
                  </div>
                )}
              </motion.div>

              {/* Book again — last delivered order */}
              <BookAgain />

              {/* Providers near you — based on the selected address */}
              <ProvidersNearYou
                postalCode={data.addresses.find(a => a.id === selectedAddressId)?.postalCode ?? null}
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

              {/* Active Offers */}
              {data.coupons.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">
                      Your Offers
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{data.coupons.length}</span>
                    </h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.coupons.map(c => <CouponCard key={c.code} coupon={c} />)}
                  </div>
                </motion.div>
              )}
            </div>

            {/* ============ RIGHT / SIDEBAR ============ */}
            <div className="min-w-0 space-y-5">

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

              {/* Account summary */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Orders</span>
                    <span className="font-semibold text-foreground">{data.profile.totalOrders}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Spent</span>
                    <span className="font-semibold text-foreground">{formatINR(data.statistics.totalSpent)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Loyalty Points</span>
                    <button type="button" onClick={() => setLoyaltyOpen(true)}
                      className="flex items-center gap-1.5 font-semibold text-primary hover:underline">
                      {displayPoints}
                      {displayPoints >= 100 && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Redeemable
                        </span>
                      )}
                    </button>
                  </div>
                  {data.profile.lastOrderAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Order</span>
                      <span className="font-semibold text-foreground">{formatDate(data.profile.lastOrderAt)}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 border-t border-border/40 pt-3">
                  <Link href={`/customer/profile/${user?.id}`}
                    className="flex items-center justify-between text-sm font-medium text-primary hover:underline">
                    View Profile <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </motion.div>

              {/* Support */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Support</p>
                <div className="space-y-1">
                  {[
                    { href: '/customer/support',  label: 'My Tickets'    },
                    { href: '/customer/help-center',       label: 'Help Center'   },
                    { href: '/customer/safety-center',     label: 'Safety Center' },
                    { href: '/customer/settings', label: 'Settings'      },
                  ].map(item => (
                    <Link key={item.href} href={item.href}>
                      <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                        {item.label} <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>
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
