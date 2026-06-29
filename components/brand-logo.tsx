'use client'
// components/brand-logo.tsx
// Single source of truth for the Laundrease logo across every role's
// header/sidebar/auth pages.
//
// NEXT_PUBLIC_S3_LOGO_URL is the primary source (so the logo can be swapped
// from S3 without a redeploy); the bundled /public asset is the fallback if
// that env var isn't set, or if loading it ever fails at runtime (network
// blip, object renamed, CORS) — handled via onError below.
//
// Note on speed: a same-origin /public file paints slightly faster than S3
// on an uncached first load (no extra DNS + TLS handshake to a different
// host) — but for a small logo that's cached after the first visit, the gap
// is negligible next to the convenience of updating branding without a
// redeploy, so S3 stays primary.

import { useState } from 'react'
import Image, { type ImageProps } from 'next/image'

const LOCAL_LOGO_SRC = '/laundrease-logo.PNG'
const S3_LOGO_SRC = process.env.NEXT_PUBLIC_S3_LOGO_URL || null

type BrandLogoProps = Omit<ImageProps, 'src' | 'alt'> & {
  alt?: string
}

export function BrandLogo({ alt = 'Laundrease', ...props }: BrandLogoProps) {
  const [src, setSrc] = useState(S3_LOGO_SRC || LOCAL_LOGO_SRC)

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      onError={() => {
        if (src !== LOCAL_LOGO_SRC) setSrc(LOCAL_LOGO_SRC)
      }}
    />
  )
}
