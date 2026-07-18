import type React from "react"
import type { Metadata } from "next"
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
