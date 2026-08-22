import type { Metadata } from 'next'
import {
  ShieldCheck, BadgeCheck, Star, RefreshCw,
  Scan, Camera, Package, AlertTriangle,
  Lock, EyeOff, Smartphone, Trash2,
  Phone, Mail, Sparkles,
} from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading, PublicPageHero } from '@/components/layout/footer-page-layout'
import { SAFETY_CENTER_FALLBACK } from '@/lib/footer-page-fallbacks'
import type { PageContentBlock, HeroBody, CardItem, TextBlockBody } from '@/types/footer-pages'

export const metadata: Metadata = {
  title: 'Safety Center | Laundrease',
  description: 'Learn how Laundrease keeps you, your belongings, and your data safe.',
  keywords: ['is Laundrease safe', 'laundry service trust and safety', 'Laundrease data privacy'],
  alternates: { canonical: '/customer/safety-center' },
  openGraph: {
    title: 'Safety Center | Laundrease', type: 'website', url: '/customer/safety-center',
    description: 'Learn how Laundrease keeps you, your belongings, and your data safe.',
  },
  twitter: { card: 'summary_large_image', title: 'Safety Center | Laundrease' },
}

export const revalidate = 21600

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'shield-check': ShieldCheck,
  'badge-check': BadgeCheck,
  star: Star,
  'refresh-cw': RefreshCw,
  scan: Scan,
  camera: Camera,
  package: Package,
  'alert-triangle': AlertTriangle,
  lock: Lock,
  'eye-off': EyeOff,
  smartphone: Smartphone,
  'trash-2': Trash2,
  phone: Phone,
  mail: Mail,
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? ShieldCheck
  return <Icon className={className} />
}

async function getSafetyContent(): Promise<PageContentBlock[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/pages/safety_center`, {
      next: { revalidate: 21600 },
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const json = await res.json()
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0)
      throw new Error('Empty')
    return json.data as PageContentBlock[]
  } catch {
    return SAFETY_CENTER_FALLBACK
  }
}

function CardsSection({
  block,
  accent = false,
}: {
  block: PageContentBlock
  accent?: boolean
}) {
  const cards = block.body as CardItem[]
  return (
    <div className={accent ? 'bg-muted/20' : ''}>
      <PageSection>
        <SectionHeading
          title={block.title ?? ''}
          subtitle={block.subtitle ?? undefined}
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md hover:shadow-primary/10"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <DynamicIcon name={card.icon} className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">{card.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  )
}

function ReportSection({ block }: { block: PageContentBlock }) {
  const body = block.body as TextBlockBody
  return (
    <div className="bg-primary">
      <PageSection tight>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-primary-foreground sm:text-3xl">
            {block.title}
          </h2>
          <p className="mt-4 text-primary-foreground/80 leading-relaxed">
            {body.body}
          </p>
          {body.highlight && (
            <p className="mt-3 font-semibold text-primary-foreground">
              {body.highlight}
            </p>
          )}
          {body.contacts && body.contacts.length > 0 && (
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              {body.contacts.map((contact, i) => (
                <a
                  key={i}
                  href={
                    contact.type === 'phone'
                      ? `tel:${contact.value.replace(/\s/g, '')}`
                      : `mailto:${contact.value}`
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25"
                >
                  <DynamicIcon
                    name={contact.type === 'phone' ? 'phone' : 'mail'}
                    className="h-4 w-4"
                  />
                  <span className="text-white/70 text-xs">{contact.label}:</span>
                  {contact.value}
                </a>
              ))}
            </div>
          )}
        </div>
      </PageSection>
    </div>
  )
}

export default async function SafetyCenterPage() {
  const blocks = await getSafetyContent()

  const hero = blocks.find((b) => b.section_key === 'hero')
  const partnerSafety = blocks.find((b) => b.section_key === 'partner_safety')
  const itemSafety = blocks.find((b) => b.section_key === 'item_safety')
  const dataSafety = blocks.find((b) => b.section_key === 'data_safety')
  const report = blocks.find((b) => b.section_key === 'report')

  const heroBody = hero?.body as HeroBody | undefined

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Safety Center' }]}>
      {/* Hero */}
      <PublicPageHero
        badge={heroBody?.badge}
        icon={<ShieldCheck className="h-3 w-3" />}
        title={hero?.title ?? 'Safety Center'}
        subtitle={hero?.subtitle}
      >
        {/* Trust indicators */}
        <div className="flex flex-wrap gap-2.5">
          {[
            { icon: 'shield-check', label: 'Verified Partners' },
            { icon: 'lock', label: 'Encrypted Data' },
            { icon: 'eye-off', label: 'Number Masking' },
          ].map((item) => (
            <div
              key={item.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm sm:text-sm"
            >
              <DynamicIcon name={item.icon} className="h-3.5 w-3.5 text-primary" />
              {item.label}
            </div>
          ))}
        </div>
      </PublicPageHero>

      {/* Partner safety */}
      {partnerSafety && <CardsSection block={partnerSafety} />}

      {/* Item safety */}
      {itemSafety && <CardsSection block={itemSafety} accent />}

      {/* Data safety */}
      {dataSafety && <CardsSection block={dataSafety} />}

      {/* Report section */}
      {report && <ReportSection block={report} />}
    </FooterPageLayout>
  )
}
