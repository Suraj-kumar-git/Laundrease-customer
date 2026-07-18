// app/sitemap.ts
// Static entries for every public customer page + the two partner landing
// pages, plus dynamic entries for individual career postings (aged out
// automatically as they expire, same WHERE clause as
// app/api/customer/public/careers/route.ts).

import type { MetadataRoute } from 'next'
import { query } from '@/lib/db'

const BASE_URL = 'https://laundrease.in'

const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/customer',                  priority: 1.0, changeFrequency: 'daily' },
  { path: '/customer/services',         priority: 0.9, changeFrequency: 'weekly' },
  { path: '/customer/pricing-calculator', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/customer/quick-pickup',     priority: 0.8, changeFrequency: 'weekly' },
  { path: '/customer/faq',              priority: 0.7, changeFrequency: 'monthly' },
  { path: '/customer/help-center',      priority: 0.7, changeFrequency: 'monthly' },
  { path: '/customer/about',            priority: 0.6, changeFrequency: 'monthly' },
  { path: '/customer/careers',          priority: 0.6, changeFrequency: 'weekly' },
  { path: '/customer/safety-center',    priority: 0.5, changeFrequency: 'monthly' },
  { path: '/customer/refer-and-earn',   priority: 0.5, changeFrequency: 'monthly' },
  { path: '/customer/community-guidelines', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/customer/privacy-policy',   priority: 0.3, changeFrequency: 'yearly' },
  { path: '/customer/terms-of-service', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/laundry',                   priority: 0.7, changeFrequency: 'monthly' },
  { path: '/delivery',                  priority: 0.7, changeFrequency: 'monthly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map(p => ({
    url: `${BASE_URL}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  let jobEntries: MetadataRoute.Sitemap = []
  try {
    const jobs = await query<{ public_id: string; posted_at: string }>(`
      SELECT public_id::TEXT AS public_id, posted_at::TEXT
      FROM career_jobs
      WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
    `)
    jobEntries = jobs.rows.map(j => ({
      url: `${BASE_URL}/customer/careers/${j.public_id}`,
      lastModified: new Date(j.posted_at),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }))
  } catch {
    // Sitemap must still render even if the DB is briefly unavailable —
    // static pages are far more valuable than failing the whole route.
  }

  return [...staticEntries, ...jobEntries]
}
