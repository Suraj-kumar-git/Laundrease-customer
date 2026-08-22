// app/customer/faq/layout.tsx
// Carries the segment's metadata plus FAQPage structured data.
//
// The JSON-LD is built from getFaqs() — the same loader page.tsx renders from
// — so the questions Google is told about are always the questions actually on
// the page. It used to be built from the static faqData, which meant the
// structured data kept advertising hardcoded questions regardless of what the
// CMS held.

import type { Metadata } from 'next'
import { getFaqs } from './get-faqs'
import { safeJsonLd } from '@/lib/json-ld'

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | Laundrease',
  description: 'Answers to common questions about Laundrease services, pricing, orders, delivery, and partnerships.',
  keywords: ['Laundrease FAQ', 'laundry pickup delivery questions', 'Laundrease pricing FAQ'],
  alternates: { canonical: '/customer/faq' },
  openGraph: {
    title: 'Frequently Asked Questions | Laundrease', type: 'website', url: '/customer/faq',
    description: 'Answers to common questions about Laundrease services, pricing, orders, delivery, and partnerships.',
  },
  twitter: { card: 'summary_large_image', title: 'Frequently Asked Questions | Laundrease' },
}

export default async function FaqLayout({ children }: { children: React.ReactNode }) {
  const items = await getFaqs()
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        // safeJsonLd, not JSON.stringify: this payload is CMS text, and a raw
        // stringify lets a '</script>' inside an answer break out of the tag.
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />
      {children}
    </>
  )
}
