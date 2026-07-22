// app/customer/refer-and-earn/layout.tsx
// page.tsx in this segment is 'use client' (interactive referral flow) and
// can't export metadata itself — this sibling server layout carries it.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refer and Earn | Laundrease',
  description: 'Invite friends to Laundrease and earn rewards for every referral who places their first order.',
  keywords: ['Laundrease refer and earn', 'Laundrease referral program'],
  alternates: { canonical: '/customer/refer-and-earn' },
  openGraph: {
    title: 'Refer and Earn | Laundrease', type: 'website', url: '/customer/refer-and-earn',
    description: 'Invite friends to Laundrease and earn rewards for every referral who places their first order.',
  },
  twitter: { card: 'summary_large_image', title: 'Refer and Earn | Laundrease' },
}

export default function ReferAndEarnLayout({ children }: { children: React.ReactNode }) {
  return children
}
