'use client'
// app/customer/addresses/new/page.tsx

import Link from 'next/link'
import { ArrowLeft, MapPin } from 'lucide-react'
import { AddressForm } from '@/components/forms/AddressForm'

export default function NewAddressPage() {
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
            <h1 className="text-xl font-bold text-foreground">Add New Address</h1>
            <p className="text-sm text-muted-foreground">We&apos;ll use this for pickup and delivery</p>
          </div>
        </div>
      </div>

      <AddressForm />
    </div>
  )
}
