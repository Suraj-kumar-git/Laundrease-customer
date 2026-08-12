import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ShieldCheck, Leaf, Clock, Heart,
  Package, Smile, Store, MapPin,
  ArrowRight, Sparkles,
} from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading } from '@/components/layout/footer-page-layout'
import { GuestOnlyCta } from '@/components/common/guest-only-cta'
import { ABOUT_US_FALLBACK } from '@/lib/footer-page-fallbacks'
import { formatStat } from '@/lib/format-stat'
import type { PageContentBlock, CardItem, StatItem, HeroBody, TextBlockBody } from '@/types/footer-pages'
import { AboutPageLiveStats, getAboutPageLiveStats } from '@/lib/about-stats'

export const metadata: Metadata = {
  title: 'About Us | Laundrease',
  description: 'Learn about Laundrease — our story, mission, and the values that drive everything we do.',
  keywords: ['about Laundrease', 'laundry startup Pune', 'on-demand laundry company'],
  alternates: { canonical: '/customer/about' },
  openGraph: {
    title: 'About Us | Laundrease', type: 'website', url: '/customer/about',
    description: 'Learn about Laundrease — our story, mission, and the values that drive everything we do.',
  },
  twitter: { card: 'summary_large_image', title: 'About Us | Laundrease' },
}

// Revalidate every 6 hours — content changes rarely
export const revalidate = 21600

// ---- Icon resolver -----------------------------------------
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'shield-check': ShieldCheck,
  leaf: Leaf,
  clock: Clock,
  heart: Heart,
  package: Package,
  smile: Smile,
  store: Store,
  'map-pin': MapPin,
  sparkles: Sparkles,
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Sparkles
  return <Icon className={className} />
}

// ---- Data fetch ---------------------------------------------
async function getAboutContent(): Promise<PageContentBlock[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/pages/about_us`, {
      next: { revalidate: 21600 },
    })
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const json = await res.json()
    if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
      throw new Error('Empty or invalid response')
    }
    return json.data as PageContentBlock[]
  } catch {
    return ABOUT_US_FALLBACK
  }
}

// ---- Section renderers -------------------------------------
function HeroSection({ block }: { block: PageContentBlock }) {
  const body = block.body as HeroBody
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />

      <PageSection className="relative py-24 md:py-32">
        <div className="max-w-3xl">
          {body.badge && (
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              {body.badge}
            </span>
          )}
          <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {block.title}
          </h1>
          {block.subtitle && (
            <p className="mt-6 text-xl text-muted-foreground leading-relaxed">
              {block.subtitle}
            </p>
          )}
          {body.cta_text && body.cta_href && (
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href={body.cta_href}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
              >
                {body.cta_text}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {body.tagline && (
                <span className="text-sm text-muted-foreground italic">
                  &quot;{body.tagline}&quot;
                </span>
              )}
            </div>
          )}
        </div>
      </PageSection>
    </div>
  )
}

function StatsSection({ block, liveStats }: { block: PageContentBlock; liveStats: AboutPageLiveStats | null }) {
  const stats = block.body as StatItem[]
  return (
    <div className="border-y border-border/50 bg-muted/30">
      <PageSection tight>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat, i) => {
            const live = liveStats?.[stat.icon as keyof AboutPageLiveStats]
            const value = live !== undefined ? formatStat(live) : stat.value
            return (
              <div key={i} className="text-center">
                <div className="text-4xl font-bold text-primary sm:text-5xl">
                  {value}
                </div>
                <div className="mt-2 text-sm font-medium text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            )
          })}
        </div>
      </PageSection>
    </div>
  )
}

function MissionSection({ block }: { block: PageContentBlock }) {
  const body = block.body as TextBlockBody
  return (
    <PageSection>
      <div className="grid items-center gap-16 md:grid-cols-2">
        <div>
          <SectionHeading title={block.title ?? ''} subtitle={null} />
          <p className="text-lg text-muted-foreground leading-relaxed">
            {body.body}
          </p>
          {body.highlight && (
            <blockquote className="mt-8 border-l-4 border-primary pl-6">
              <p className="text-xl font-semibold text-foreground italic">
                &quot;{body.highlight}&quot;
              </p>
            </blockquote>
          )}
        </div>
        {/* Decorative panel */}
        <div className="relative hidden md:block">
          <div className="aspect-square max-w-sm overflow-hidden rounded-3xl">
            <img
              src="/laundrease-about.png"
              alt="Laundry basket with freshly folded clothes"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-4 -right-4 h-32 w-32 rounded-2xl bg-primary/10" />
          <div className="absolute -top-4 -left-4 h-20 w-20 rounded-2xl bg-primary/8" />
        </div>
      </div>
    </PageSection>
  )
}

function ValuesSection({ block }: { block: PageContentBlock }) {
  const cards = block.body as CardItem[]
  return (
    <div className="bg-muted/20">
      <PageSection>
        <SectionHeading
          title={block.title ?? ''}
          subtitle={block.subtitle}
          centered
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

function StorySection({ block }: { block: PageContentBlock }) {
  const body = block.body as TextBlockBody
  return (
    <PageSection>
      <div className="mx-auto max-w-3xl text-center">
        <SectionHeading
          title={block.title ?? ''}
          subtitle={null}
          centered
        />
        <p className="text-lg text-muted-foreground leading-relaxed">
          {body.body}
        </p>
        {body.highlight && (
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary/10 px-6 py-3 text-sm font-semibold text-primary">
            <MapPin className="h-4 w-4" />
            {body.highlight}
          </div>
        )}
      </div>
    </PageSection>
  )
}

// ---- Page ---------------------------------------------------
export default async function AboutUsPage() {
  const [blocks, liveStats] = await Promise.all([
    getAboutContent(),
    getAboutPageLiveStats(),
  ])

  const getBlock = (key: string) => blocks.find((b:any) => b.section_key === key)

  const hero = getBlock('hero')
  const stats = getBlock('stats')
  const mission = getBlock('mission')
  const values = getBlock('values')
  const story = getBlock('story')

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'About Us' }]}>
      {hero && <HeroSection block={hero} />}
      {stats && <StatsSection block={stats} liveStats={liveStats} />}
      {mission && <MissionSection block={mission} />}
      {values && <ValuesSection block={values} />}
      {story && <StorySection block={story} />}

      {/* CTA Banner */}
      <div className="bg-primary">
        <PageSection tight>
          <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
            <div>
              <h2 className="text-2xl font-bold text-primary-foreground">
                Ready to reclaim your time?
              </h2>
              <p className="mt-1 text-primary-foreground/80">
                Join thousands of happy customers.
              </p>
            </div>
            <GuestOnlyCta className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl" />
          </div>
        </PageSection>
      </div>
    </FooterPageLayout>
  )
}
