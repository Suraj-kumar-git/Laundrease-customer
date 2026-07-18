import type React from "react"
import type { Metadata, Viewport } from "next"
import '@/styles/globals.css'
import { CapacitorSplash } from '@/components/capacitor-splash'

// Wraps every role (customer, laundry, delivery, admin, support) — metadataBase
// is needed here so relative OG/canonical URLs declared in role-specific
// layouts resolve correctly. Role layouts each set their own title/description;
// this is only the safety-net fallback for anything that doesn't.
export const metadata: Metadata = {
  metadataBase: new URL('https://laundrease.in'),
  title: 'Laundrease',
  description: 'Laundrease — on-demand laundry pickup and delivery.',
}

// viewportFit: 'cover' lets env(safe-area-inset-*) resolve to real values —
// needed so the Android app (edge-to-edge enforced on API 35+, where native
// status-bar coloring is ignored by the OS) can paint that inset itself.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <CapacitorSplash />
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-50 bg-primary"
          style={{ height: 'env(safe-area-inset-top)' }}
        />
        {children}
      </body>
    </html>
  )
}
