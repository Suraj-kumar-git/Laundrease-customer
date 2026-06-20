'use client'
// app/customer/addresses/[id]/edit/page.tsx

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react'
import { AddressForm } from '@/components/forms/AddressForm'

export default function EditAddressPage() {
  const { id } = useParams<{ id: string }>()
  const [address, setAddress] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch('/api/customer/addresses', { credentials: 'include' })
        const json = await res.json()
        if (!json.success) throw new Error('Failed to load addresses')
        const found = (json.data?.addresses ?? json.data ?? []).find((a: any) => String(a.id) === id)
        if (!found) throw new Error('Address not found')
        setAddress(found)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  return (
    <div className="container mx-auto max-w-xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/customer/addresses"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My Addresses
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Edit Address</h1>
            <p className="text-sm text-muted-foreground">Update your saved address</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : (
        <AddressForm
          addressId={Number(id)}
          initial={{
            label:          address.label ?? '',
            address_line1:  address.address_line1 ?? '',
            address_line2:  address.address_line2 ?? '',
            landmark:       address.landmark ?? '',
            neighborhood:   address.neighborhood ?? '',
            city:           address.city ?? '',
            state:          address.state ?? '',
            postal_code:    address.postal_code ?? '',
            country_code:   address.country_code ?? 'IN',
            instructions:   address.instructions ?? '',
            contact_name:   address.contact_name ?? '',
            contact_phone:  address.contact_phone ?? '',
            is_default:     address.is_default ?? false,
          }}
        />
      )}
    </div>
  )
}
