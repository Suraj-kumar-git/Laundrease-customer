import type { Metadata } from 'next'
import {
  Package, Sparkles, Truck, CreditCard,
  UserCircle, MessageCircle, Mail, Phone,
  HelpCircle,
} from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading, PublicPageHero } from '@/components/layout/footer-page-layout'
import { HELP_CENTER_FALLBACK } from '@/lib/footer-page-fallbacks'
import { safeJsonLd } from '@/lib/json-ld'
import type { PageContentBlock, HeroBody, FaqGroupBody, CardItem } from '@/types/footer-pages'
import { FaqAccordion } from '@/components/ui/faq-accordion'

export const metadata: Metadata = {
  title: 'Help Center | Laundrease',
  description: 'Find answers to common questions about Laundrease — orders, payments, delivery, and more.',
  keywords: ['Laundrease help', 'laundry order support', 'Laundrease customer service'],
  alternates: { canonical: '/customer/help-center' },
  openGraph: {
    title: 'Help Center | Laundrease', type: 'website', url: '/customer/help-center',
    description: 'Find answers to common questions about Laundrease — orders, payments, delivery, and more.',
  },
  twitter: { card: 'summary_large_image', title: 'Help Center | Laundrease' },
}

export const revalidate = 21600

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  orders: Package,
  services: Sparkles,
  delivery: Truck,
  payment: CreditCard,
  account: UserCircle,
  'message-circle': MessageCircle,
  mail: Mail,
  phone: Phone,
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? HelpCircle
  return <Icon className={className} />
}

async function getHelpContent(): Promise<PageContentBlock[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/pages/help_center`, {
      next: { revalidate: 21600 },
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const json = await res.json()
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) throw new Error('Empty')
    return json.data as PageContentBlock[]
  } catch {
    return HELP_CENTER_FALLBACK
  }
}

export default async function HelpCenterPage() {
  const blocks = await getHelpContent()

  const hero = blocks.find((b) => b.section_key === 'hero')
  const faqGroups = blocks.filter((b) => b.section_type === 'faq_group')
  const contact = blocks.find((b) => b.section_key === 'contact')

  const heroBody = hero?.body as HeroBody | undefined
  const contactCards = contact?.body as CardItem[] | undefined

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqGroups.flatMap((block) => {
      const body = block.body as FaqGroupBody
      return (body.items || []).map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      }))
    }),
  }

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Help Center' }]}>
      {faqJsonLd.mainEntity.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
      {/* Hero */}
      <PublicPageHero
        badge={heroBody?.badge}
        icon={<HelpCircle className="h-3 w-3" />}
        title={hero?.title ?? 'Help Center'}
        subtitle={hero?.subtitle}
      />

      {/* FAQ Groups */}
      {faqGroups.length > 0 && (
        <PageSection>
          <div className="mx-auto max-w-3xl">
            {/* Category nav pills */}
            <div className="mb-10 flex flex-wrap gap-2">
              {faqGroups.map((block) => {
                const body = block.body as FaqGroupBody
                return (
                  <a
                    key={block.section_key}
                    href={`#${block.section_key}`}
                    className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  >
                    <DynamicIcon name={body.icon} className="h-3.5 w-3.5" />
                    {block.title}
                  </a>
                )
              })}
            </div>

            <div className="space-y-12">
              {faqGroups.map((block) => {
                const body = block.body as FaqGroupBody
                return (
                  <section key={block.section_key} id={block.section_key}>
                    <div className="mb-5 flex items-center gap-3">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <DynamicIcon name={body.icon} className="h-5 w-5" />
                      </div>
                      <h2 className="text-xl font-semibold text-foreground">
                        {block.title}
                      </h2>
                    </div>
                    <FaqAccordion items={body.items} />
                  </section>
                )
              })}
            </div>
          </div>
        </PageSection>
      )}

      {/* Contact section */}
      {contactCards && contactCards.length > 0 && (
        <div className="bg-muted/20 border-t border-border/50">
          <PageSection>
            <SectionHeading
              title={contact?.title ?? 'Still Need Help?'}
              subtitle={contact?.subtitle ?? undefined}
              centered
            />
            <div className={`grid gap-6 ${contactCards.length === 2 ? 'mx-auto max-w-2xl sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              {contactCards.map((card, i) => (
                <a
                  key={i}
                  href={card.action_href ?? '#'}
                  className="group flex flex-col items-center rounded-2xl border border-border/50 bg-card p-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <DynamicIcon name={card.icon} className="h-7 w-7" />
                  </div>
                  <h3 className="font-semibold text-foreground">{card.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {card.body}
                  </p>
                  {card.action_label && (
                    <span className="mt-4 text-sm font-semibold text-primary group-hover:underline">
                      {card.action_label} →
                    </span>
                  )}
                </a>
              ))}
            </div>
          </PageSection>
        </div>
      )}
    </FooterPageLayout>
  )
}
