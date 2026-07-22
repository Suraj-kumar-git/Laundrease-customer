// app/customer/quick-pickup/layout.tsx
// page.tsx in this segment is 'use client' (interactive booking flow) and
// can't export metadata itself — this sibling server layout carries it.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Quick Laundry Pickup | Laundrease',
  description: 'Book a same-day laundry pickup in Pune in under a minute — no account setup needed to get started.',
  keywords: ['same day laundry pickup', 'quick laundry pickup Pune', 'laundry pickup app'],
  alternates: { canonical: '/customer/quick-pickup' },
  openGraph: {
    title: 'Quick Laundry Pickup | Laundrease', type: 'website', url: '/customer/quick-pickup',
    description: 'Book a same-day laundry pickup in Pune in under a minute.',
  },
  twitter: { card: 'summary_large_image', title: 'Quick Laundry Pickup | Laundrease' },
}

export default function QuickPickupLayout({ children }: { children: React.ReactNode }) {
  return children
}
