import Link from 'next/link'

export default function PaymentFailurePage({
  searchParams,
}: {
  searchParams: {
    provider?: string
    order_number?: string
    message?: string
  }
}) {
  const provider = searchParams.provider ?? 'payment gateway'
  const orderNumber = searchParams.order_number ?? '-'
  const message = searchParams.message ?? 'Payment could not be completed.'

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold text-red-600">Payment Failed</h1>

      <p className="mt-2 text-sm text-gray-600">{message}</p>

      <div className="mt-6 rounded border p-4">
        <div className="mb-2">
          <strong>Provider:</strong> {provider}
        </div>
        <div>
          <strong>Order Number:</strong> {orderNumber}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/checkout" className="rounded bg-black px-4 py-2 text-white">
          Try Again
        </Link>
        <Link href="/" className="rounded border px-4 py-2">
          Back to Home
        </Link>
      </div>
    </main>
  )
}