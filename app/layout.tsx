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

// viewportFit: 'cover' is required for env(safe-area-inset-*) to return
// anything other than 0 on iOS Safari — without it, any safe-area padding
// anywhere in the app (e.g. clearing the home-indicator bar) silently does
// nothing on notched/Dynamic-Island iPhones.
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
      <body>{children}</body>
    </html>
  )
}
