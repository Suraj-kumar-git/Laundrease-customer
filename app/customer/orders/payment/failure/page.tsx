'use client'
// app/customer/orders/payment/failure/page.tsx
//
// Reached when an online payment fails/is cancelled — either via a server
// redirect from the PayU/Cashfree callback routes, or client-side when the
// Razorpay modal is dismissed. The order already exists in the DB (created
// before the gateway was ever launched), so the customer always has a way
// forward: retry the same payment, fall back to COD if eligible, or cancel.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  XCircle, RefreshCw, Banknote, Ban, Loader2, AlertCircle, Phone, Mail,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/auth-provider'
import { launchGatewayCheckout } from '@/lib/payment-client'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

interface OrderInfo {
  id: string
  order_number: string
  total_amount: number
  payment_status: string
}
interface PaymentRow { amount: number; payment_method: string; status: string }
interface GatewayInfo { gateway_configured: boolean; provider: string | null; cod_enabled: boolean; cod_max_amount: number }

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function PaymentFailureContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { user }      = useAuth()
  const orderId       = searchParams.get('order_id')
  const reason         = searchParams.get('reason')

  const [order,       setOrder]       = useState<OrderInfo | null>(null)
  const [payments,    setPayments]    = useState<PaymentRow[]>([])
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'retry' | 'cod' | 'cancel' | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) { setLoadError('Missing order reference.'); setLoading(false); return }

    Promise.all([
      fetch(`/api/customer/orders/${orderId}`, { credentials: 'include' }),
      fetch('/api/customer/payments/gateway-info'),
    ])
      .then(async ([orderRes, gwRes]) => {
        if (orderRes.status === 401) {
          // The gateway's redirect chain can occasionally land here without
          // the session cookie attached — the order itself is fine, so bounce
          // through login and come straight back instead of showing an error.
          const target = `/customer/orders/payment/failure?order_id=${orderId}${reason ? `&reason=${reason}` : ''}`
          router.replace(`/customer/auth/login?returnTo=${encodeURIComponent(target)}`)
          return
        }
        const orderJson = await orderRes.json()
        const gwJson     = await gwRes.json()
        if (!orderJson.success) throw new Error(orderJson.error ?? 'Order not found')
        setOrder(orderJson.data.order)
        setPayments(orderJson.data.payments ?? [])
        if (gwJson.success) setGatewayInfo(gwJson.data)
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [orderId])

  const walletPaid      = payments.filter(p => p.payment_method === 'wallet' && p.status === 'completed')
    .reduce((s, p) => s + p.amount, 0)
  const remainingAmount = order ? Math.max(0, order.total_amount - walletPaid) : 0
  const codEligible     = Boolean(gatewayInfo?.cod_enabled && remainingAmount <= (gatewayInfo?.cod_max_amount ?? 0))

  const handleRetryPayment = async () => {
    if (!order) return
    setActionLoading('retry'); setActionError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${order.id}/pay`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to initiate payment')

      await launchGatewayCheckout(json.data, {
        orderNumber:   order.order_number,
        customerName:  (user as any)?.full_name ?? (user as any)?.name,
        customerEmail: (user as any)?.email,
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
          router.push(`/customer/orders/payment/success?order_id=${order.id}`)
        },
      })
    } catch (err: any) {
      setActionError(err.message || 'Payment retry failed. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleContinueWithCod = async () => {
    if (!order) return
    setActionLoading('cod'); setActionError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${order.id}/switch-to-cod`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to switch to COD')
      router.push(`/customer/orders/payment/success?order_id=${order.id}`)
    } catch (err: any) {
      setActionError(err.message || 'Could not switch to Cash on Delivery.')
      setActionLoading(null)
    }
  }

  const handleCancelAndRetry = async () => {
    if (!order) return
    setActionLoading('cancel'); setActionError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${order.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ reason: 'Payment failed, customer chose to retry as a new order' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Failed to cancel order')
      router.push('/customer/orders/create')
    } catch (err: any) {
      setActionError(err.message || 'Could not cancel the order.')
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (loadError || !order) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-medium text-foreground">{loadError ?? 'Order not found'}</p>
        <Button className="mt-6" onClick={() => router.push('/customer')}>Go to Home</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/30">
          <XCircle className="h-10 w-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">Payment Failed</h1>
        <p className="mt-2 text-muted-foreground">
          {reason === 'verification_failed'
            ? "We couldn't verify your payment with the bank."
            : 'Your payment did not go through. Your order is still saved — choose how to proceed below.'}
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Number</p>
              <p className="font-mono text-lg font-bold text-foreground">#{order.order_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount Due</p>
              <p className="text-lg font-bold text-primary">{formatINR(remainingAmount)}</p>
            </div>
          </div>

          {actionError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" /> {actionError}
            </div>
          )}

          <div className="mt-5 space-y-3">
            <Button
              onClick={handleRetryPayment}
              disabled={actionLoading !== null}
              className="w-full bg-violet-600 hover:bg-violet-700 h-12 text-base font-semibold"
            >
              {actionLoading === 'retry'
                ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                : <RefreshCw className="mr-2 h-5 w-5" />}
              Retry Payment
            </Button>

            {codEligible ? (
              <Button
                onClick={handleContinueWithCod}
                disabled={actionLoading !== null}
                variant="outline"
                className="w-full h-12 text-base font-semibold"
              >
                {actionLoading === 'cod'
                  ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  : <Banknote className="mr-2 h-5 w-5" />}
                Continue with Cash on Delivery
              </Button>
            ) : (
              <Button
                onClick={handleCancelAndRetry}
                disabled={actionLoading !== null}
                variant="outline"
                className="w-full h-12 text-base font-semibold border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400"
              >
                {actionLoading === 'cancel'
                  ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  : <Ban className="mr-2 h-5 w-5" />}
                Cancel Order &amp; Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <h3 className="mb-3 font-semibold">Need Help?</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <a href="tel:+919876543210" className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-white dark:hover:bg-gray-800">
              <Phone className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-medium">Call Us</p>
                <p className="text-xs text-muted-foreground">+91 98765 43210</p>
              </div>
            </a>
            <a href="mailto:support@laundrease.in" className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-white dark:hover:bg-gray-800">
              <Mail className="h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-medium">Email Us</p>
                <p className="text-xs text-muted-foreground">support@laundrease.in</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function PaymentFailurePage() {
  return (
    <SearchParamProvider>
      <PaymentFailureContent />
    </SearchParamProvider>
  )
}
