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
import { OrderConfirmation } from '../../create/components/OrderConfirmation'
import { SearchParamProvider } from '@/components/common/searchParamProvider'

function PaymentSuccessContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const orderId       = searchParams.get('order_id')

  const [orderNumber, setOrderNumber] = useState<string | null>(null)
  const [loading,      setLoading]    = useState(true)
  const [error,        setError]      = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) { setError('Missing order reference.'); setLoading(false); return }

    fetch(`/api/customer/orders/${orderId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error ?? 'Order not found')
        setOrderNumber(json.data.order.order_number)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
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

  return <OrderConfirmation orderId={parseInt(orderId, 10)} orderNumber={orderNumber} />
}

export default function PaymentSuccessPage() {
  return (
    <SearchParamProvider>
      <PaymentSuccessContent />
    </SearchParamProvider>
  )
}
