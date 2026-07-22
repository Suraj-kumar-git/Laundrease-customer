// app/customer/services/layout.tsx
// page.tsx in this segment is 'use client' (interactive service browser) and
// can't export metadata itself — this sibling server layout carries it.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Laundry & Dry Cleaning Services | Laundrease',
  description: 'Browse wash & fold, dry cleaning, and ironing services from trusted local providers in Pune. Compare prices and book online in minutes.',
  keywords: ['dry cleaning services Pune', 'laundry services near me', 'wash and fold price', 'ironing service Pune'],
  alternates: { canonical: '/customer/services' },
  openGraph: {
    title: 'Laundry & Dry Cleaning Services | Laundrease', type: 'website', url: '/customer/services',
    description: 'Browse wash & fold, dry cleaning, and ironing services from trusted local providers in Pune.',
  },
  twitter: { card: 'summary_large_image', title: 'Laundry & Dry Cleaning Services | Laundrease' },
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
