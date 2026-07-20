import type React from "react"
import type { Metadata, Viewport } from "next"
import '@/styles/globals.css'

// Wraps every role (customer, laundry, delivery, admin, support) — metadataBase
// is needed here so relative OG/canonical URLs declared in role-specific
// layouts resolve correctly. Role layouts each set their own title/description;
// this is only the safety-net fallback for anything that doesn't.
export const metadata: Metadata = {
  metadataBase: new URL('https://laundrease.in'),
  title: 'Laundrease',
  description: 'Laundrease — on-demand laundry pickup and delivery.',
}

// viewportFit: 'cover' lets content draw under the iOS notch/Dynamic Island
// and home indicator, and is required for env(safe-area-inset-*) (used by
// fixed elements like the mobile bottom nav) to resolve to non-zero values
// instead of silently no-op'ing.
export const viewport: Viewport = {
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
