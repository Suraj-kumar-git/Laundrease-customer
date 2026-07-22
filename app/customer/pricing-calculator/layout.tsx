// app/customer/pricing-calculator/layout.tsx
// page.tsx in this segment is 'use client' (interactive calculator) and
// can't export metadata itself — this sibling server layout carries it.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Laundry Price Calculator | Laundrease',
  description: 'Estimate the cost of your laundry, dry cleaning, or ironing order in seconds — compare live prices from providers near you in Pune.',
  keywords: ['laundry price calculator', 'dry cleaning cost Pune', 'laundry cost estimate'],
  alternates: { canonical: '/customer/pricing-calculator' },
  openGraph: {
    title: 'Laundry Price Calculator | Laundrease', type: 'website', url: '/customer/pricing-calculator',
    description: 'Estimate the cost of your laundry, dry cleaning, or ironing order in seconds.',
  },
  twitter: { card: 'summary_large_image', title: 'Laundry Price Calculator | Laundrease' },
}

export default function PricingCalculatorLayout({ children }: { children: React.ReactNode }) {
  return children
}
