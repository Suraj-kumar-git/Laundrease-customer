// app/customer/opengraph-image.tsx
// Default Open Graph image for every page under /customer, generated at
// request time via next/og — no external design tool needed. Any page can
// override this with its own opengraph-image.tsx/openGraph.images later.

import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, #2563eb 0%, #0891b2 100%)',
          color: '#ffffff', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2, display: 'flex' }}>
          Laundrease
        </div>
        <div style={{ fontSize: 36, marginTop: 20, opacity: 0.9, display: 'flex' }}>
          Laundry, picked up and delivered
        </div>
      </div>
    ),
    { ...size }
  )
}
