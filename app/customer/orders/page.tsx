'use client'
// app/customer/orders/page.tsx
// Orders list. Completed orders show clickable stars → ReviewModal opens.

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package, Plus, ChevronRight, Calendar, Clock,
  Store, Zap, Loader2, AlertCircle, Filter,
  ShoppingBag, CheckCircle, XCircle, Truck, Star, ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { ReviewModal } from '@/components/reviews/ReviewModal'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

// ---- Types --------------------------------------------------
interface Order {
  id:               string
  order_number:     string
  status:           string
  pickup_date:      string
  pickup_time_slot: string | null
  delivery_date:    string | null
  is_express:       boolean
  subtotal:         number
  total_amount:     number
  payment_status:   string
  payment_method:   string | null
  created_at:       string
  provider_name:    string | null
  provider_city:    string | null
  item_count:       number
  service_count:    number
}

interface ReviewState {
  orderId:              string
  orderNumber:          string
  providerName?:        string | null
  deliveryPartnerName?: string | null
  hasProvider:          boolean
  hasDelivery:          boolean
  existingReview?:      any
}

// ---- Status config ------------------------------------------
const STATUS_CONFIG: Record<string, {
  label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }>
}> = {
  pending:          { label: 'Pending',          color: 'text-amber-700',   bg: 'bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400',    icon: Clock },
  confirmed:        { label: 'Confirmed',        color: 'text-blue-700',    bg: 'bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400',       icon: CheckCircle },
  assigned_for_pickup:{ label: 'Delivery Partner Assigned',        color: 'text-blue-700',    bg: 'bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400',       icon: Truck },
  out_for_pickup:   { label: 'Partner On the Way for Pickup',        color: 'text-cyan-700',    bg: 'bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-400',       icon: Clock },
  picked_up:        { label: 'Picked Up',        color: 'text-blue-700',  bg: 'bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400', icon: Package },
  processing:       { label: 'At Laundry',       color: 'text-indigo-700',  bg: 'bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400', icon: Package },
  ready_for_delivery:{ label: 'Item is ready to dispatch from laundry',   color: 'text-teal-700',    bg: 'bg-teal-100 dark:bg-teal-950/40 dark:text-teal-400',       icon: Package },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-emerald-700', bg: 'bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400', icon: Truck },
  delivered:        { label: 'Delivered',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40 dark:text-green-400',    icon: CheckCircle },
  completed:        { label: 'Completed',        color: 'text-green-700',   bg: 'bg-green-100 dark:bg-green-950/40 dark:text-green-400',    icon: CheckCircle },
  cancelled:        { label: 'Cancelled',        color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40 dark:text-red-400',          icon: XCircle },
  failed:           { label: 'Order Failed',     color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40 dark:text-red-400',          icon: XCircle },
  rejected:         { label: 'Rejected',         color: 'text-red-700',     bg: 'bg-red-100 dark:bg-red-950/40 dark:text-red-400',          icon: XCircle },
  // returned:         { label: 'Returned',         color: 'text-orange-700',  bg: 'bg-orange-100 dark:bg-orange-950/40 dark:text-orange-400', icon: Package },
}

const REVIEWABLE = new Set(['delivered', 'completed'])

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending',     label: 'Pending' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'processing',  label: 'At Laundry' },
  { value: 'delivered',   label: 'Delivered' },
  // { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
  { value: 'failed',      label: 'Order Failed' },
  { value: 'rejected',    label: 'Rejected' },
]

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}
function formatDate(d: string) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'bg-muted', color: 'text-foreground', icon: Package }
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', cfg.bg, cfg.color)}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  )
}

// ---- Inline star row (click to open review modal) -----------
function RateStars({
  existingRating, onRate,
}: { existingRating?: number | null; onRate: () => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-0.5" onClick={e => { e.stopPropagation(); onRate() }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`Rate ${n} stars`}
          className="transition-transform hover:scale-110"
        >
          <Star className={cn(
            'h-4 w-4 transition-colors',
            n <= (hovered || (existingRating ?? 0))
              ? 'fill-amber-400 text-amber-400'
              : 'fill-muted text-muted-foreground/25 hover:fill-amber-200 hover:text-amber-200'
          )} />
        </button>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {existingRating ? 'Edit review' : 'Rate us'}
      </span>
    </div>
  )
}

// ---- Order card ---------------------------------------------
function OrderCard({
  order,
  onRateClick,
  reviewedRating,
}: {
  order: Order
  onRateClick: (order: Order) => void
  reviewedRating?: number | null
}) {
  const router   = useRouter()
  const isReviewable = REVIEWABLE.has(order.status)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/50 bg-card overflow-hidden transition-all hover:border-border hover:shadow-sm"
    >
      {/* Clickable main area */}
      <div
        className="cursor-pointer p-4"
        onClick={() => router.push(`/customer/orders/${order.id}`)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-sm font-bold text-foreground font-mono">#{order.order_number}</p>
              {order.is_express && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <Zap className="h-2.5 w-2.5" /> Express
                </span>
              )}
            </div>
            {order.provider_name && (
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{order.provider_name}{order.provider_city ? `, ${order.provider_city}` : ''}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Pickup: {formatDate(order.pickup_date)}</span>
              {order.pickup_time_slot && <span className="text-muted-foreground/70">· {order.pickup_time_slot}</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.item_count} item{order.item_count !== 1 ? 's' : ''} · {order.service_count} service{order.service_count !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge status={order.status} />
            <p className="text-base font-bold text-foreground">{formatINR(order.total_amount)}</p>
          </div>
        </div>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between border-t border-border/30 px-4 py-2.5">
        <p className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <div className="flex items-center gap-3">
          {/* Star rating row — only on reviewable orders */}
          {isReviewable && (
            <RateStars
              existingRating={reviewedRating}
              onRate={() => onRateClick(order)}
            />
          )}
          <ChevronRight
            className="h-4 w-4 cursor-pointer text-muted-foreground"
            onClick={() => router.push(`/customer/orders/${order.id}`)}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ---- Orders list page ---------------------------------------
function PageContent() {
  const { user } = useAuth()
  const [orders,       setOrders]       = useState<Order[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [page,         setPage]         = useState(1)
  const [hasMore,      setHasMore]      = useState(false)
  const [total,        setTotal]        = useState(0)

  // Map orderId → existing review rating (so star fill is correct)
  const [reviewedMap, setReviewedMap] = useState<Record<string, number | null>>({})

  // Review modal state
  const [reviewTarget, setReviewTarget] = useState<ReviewState | null>(null)

  const fetchOrders = useCallback(async (p: number, filter: string, replace: boolean) => {
    if (p === 1) setLoading(true); else setLoadingMore(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '10' })
      if (filter) params.set('status', filter)
      const res  = await fetch(`/api/customer/orders?${params}`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed')
      const newOrders: Order[] = json.data.orders
      setOrders(prev => replace ? newOrders : [...prev, ...newOrders])
      setTotal(json.data.pagination.total)
      setHasMore(p < json.data.pagination.total_pages)

      // For reviewable orders, fetch existing review status in parallel
      const reviewable = newOrders.filter(o => REVIEWABLE.has(o.status))
      if (reviewable.length > 0) {
        await Promise.all(reviewable.map(async o => {
          try {
            const r = await fetch(`/api/customer/reviews?orderId=${o.id}`, { credentials: 'include' })
            const j = await r.json()
            if (j.success && j.data.existing_review) {
              setReviewedMap(prev => ({
                ...prev,
                [o.id]: j.data.existing_review.overall_rating
                  ?? j.data.existing_review.service_rating
                  ?? j.data.existing_review.delivery_rating
                  ?? null,
              }))
            }
          } catch { /* silent */ }
        }))
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false); setLoadingMore(false)
    }
  }, [])

  useEffect(() => { setPage(1); fetchOrders(1, statusFilter, true) }, [statusFilter, fetchOrders])

  const handleRateClick = async (order: Order) => {
    try {
      const res  = await fetch(`/api/customer/reviews?orderId=${order.id}`, { credentials: 'include' })
      const json = await res.json()
      setReviewTarget({
        orderId:     order.id,
        orderNumber: order.order_number,
        providerName:        json.data?.provider_name,
        deliveryPartnerName: json.data?.delivery_partner_name,
        hasProvider: json.data?.has_provider ?? true,
        hasDelivery: json.data?.has_delivery ?? true,
        existingReview: json.data?.existing_review,
      })
    } catch {
      setReviewTarget({
        orderId: order.id, orderNumber: order.order_number,
        hasProvider: true, hasDelivery: true,
      })
    }
  }

  const handleReviewSaved = () => {
    // Refresh the rating shown for this order
    if (reviewTarget) {
      fetchOrders(1, statusFilter, true)
    }
    setReviewTarget(null)
  }

  return (
    <>
      <div className="container mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <Link href="/customer/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
            {total > 0 && <p className="mt-0.5 text-sm text-muted-foreground">{total} order{total !== 1 ? 's' : ''} total</p>}
          </div>
          <Link href="/customer/orders/create"
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Order</span>
          </Link>
        </div>

        {/* Status filter chips */}
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
          {STATUS_FILTERS.map(f => (
            <button key={f.value} type="button" onClick={() => {
                setStatusFilter(f.value)
                const url = new URL(window.location.href)
                if (f.value) url.searchParams.set('status', f.value)
                else url.searchParams.delete('status')
                window.history.replaceState(null, '', url.toString())
              }}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all',
                statusFilter === f.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/50 bg-card text-muted-foreground hover:border-border hover:text-foreground'
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={() => fetchOrders(1, statusFilter, true)}
              className="mt-3 text-xs text-primary hover:underline">Try again</button>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 py-20 text-center">
            <ShoppingBag className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="font-medium text-foreground">
              {statusFilter ? `No ${STATUS_CONFIG[statusFilter]?.label ?? statusFilter} orders` : 'No orders yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter ? 'Try a different filter' : "When you place an order it'll appear here"}
            </p>
            {!statusFilter && (
              <Link href="/customer/orders/create"
                className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <Plus className="h-4 w-4" /> Place First Order
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence>
                {orders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onRateClick={handleRateClick}
                    reviewedRating={reviewedMap[order.id]}
                  />
                ))}
              </AnimatePresence>
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button type="button"
                  onClick={() => { const next = page + 1; setPage(next); fetchOrders(next, statusFilter, false) }}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-xl border border-border/50 px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50">
                  {loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : 'Load more orders'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review modal */}
      {reviewTarget && (
        <ReviewModal
          open={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          orderId={reviewTarget.orderId}
          orderNumber={reviewTarget.orderNumber}
          providerName={reviewTarget.providerName}
          deliveryPartnerName={reviewTarget.deliveryPartnerName}
          hasProvider={reviewTarget.hasProvider}
          hasDelivery={reviewTarget.hasDelivery}
          existingReview={reviewTarget.existingReview}
          onSaved={handleReviewSaved}
        />
      )}
    </>
  )
}
export default function LoginPage() {
  return (
    <SearchParamProvider>
      <PageContent />
    </SearchParamProvider>
  )
}