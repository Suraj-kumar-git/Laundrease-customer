'use client'
// app/customer/orders/payment/success/page.tsx
//
// Single confirmation destination for BOTH COD/wallet orders (rendered
// in-place by app/customer/orders/create/page.tsx) and online-payment
// orders (reached here after the PayU/Cashfree/Razorpay callback redirects
// back into the app). Same OrderConfirmation component either way, so the
// post-purchase experience is identical regardless of payment method.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/components/cart-provider'
import { OrderConfirmation } from '../../create/components/OrderConfirmation'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

function PaymentSuccessContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const orderId       = searchParams.get('order_id')
  const { clear: clearGuestCart } = useCart()

  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [loading,      setLoading]    = useState(true)
  const [error,        setError]      = useState<string | null>(null)
  
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  useEffect(() => {
    if (!orderId) { setError('Missing order reference.'); setLoading(false); return }

    fetch(`/api/customer/orders/${orderId}`, { credentials: 'include' })
      .then(res => {
        if (res.status === 401) {
          // The gateway's redirect chain can occasionally land here without
          // the session cookie attached — the order itself is fine (the
          // payment callback already confirmed it), so bounce through login
          // and come straight back instead of showing a scary auth error.
          router.replace(`/customer/auth/login?returnTo=${encodeURIComponent(`/customer/orders/payment/success?order_id=${orderId}`)}`)
          return null
        }
        return res.json()
      })
      .then(json => {
        if (!json) return
        if (!json.success) throw new Error(json.error ?? 'Order not found')
        setOrderNumber(json.data.order.order_number)
        // Reaching this page at all means the gateway callback already
        // confirmed payment — the local cart was deliberately kept around
        // until now (see orders/create/page.tsx) so it can finally go.
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
        <Button className="mt-6" onClick={() => router.push('/customer')}>Go to Home</Button>
      </div>
    )
  }

  return <OrderConfirmation orderId={orderId} orderNumber={orderNumber} />
}

export default function PaymentSuccessPage() {
  return (
    <SearchParamProvider>
      <PaymentSuccessContent />
    </SearchParamProvider>
  )
}
