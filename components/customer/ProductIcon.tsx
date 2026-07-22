// components/customer/ProductIcon.tsx
//
// Renders a product/service icon as an image when one is mapped
// (lib/product-icons.ts), falling back to the existing DB emoji otherwise —
// so this rolls out item-by-item without anything breaking for unmapped
// items, and without a DB migration.
//
// SVGs are rendered as a plain <img> (they're already tiny vectors — the
// next/image optimization pipeline buys nothing for them). Raster formats
// (webp/png/jpg, for when real photography/artwork replaces the
// placeholders) go through next/image for automatic format negotiation,
// lazy loading, and explicit sizing to avoid layout shift.

import Image from 'next/image'

interface ProductIconProps {
  src?: string | null
  fallbackEmoji: string
  alt: string
  size?: number
  className?: string
}

export function ProductIcon({ src, fallbackEmoji, alt, size = 40, className }: ProductIconProps) {
  if (!src) {
    return (
      <span className={className} style={{ fontSize: size * 0.7, lineHeight: 1 }} role="img" aria-label={alt}>
        {fallbackEmoji}
      </span>
    )
  }

  if (src.endsWith('.svg')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} width={size} height={size} loading="lazy" className={className} />
  }

  return (
    <Image src={src} alt={alt} width={size} height={size} loading="lazy" className={className}
      style={{ width: size, height: size, objectFit: 'cover' }} />
  )
}
