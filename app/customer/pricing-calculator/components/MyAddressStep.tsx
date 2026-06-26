'use client'
// app/customer/pricing-calculator/components/MyAddressStep.tsx
// Authenticated-only entry point — pick a saved address, then a provider
// serving that address, to see that provider's exact pricing.

import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, MapPin, Plus } from 'lucide-react'
import Link from 'next/link'

interface Address {
  id: number
  label: string
  address_line1: string
  city: string
  postal_code: string
}

export function MyAddressStep({
  onAddressSelected, onBack,
}: {
  onAddressSelected: (address: Address) => void
  onBack: () => void
}) {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading,    setLoading]  = useState(true)
  const [error,      setError]    = useState('')

  useEffect(() => {
    fetch('/api/customer/addresses', { credentials: 'include' })
      .then(r => r.json())
      .then(j => {
        if (j.success) setAddresses(j.data?.addresses ?? j.data ?? [])
        else setError(j.error || 'Failed to load addresses')
      })
      .catch(() => setError('Failed to load addresses'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="font-semibold text-foreground">Choose a saved address</h2>
          <p className="text-xs text-muted-foreground">We&apos;ll find providers near it</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : addresses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No saved addresses yet</p>
          <Link href="/customer/addresses/new"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Add an address
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {addresses.map(addr => (
            <button
              key={addr.id}
              onClick={() => onAddressSelected(addr)}
              className="flex w-full items-start gap-3 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{addr.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {addr.address_line1}, {addr.city} {addr.postal_code}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
