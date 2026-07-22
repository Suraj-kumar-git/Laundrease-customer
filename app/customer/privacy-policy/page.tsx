import type { Metadata } from 'next'
import { LegalPageRenderer } from '@/components/layout/legal-page-renderer'
import { PRIVACY_FALLBACK } from '@/lib/footer-page-fallbacks'
import type { LegalDocument } from '@/types/footer-pages'

export const metadata: Metadata = {
  title: 'Privacy Policy | Laundrease',
  description: 'Read the Laundrease Privacy Policy — how we collect, use, and protect your personal information.',
  keywords: ['Laundrease privacy policy'],
  alternates: { canonical: '/customer/privacy-policy' },
  openGraph: {
    title: 'Privacy Policy | Laundrease', type: 'website', url: '/customer/privacy-policy',
    description: 'How Laundrease collects, uses, and protects your personal information.',
  },
}

export const revalidate = 86400

async function getPrivacyPolicy(): Promise<LegalDocument> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/legal/privacy_policy`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const json = await res.json()
    if (!json.success || !json.data) throw new Error('Empty')
    return json.data as LegalDocument
  } catch {
    return PRIVACY_FALLBACK
  }
}

export default async function PrivacyPolicyPage() {
  const doc = await getPrivacyPolicy()

  return (
    <LegalPageRenderer
      doc={doc}
      breadcrumbLabel="Privacy Policy"
      relatedLabel="Terms of Service"
      relatedHref="/terms-of-service"
    />
  )
}
