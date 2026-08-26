// app/customer/quick-pickup/layout.tsx
//
// Server-side gate for the Quick Pickup page.
//
// Hiding the nav item is presentation, not enforcement — the URL is short,
// guessable, and already shared in emails and old links. This layout is a
// server component, so the switch is checked before any of the page ships,
// and a customer who types the address while the feature is off gets the
// normal 404 rather than a working form whose submissions nobody is watching.

import { notFound } from 'next/navigation'
import { isQuickPickupEnabled } from '@/lib/quick-pickup-config'

export default async function QuickPickupLayout({
  children,
}: { children: React.ReactNode }) {
  if (!(await isQuickPickupEnabled())) notFound()
  return <>{children}</>
}
