import type { Metadata } from 'next'
import {
  ShieldCheck, Star, MessageCircle, Truck,
  ThumbsUp, AlertTriangle, Ban, Phone,
  Users, Sparkles,
} from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading, PublicPageHero } from '@/components/layout/footer-page-layout'

export const metadata: Metadata = {
  title: 'Community Guidelines | Laundrease',
  description:
    'Read the Laundrease Community Guidelines — the standards of behaviour we expect from every customer, partner, and delivery agent on our platform.',
  keywords: ['Laundrease community guidelines', 'Laundrease code of conduct'],
  alternates: { canonical: '/customer/community-guidelines' },
  openGraph: {
    title: 'Community Guidelines | Laundrease', type: 'website', url: '/customer/community-guidelines',
    description: 'The standards of behaviour we expect from every customer, partner, and delivery agent on our platform.',
  },
  twitter: { card: 'summary_large_image', title: 'Community Guidelines | Laundrease' },
}

// ---- Types --------------------------------------------------
interface Guideline {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}

interface RuleGroup {
  heading: string
  icon: React.ComponentType<{ className?: string }>
  rules: string[]
}

// ---- Static content -----------------------------------------
const PRINCIPLES: Guideline[] = [
  {
    icon: ShieldCheck,
    title: 'Safety First',
    body: 'Everyone on our platform — customers, laundry partners, and delivery agents — deserves to feel safe. We will not tolerate any behaviour that threatens physical or emotional safety.',
  },
  {
    icon: Star,
    title: 'Respect & Dignity',
    body: 'Treat every person you interact with through Laundrease with the same respect you would want for yourself. Politeness costs nothing.',
  },
  {
    icon: ThumbsUp,
    title: 'Honest Feedback',
    body: 'Reviews and ratings help our community make better decisions. Be honest, be fair, and only rate experiences you actually had.',
  },
  {
    icon: Users,
    title: 'Shared Responsibility',
    body: 'A great community is everyone\'s job. If you see something that violates these guidelines, report it. Silence enables bad behaviour.',
  },
]

const CUSTOMER_RULES: RuleGroup = {
  heading: 'For Customers',
  icon: ShoppingBagIcon,
  rules: [
    'Treat delivery partners with courtesy and respect at all times — they are professionals doing their job.',
    'Be ready for pickup at the scheduled time, or update your instructions in advance.',
    'Do not include prohibited items in your laundry orders (cash, jewellery, illegal substances, hazardous materials).',
    'Provide accurate addresses and contact information to avoid failed pickups.',
    'Write honest, factual reviews based on your actual experience. Do not use reviews to extort discounts or threaten partners.',
    'Do not attempt to contact delivery partners or laundry providers outside the platform.',
    'Cancellations within the allowed window are fine. Repeated last-minute cancellations that waste partner time are not.',
  ],
}

const PARTNER_RULES: RuleGroup = {
  heading: 'For Laundry Partners',
  icon: SparklesIcon,
  rules: [
    'Handle every customer\'s garments with care, exactly as you would want your own clothes handled.',
    'Be transparent about service capabilities — if you cannot handle a specific fabric or stain, tell the customer before accepting.',
    'Maintain the quality standards you agreed to during onboarding. Consistent quality is non-negotiable.',
    'Respond promptly to customer messages and support requests. Silence creates distrust.',
    'Do not manipulate the rating system or ask customers to change their reviews.',
    'Keep your availability and capacity updated so customers are not disappointed.',
    'Report any quality incidents proactively — trying to hide a damaged garment always makes things worse.',
  ],
}

const DELIVERY_RULES: RuleGroup = {
  heading: 'For Delivery Partners',
  icon: Truck,
  rules: [
    'Follow all traffic laws and ride safely. No delivery is worth risking your life or others\'.',
    'Never open, inspect, or tamper with sealed laundry packages.',
    'Treat customer homes, building lobbies, and neighbourhoods with respect.',
    'Use only the in-app calling system — never share your personal number or contact customers directly.',
    'Photograph packages before pickup and after delivery as required by the app.',
    'If a customer is unavailable, follow the app\'s protocol — do not leave packages unsecured.',
    'Maintain the acceptance rate and on-time performance required by your partner agreement.',
  ],
}

const PROHIBITED: string[] = [
  'Harassment, threats, or intimidation of any kind — in person, via chat, or any other channel',
  'Discrimination based on religion, caste, gender, age, disability, or any other protected characteristic',
  'Fraudulent reviews, fake ratings, or any manipulation of the review system',
  'Sharing or soliciting personal contact information to conduct transactions outside the platform',
  'Using the platform to distribute spam, malware, or unsolicited promotions',
  'Impersonating Laundrease staff, partners, or other users',
  'Any illegal activity, including submitting prohibited items in laundry orders',
  'Physical or verbal abuse toward any platform participant',
]

// Placeholder icon components (using Lucide equivalents)
function ShoppingBagIcon({ className }: { className?: string }) {
  return <Users className={className} />
}
function SparklesIcon({ className }: { className?: string }) {
  return <Sparkles className={className} />
}

// ---- Sub-components -----------------------------------------
function PrincipleCard({ item }: { item: Guideline }) {
  const Icon = item.icon
  return (
    <div className="group rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md hover:shadow-primary/10">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
    </div>
  )
}

function RuleGroupSection({ group }: { group: RuleGroup }) {
  const Icon = group.icon
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">{group.heading}</h3>
      </div>
      <ul className="space-y-3">
        {group.rules.map((rule, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground leading-relaxed">{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Page ---------------------------------------------------
export default function CommunityGuidelinesPage() {
  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Community Guidelines' }]}>
      {/* Hero */}
      <PublicPageHero
        badge="Community Guidelines"
        icon={<Users className="h-3 w-3" />}
        title="How We Treat Each Other on Laundrease"
        subtitle="Laundrease works because people trust each other. These guidelines exist to protect that trust — for customers, laundry partners, and delivery agents alike."
      >
        <p className="text-xs text-muted-foreground">
          Last updated: January 2024
        </p>
      </PublicPageHero>

      {/* Core principles */}
      <PageSection>
        <SectionHeading
          badge="Our Foundation"
          title="Four Principles That Guide Everything"
          subtitle="Before the specific rules, these are the values we ask everyone on our platform to hold."
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((item, i) => (
            <PrincipleCard key={i} item={item} />
          ))}
        </div>
      </PageSection>

      {/* Role-specific rules */}
      <div className="bg-muted/20 border-y border-border/50">
        <PageSection>
          <SectionHeading
            title="Guidelines by Role"
            subtitle="We hold every participant to clear, specific standards appropriate to their role on the platform."
          />
          <div className="space-y-6">
            <RuleGroupSection group={CUSTOMER_RULES} />
            <RuleGroupSection group={PARTNER_RULES} />
            <RuleGroupSection group={DELIVERY_RULES} />
          </div>
        </PageSection>
      </div>

      {/* Prohibited behaviour */}
      <PageSection>
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-start gap-4">
            <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Behaviour That Is Never Acceptable
              </h2>
              <p className="mt-2 text-muted-foreground">
                The following actions will result in immediate account suspension and may be reported to relevant authorities.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 md:p-8">
            <ul className="space-y-3">
              {PROHIBITED.map((rule, i) => (
                <li key={i} className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-sm text-foreground/80 leading-relaxed">{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PageSection>

      {/* Enforcement */}
      <div className="bg-muted/20 border-t border-border/50">
        <PageSection>
          <div className="mx-auto max-w-3xl">
            <SectionHeading
              title="How We Enforce These Guidelines"
              subtitle={null}
            />
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  step: '01',
                  title: 'Review',
                  body: 'Every report is reviewed by a member of our Trust & Safety team within 24 hours. We look at all available evidence before taking action.',
                },
                {
                  step: '02',
                  title: 'Action',
                  body: 'Depending on severity: warnings for first-time minor violations, temporary suspensions for repeated issues, and permanent bans for serious violations.',
                },
                {
                  step: '03',
                  title: 'Appeal',
                  body: 'If you believe an action was taken in error, you can appeal within 14 days. We review all appeals fairly and respond within 5 business days.',
                },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-border/50 bg-card p-6">
                  <div className="mb-3 text-3xl font-bold text-primary/30">{item.step}</div>
                  <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </PageSection>
      </div>

      {/* Report CTA */}
      <div className="bg-primary">
        <PageSection tight>
          <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
            <div>
              <h2 className="text-xl font-bold text-primary-foreground">
                See something that violates these guidelines?
              </h2>
              <p className="mt-1 text-primary-foreground/80 text-sm">
                Report it. Every report is confidential and taken seriously.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="mailto:safety@laundrease.in"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/25"
              >
                <MessageCircle className="h-4 w-4" />
                safety@laundrease.in
              </a>
              <a
                href="tel:+919876543299"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary shadow-lg transition-all hover:bg-white/90"
              >
                <Phone className="h-4 w-4" />
                Safety Hotline
              </a>
            </div>
          </div>
        </PageSection>
      </div>
    </FooterPageLayout>
  )
}
