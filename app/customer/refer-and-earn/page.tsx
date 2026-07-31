'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Gift, Copy, Check, Share2, Users, Wallet,
  ChevronRight, CheckCircle2, Loader2, ArrowRight,
  Zap, TrendingUp, Clock, AlertCircle, Star,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { FooterPageLayout, PageSection, SectionHeading } from '@/components/layout/footer-page-layout'
import { cn } from '@/lib/utils'
import type { ReferralProgramConfig, CustomerReferralData } from '@/types/referral'

function formatINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---- Copy button --------------------------------------------
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-primary">
      {copied ? <><Check className="h-4 w-4 text-emerald-500" /> Copied!</> : <><Copy className="h-4 w-4" /> {label}</>}
    </button>
  )
}

// ---- Program inactive state ---------------------------------
function ProgramInactive() {
  return (
    <PageSection>
      <div className="mx-auto max-w-md rounded-2xl border border-border/50 bg-muted/30 p-12 text-center">
        <div className="mb-4 text-5xl">🎁</div>
        <h2 className="text-xl font-semibold text-foreground">Refer & Earn Coming Soon</h2>
        <p className="mt-3 text-muted-foreground">
          Our referral program is being updated. Check back soon for exciting rewards!
        </p>
      </div>
    </PageSection>
  )
}

// ---- Guest state (not logged in) ----------------------------
function GuestState({ config }: { config: ReferralProgramConfig }) {
  return (
    <PageSection>
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-8 rounded-2xl border border-primary/20 bg-primary/5 p-8">
          <Gift className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">Sign In to See Your Referral Code</h2>
          <p className="mt-3 text-muted-foreground">
            Create an account or sign in to get your personal referral code and start earning.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/customer/auth/login"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/customer/auth/register"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20">
              Create Account
            </Link>
          </div>
        </div>

        {/* Still show how the program works */}
        <ProgramSteps config={config} />
      </div>
    </PageSection>
  )
}

// ---- Program steps ------------------------------------------
function ProgramSteps({ config }: { config: ReferralProgramConfig }) {
  const discountLabel = config.referee_discount_type === 'percent'
    ? `${config.referee_discount_value}% off`
    : formatINR(config.referee_discount_value)

  return (
    <div className="mt-10">
      <SectionHeading title="How It Works" subtitle="Three simple steps to start earning." centered />
      <div className="grid gap-6 sm:grid-cols-3">
        {[
          {
            step: '01', icon: Share2,
            title: 'Share Your Code',
            body: 'Share your unique referral code with friends and family via WhatsApp, Instagram, or any channel.',
          },
          {
            step: '02', icon: Users,
            title: 'They Sign Up & Order',
            body: `Your friend signs up using your code and gets ${discountLabel} on their first order (min. order ${formatINR(config.min_order_amount_for_reward)}).`,
          },
          {
            step: '03', icon: Wallet,
            title: 'You Earn Wallet Credits',
            body: `You earn ${config.referrer_reward_percent}% of their order value as wallet credits, up to ${formatINR(config.referrer_max_reward_per_order)} per order, for their first ${config.referrer_max_orders_per_referee} orders.`,
          },
        ].map((item) => (
          <div key={item.step} className="rounded-2xl border border-border/50 bg-card p-6 text-center shadow-sm">
            <div className="mb-1 text-3xl font-bold text-primary/20">{item.step}</div>
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="h-6 w-6" />
            </div>
            <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Main authenticated view --------------------------------
function AuthenticatedReferral({
  config, data,
}: {
  config: ReferralProgramConfig
  data: CustomerReferralData
}) {
  const shareText = `Hey! I use Laundrease for my laundry and it's amazing 🧺\nUse my referral code ${data.code} when signing up and get ${config.referee_discount_type === 'percent' ? config.referee_discount_value + '% off' : '₹' + config.referee_discount_value + ' off'} your first order!\nSign up: ${process.env.NEXT_PUBLIC_CUSTOMER_URL}/register?ref=${data.code}`

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Join Laundrease', text: shareText })
    } else {
      await navigator.clipboard.writeText(shareText)
    }
  }

  const discountLabel = config.referee_discount_type === 'percent'
    ? `${config.referee_discount_value}%`
    : formatINR(config.referee_discount_value)

  return (
    <div className="space-y-8">
      {/* Your code card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-8 text-primary-foreground shadow-lg shadow-primary/25">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-white/5" />
        <div className="relative">
          <p className="mb-2 text-sm font-semibold text-primary-foreground/70 uppercase tracking-widest">
            Your Referral Code
          </p>
          <div className="mb-5 flex items-center gap-4">
            <span className="text-4xl font-bold tracking-wider">{data.code}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <CopyButton text={data.code} label="Copy Code" />
            <button onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/30">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
          <p className="mt-4 text-xs text-primary-foreground/60">
            Friends who sign up with your code get {discountLabel} off their first order
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Users, label: 'Total Referrals', value: data.total_referrals.toString(), color: 'text-blue-500' },
          { icon: TrendingUp, label: 'Total Earned', value: formatINR(data.total_earnings), color: 'text-emerald-500' },
          { icon: Wallet, label: 'Active Referees', value: data.referees.filter((r) => r.status === 'active').length.toString(), color: 'text-primary' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <div className={cn('mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl', stat.color, 'bg-current/10')}>
              <stat.icon className={cn('h-5 w-5', stat.color)} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Was this user referred? Show their coupon */}
      {data.was_referred && data.own_coupon_code && !data.own_discount_applied && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                You have a first-order discount!
              </p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
                Apply coupon <strong className="font-mono">{data.own_coupon_code}</strong> at checkout to get {discountLabel} off your first order.
              </p>
              <CopyButton text={data.own_coupon_code} label="Copy Coupon" />
            </div>
          </div>
        </div>
      )}

      {/* Referee history */}
      {data.referees.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border/50 bg-muted/30 px-6 py-4">
            <h3 className="font-semibold text-foreground">Your Referrals</h3>
          </div>
          <div className="divide-y divide-border/50">
            {data.referees.map((referee, i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-foreground">{referee.referee_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {formatDate(referee.created_at)} ·{' '}
                      {referee.orders_counted} of {config.referrer_max_orders_per_referee} orders counted
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(referee.orders_counted / config.referrer_max_orders_per_referee) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {referee.orders_counted}/{config.referrer_max_orders_per_referee}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-foreground">{formatINR(referee.total_earned_by_referrer)}</p>
                    <span className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      referee.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                      referee.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {referee.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.referees.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-foreground">No referrals yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Share your code and start earning when friends sign up.
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Page ---------------------------------------------------
export default function ReferAndEarnPage() {
  const { user } = useAuth()
  const [config, setConfig] = useState<ReferralProgramConfig | null>(null)
  const [referralData, setReferralData] = useState<CustomerReferralData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/customer/public/referral-program/config')
        const json = await res.json()
        if (json.success) setConfig(json.data)
      } catch {}
    }

    const fetchReferralData = async () => {
      if (!user) return
      try {
        const res = await fetch('/api/customer/referral', { credentials: 'include' })
        const json = await res.json()
        if (json.success) setReferralData(json.data)
      } catch {}
    }

    Promise.all([fetchConfig(), fetchReferralData()]).finally(() => setLoading(false))
  }, [user])

  if (loading) {
    return (
      <FooterPageLayout>
        <PageSection>
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageSection>
      </FooterPageLayout>
    )
  }

  if (!config || !config.is_active) {
    return (
      <FooterPageLayout breadcrumbs={[{ label: 'Refer & Earn' }]}>
        <ProgramInactive />
      </FooterPageLayout>
    )
  }

  const discountLabel = config.referee_discount_type === 'percent'
    ? `${config.referee_discount_value}% off`
    : `₹${config.referee_discount_value} off`

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Refer & Earn' }]}>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <PageSection className="relative py-20 md:py-28">
          <div className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <Gift className="h-3 w-3" />
              {config.program_name}
            </span>
            <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
              Earn While Your Friends Get Fresh Laundry
            </h1>
            <p className="mt-5 text-xl text-muted-foreground leading-relaxed">
              Share your code. They get <strong>{discountLabel}</strong> on their first order.
              You earn <strong>{config.referrer_reward_percent}%</strong> wallet credits on their orders — up to {formatINR(config.referrer_max_reward_per_order)} per order, for their first {config.referrer_max_orders_per_referee} orders.
            </p>
          </div>
        </PageSection>
      </div>

      <PageSection>
        {!user ? (
          <GuestState config={config} />
        ) : (
          <div className="grid gap-10 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {referralData ? (
                <AuthenticatedReferral config={config} data={referralData} />
              ) : (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Program terms sidebar */}
            <div className="space-y-5">
              <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <h3 className="mb-4 font-semibold text-foreground">Program Terms</h3>
                <div className="space-y-3 text-sm">
                  {[
                    { icon: TrendingUp, label: 'Your reward', value: `${config.referrer_reward_percent}% per order` },
                    { icon: Zap, label: 'Max per order', value: formatINR(config.referrer_max_reward_per_order) },
                    { icon: Users, label: 'Orders tracked', value: `First ${config.referrer_max_orders_per_referee}` },
                    { icon: Wallet, label: "Friend's benefit", value: `${discountLabel} first order` },
                    { icon: Clock, label: 'Min order value', value: formatINR(config.min_order_amount_for_reward) },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
                <h3 className="mb-3 font-semibold text-foreground">Important Notes</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    'Rewards are credited to your Laundrease wallet instantly after qualifying orders',
                    'Each person can only be referred once',
                    'Self-referrals are not allowed',
                    'Wallet credits can be used on any future order',
                    'Laundrease reserves the right to modify or end the program with notice',
                  ].map((note, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </PageSection>

      {/* How it works (always visible) */}
      {user && (
        <div className="border-t border-border/50 bg-muted/20">
          <PageSection>
            <ProgramSteps config={config} />
          </PageSection>
        </div>
      )}
    </FooterPageLayout>
  )
}
