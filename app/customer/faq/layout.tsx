// app/customer/faq/layout.tsx
// page.tsx in this segment is 'use client' (search/filter UI) and can't
// export metadata itself — this sibling server layout carries metadata plus
// FAQPage structured data, built from the same faqData the page renders.
// Imported from ./faq-data (a plain, non-'use client' module) rather than
// from page.tsx directly — importing a named export from a client-component
// module into a server component crosses the RSC client/server boundary and
// isn't guaranteed to behave as a plain value.

import type { Metadata } from 'next'
import { faqData } from './faq-data'

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

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
}

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  )
}
