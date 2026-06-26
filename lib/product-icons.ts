// lib/product-icons.ts
// Maps a product_type/service name to a static placeholder image under
// /public/icons — keyed by name rather than a DB column, so this rolls out
// without a migration. <ProductIcon> falls back to the DB's emoji `icon`
// field for anything not in this map (so nothing breaks for unmapped items).
//
// Swap an entry's path to real artwork later, or migrate this map into a
// DB column once final assets exist — no other code needs to change.

export const PRODUCT_ICON_MAP: Record<string, string> = {
  'Regular Laundry (Mixed)':  '/icons/products/regular-laundry-mixed.svg',
  'T-Shirt':                  '/icons/products/t-shirt.svg',
  'Formal Shirt':             '/icons/products/formal-shirt.svg',
  'Trouser / Jeans':          '/icons/products/trouser-jeans.svg',
  'Shorts':                   '/icons/products/shorts.svg',
  'Undergarments (set)':      '/icons/products/undergarments-set.svg',
  'Socks (pair)':             '/icons/products/socks-pair.svg',
  'Gym / Sports Wear':        '/icons/products/gym-sports-wear.svg',

  'Saree':                    '/icons/products/saree.svg',
  'Salwar Kameez':            '/icons/products/salwar-kameez.svg',
  'Lehenga (set)':            '/icons/products/lehenga-set.svg',
  'Sherwani':                 '/icons/products/sherwani.svg',
  'Suit (2-piece)':           '/icons/products/suit-2-piece.svg',
  'Blazer / Jacket':          '/icons/products/blazer-jacket.svg',
  'Dress':                    '/icons/products/dress.svg',
  'Kurta (men)':              '/icons/products/kurta-men.svg',
  'Saree Blouse':             '/icons/products/saree-blouse.svg',
  'Dupatta / Stole':          '/icons/products/dupatta-stole.svg',

  'Single Bedsheet':          '/icons/products/single-bedsheet.svg',
  'Double Bedsheet':          '/icons/products/double-bedsheet.svg',
  'Pillow Cover':             '/icons/products/pillow-cover.svg',
  'Single Blanket':           '/icons/products/single-blanket.svg',
  'Double Blanket':           '/icons/products/double-blanket.svg',
  'Bath Towel':               '/icons/products/bath-towel.svg',
  'Hand Towel':               '/icons/products/hand-towel.svg',
  'Curtain (single)':         '/icons/products/curtain-single.svg',
  'Curtain (pair)':           '/icons/products/curtain-pair.svg',
  'Table Cloth':              '/icons/products/table-cloth.svg',
  'Sofa Cover (seat)':        '/icons/products/sofa-cover-seat.svg',

  'Sneakers / Sports Shoes':  '/icons/products/sneakers-sports-shoes.svg',
  'Formal Shoes':             '/icons/products/formal-shoes.svg',
  'Sandals / Slippers':       '/icons/products/sandals-slippers.svg',
  'Woolen Sweater':           '/icons/products/woolen-sweater.svg',
  'Winter Jacket / Coat':     '/icons/products/winter-jacket-coat.svg',
  'Backpack / Bag':           '/icons/products/backpack-bag.svg',
  'Stuffed Toy':              '/icons/products/stuffed-toy.svg',
}

export const SERVICE_ICON_MAP: Record<string, string> = {
  'Wash & Fold':    '/icons/services/wash-fold.svg',
  'Dry Cleaning':   '/icons/services/dry-cleaning.svg',
  'Steam Ironing':  '/icons/services/steam-ironing.svg',
  'Wash & Iron':    '/icons/services/wash-iron.svg',
  'Stain Removal':  '/icons/services/stain-removal.svg',
  'Shoe Cleaning':  '/icons/services/shoe-cleaning.svg',
}

export function resolveProductIconSrc(name: string): string | null {
  return PRODUCT_ICON_MAP[name] ?? null
}

export function resolveServiceIconSrc(name: string): string | null {
  return SERVICE_ICON_MAP[name] ?? null
}
