'use client'
// app/customer/orders/payment/success/page.tsx
//
// Two flows land here:
//   A) New order checkout (online payment) → shows full OrderConfirmation
//   B) Paying an existing COD order from the order-details page → shows a brief
//      payment-confirmed overlay (with txn details + progress bar) then redirects
//      back to the order details page.
//
// Differentiator: if the order's payment_method contains 'cod', it's flow B.

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, AlertCircle, Receipt, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/components/cart-provider'
import { OrderConfirmation } from '../../create/components/OrderConfirmation'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

// ─── Brief payment-confirmed overlay (flow B) ─────────────────────────────────

function PaymentConfirmedOverlay({
  orderId,
  orderNumber,
  paymentMethod,
  onDone,
}: {
  orderId: string
  orderNumber: string
  paymentMethod: string
  onDone: () => void
}) {
  const DURATION = 4000
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      const e = Date.now() - startRef.current
      setElapsed(e)
      if (e >= DURATION) { clearInterval(id); onDone() }
    }, 50)
    return () => clearInterval(id)
  }, [onDone])

  const progress = Math.min((elapsed / DURATION) * 100, 100)

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl p-8 text-center space-y-5">

        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400"/>
        </div>

        <div>
          <h1 className="text-xl font-bold text-foreground">Payment Successful!</h1>
          <p className="text-sm text-muted-foreground mt-1">Your order is now fully paid online.</p>
        </div>

        {/* Details */}
        <div className="rounded-xl bg-muted/40 divide-y divide-border text-left text-sm">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
            <span className="text-muted-foreground">Order</span>
            <span className="ml-auto font-mono font-medium text-foreground">{orderNumber}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Receipt className="w-3.5 h-3.5 text-muted-foreground shrink-0"/>
            <span className="text-muted-foreground">Method</span>
            <span className="ml-auto font-medium text-foreground capitalize">{paymentMethod.replace(/\+/g, ' + ')}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all ease-linear"
              style={{ width: `${progress}%`, transitionDuration: '50ms' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Redirecting to order details…</p>
        </div>

      </div>
    </div>
  )
}

// ─── Main page content ─────────────────────────────────────────────────────────

function PaymentSuccessContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const orderId       = searchParams.get('order_id')
  const source        = searchParams.get('source') // 'cod_switch' | null
  const { clear: clearGuestCart } = useCart()

  const [orderNumber,    setOrderNumber]    = useState<string | null>(null)
  const [paymentMethod,  setPaymentMethod]  = useState<string>('online')
  const [isCodPay,       setIsCodPay]       = useState(false)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (!orderId) { setError('Missing order reference.'); setLoading(false); return }

    fetch(`/api/customer/orders/${orderId}`, { credentials: 'include' })
      .then(res => {
        if (res.status === 401) {
          router.replace(`/customer/auth/login?returnTo=${encodeURIComponent(`/customer/orders/payment/success?order_id=${orderId}`)}`)
          return null
        }
        return res.json()
      })
      .then(json => {
        if (!json) return
        if (!json.success) throw new Error(json.error ?? 'Order not found')
        const order = json.data.order
        setOrderNumber(order.order_number)
        // Detect flow B: COD order paying online after the fact
        const method: string = order.payment_method ?? ''
        setPaymentMethod(method)
        setIsCodPay(method.includes('cod'))
        clearGuestCart()
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !orderId || !orderNumber) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-medium text-foreground">{error ?? 'Order not found'}</p>
        <Button className="mt-6" onClick={() => router.push('/customer/dashboard')}>Go to Dashboard</Button>
      </div>
    )
  }

  // Flow C: switched from failed online payment to COD → show order confirmation
  if (source === 'cod_switch') {
    return <OrderConfirmation orderId={orderId} orderNumber={orderNumber} />
  }

  // Flow B: paying existing COD order online later → brief overlay then back to order details
  if (isCodPay) {
    return (
      <PaymentConfirmedOverlay
        orderId={orderId}
        orderNumber={orderNumber}
        paymentMethod={paymentMethod}
        onDone={() => router.replace(`/customer/orders/${orderId}`)}
      />
    )
  }

  // Flow A: new online order checkout → full order confirmation
  return <OrderConfirmation orderId={orderId} orderNumber={orderNumber} />
}

export default function PaymentSuccessPage() {
  return (
    <SearchParamProvider>
      <PaymentSuccessContent />
    </SearchParamProvider>
  )
}
