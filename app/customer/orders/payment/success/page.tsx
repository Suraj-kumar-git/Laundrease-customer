import Link from 'next/link'

export default function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: {
    provider?: string
    order_number?: string
    payment_id?: string
  }
}) {
  const provider = searchParams.provider ?? 'payment gateway'
  const orderNumber = searchParams.order_number ?? '-'
  const paymentId = searchParams.payment_id ?? '-'

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold text-green-600">Payment Successful</h1>

      <p className="mt-2 text-sm text-gray-600">
        Your payment has been completed successfully.
      </p>

      <div className="mt-6 rounded border p-4">
        <div className="mb-2">
          <strong>Provider:</strong> {provider}
        </div>
        <div className="mb-2">
          <strong>Order Number:</strong> {orderNumber}
        </div>
        <div>
          <strong>Payment ID:</strong> {paymentId}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/orders" className="rounded bg-black px-4 py-2 text-white">
          View Orders
        </Link>
        <Link href="/" className="rounded border px-4 py-2">
          Continue Shopping
        </Link>
      </div>
    </main>
  )
}