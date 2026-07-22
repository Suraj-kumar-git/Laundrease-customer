// app/robots.ts
// Disallow every logged-in/transactional customer path, and everything under
// /laundry and /delivery except their bare landing pages (trailing slash on
// those two blocks the auth/onboarding/dashboard subtrees while leaving the
// public "become a partner" pages themselves crawlable). Admin and support
// have no public marketing content — blocked entirely.

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/customer/orders',
        '/customer/checkout',
        '/customer/dashboard',
        '/customer/addresses',
        '/customer/profile',
        '/customer/settings',
        '/customer/support',
        '/customer/feedback',
        '/customer/auth',
        '/laundry/',
        '/delivery/',
        '/admin',
        '/support',
        '/api/',
      ],
    },
    sitemap: 'https://laundrease.in/sitemap.xml',
  }
}
