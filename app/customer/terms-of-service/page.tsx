import type { Metadata } from 'next'
import { LegalPageRenderer } from '@/components/layout/legal-page-renderer'
import { TERMS_FALLBACK } from '@/lib/footer-page-fallbacks'
import type { LegalDocument } from '@/types/footer-pages'

export const metadata: Metadata = {
  title: 'Terms of Service | Laundrease',
  description: 'Read the Laundrease Terms of Service — the rules and guidelines that govern use of our platform.',
}

export const revalidate = 86400 // 24 hours — changes rarely

async function getTerms(): Promise<LegalDocument> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/legal/terms_of_service`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const json = await res.json()
    if (!json.success || !json.data) throw new Error('Empty')
    return json.data as LegalDocument
  } catch {
    return TERMS_FALLBACK
  }
}

export default async function TermsOfServicePage() {
  const doc = await getTerms()

  return (
    <LegalPageRenderer
      doc={doc}
      breadcrumbLabel="Terms of Service"
      relatedLabel="Privacy Policy"
      relatedHref="/privacy-policy"
    />
  )
}
