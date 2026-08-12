// app/customer/faq/get-faqs.ts
//
// Single source for the customer FAQ list, shared by page.tsx (renders it) and
// layout.tsx (builds FAQPage JSON-LD from it) so the structured data can never
// advertise questions the page isn't actually showing.
//
// The static faqData is a FALLBACK ONLY — returned when the API errors or comes
// back empty, never merged with live rows. Merging is what let hardcoded
// questions appear on the public page that the admin couldn't see or edit in
// the CMS, including ones that had been removed from the database.

import { faqData } from './faq-data'

export interface FaqEntry {
  id: string
  question: string
  answer: string
  category: string
  icon: string
}

// The faqs table stores no icon, so it's derived from the category. Keys are
// lowercased category values; anything unmapped falls through to a safe
// default rather than rendering an undefined component.
const CATEGORY_ICON: Record<string, string> = {
  general:   'sparkles',
  orders:    'package',
  order:     'package',
  pricing:   'credit-card',
  payment:   'credit-card',
  payments:  'credit-card',
  delivery:  'truck',
  pickup:    'truck',
  partners:  'store',
  partner:   'store',
  services:  'sparkles',
  account:   'user',
  safety:    'shield',
  quality:   'star',
  schedule:  'clock',
  areas:     'map-pin',
}

export async function getFaqs(): Promise<FaqEntry[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/faq`, {
      next: { revalidate: 21600 },
    })
    if (!res.ok) throw new Error(`API ${res.status}`)

    const json = await res.json()
    const rows = json?.data?.faqs
    // An empty list is treated as a failure, not as "the admin deleted every
    // FAQ" — a public FAQ page with nothing on it is worse than stale copy.
    if (!json?.success || !Array.isArray(rows) || rows.length === 0) throw new Error('Empty')

    return rows.map((r: any): FaqEntry => {
      const category = String(r.category || 'general').trim().toLowerCase()
      return {
        id:       String(r.id),
        question: String(r.question ?? ''),
        answer:   String(r.answer ?? ''),
        category,
        icon:     CATEGORY_ICON[category] ?? 'sparkles',
      }
    })
  } catch {
    return faqData
  }
}
