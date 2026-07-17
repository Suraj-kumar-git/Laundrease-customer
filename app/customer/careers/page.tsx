import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin, Clock, Briefcase, ArrowRight, Sparkles, Star } from 'lucide-react'
import { FooterPageLayout, PageSection, SectionHeading } from '@/components/layout/footer-page-layout'
import type { CareerJob, EmploymentType } from '@/types/footer-pages'
import { EMPLOYMENT_TYPE_LABELS } from '@/types/footer-pages'

export const metadata: Metadata = {
  title: 'Careers | Laundrease',
  description: 'Join the Laundrease team. We are building the future of on-demand laundry in India.',
  keywords: ['jobs at Laundrease', 'Laundrease careers', 'laundry startup jobs Pune'],
  alternates: { canonical: '/customer/careers' },
  openGraph: {
    title: 'Careers | Laundrease', type: 'website', url: '/customer/careers',
    description: 'Join the Laundrease team. We are building the future of on-demand laundry in India.',
  },
  twitter: { card: 'summary_large_image', title: 'Careers | Laundrease' },
}

export const revalidate = 3600 // 1 hour

// ---- Data fetch --------------------------------------------
async function getJobs(): Promise<CareerJob[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/customer/public/careers`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const json = await res.json()
    if (!json.success) throw new Error('API error')
    return json.data as CareerJob[]
  } catch {
    return []
  }
}

// ---- Employment type badge colors --------------------------
const TYPE_STYLES: Record<EmploymentType, string> = {
  full_time: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  part_time: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  contract: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  internship: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
}

// ---- Job Card ----------------------------------------------
function JobCard({ job }: { job: CareerJob }) {
  return (
    <Link
      href={`/customer/careers/${job.id}`}
      className="group relative flex flex-col rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
    >
      {job.is_featured && (
        <div className="absolute -top-px left-6 flex items-center gap-1 rounded-b-lg bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
          <Star className="h-3 w-3 fill-current" />
          Featured
        </div>
      )}

      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground transition-colors group-hover:text-primary line-clamp-2">
            {job.title}
          </h3>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {job.department}
          </p>
        </div>
        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-1 group-hover:text-primary" />
      </div>

      {job.about_role && (
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-2">
          {job.about_role}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_STYLES[job.employment_type]}`}>
          {EMPLOYMENT_TYPE_LABELS[job.employment_type]}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {job.location}
        </span>
        {job.experience_range && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            {job.experience_range}
          </span>
        )}
      </div>
    </Link>
  )
}

// ---- Page --------------------------------------------------
export default async function CareersPage() {
  const jobs = await getJobs()

  // Group by department
  const departments = Array.from(new Set(jobs.map((j) => j.department)))

  const featuredJobs = jobs.filter((j) => j.is_featured)
  const otherJobs = jobs.filter((j) => !j.is_featured)

  return (
    <FooterPageLayout breadcrumbs={[{ label: 'Careers' }]}>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-primary/8 blur-3xl" />
        <PageSection className="relative py-24 md:py-32">
          <div className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="h-3 w-3" />
              We are Hiring
            </span>
            <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Help Us Reinvent Laundry in India
            </h1>
            <p className="mt-6 text-xl text-muted-foreground leading-relaxed">
              We are a small team building fast. If you love solving real problems, shipping quickly, and obsessing over details, you will fit right in.
            </p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                Remote-friendly roles available
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                Competitive salaries + equity
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                {jobs.length} open position{jobs.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </PageSection>
      </div>

      {/* No jobs state */}
      {jobs.length === 0 && (
        <PageSection>
          <div className="mx-auto max-w-lg rounded-2xl border border-border/50 bg-muted/30 p-12 text-center">
            <div className="mb-4 text-5xl">📋</div>
            <h2 className="text-xl font-semibold text-foreground">
              No open positions right now
            </h2>
            <p className="mt-3 text-muted-foreground">
              We do not have any open positions at the moment, but we are growing quickly. Check back soon or send your resume to{' '}
              <a
                href="mailto:careers@laundrease.in"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                careers@laundrease.in
              </a>
            </p>
          </div>
        </PageSection>
      )}

      {/* Featured jobs */}
      {featuredJobs.length > 0 && (
        <PageSection>
          <SectionHeading
            badge="Featured"
            title="Roles We Are Excited About"
            subtitle="These are the positions we are most actively hiring for right now."
          />
          <div className="grid gap-6 md:grid-cols-2">
            {featuredJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </PageSection>
      )}

      {/* All other jobs grouped by department */}
      {otherJobs.length > 0 && (
        <div className="bg-muted/20">
          <PageSection>
            <SectionHeading
              title="All Open Positions"
              subtitle={`${jobs.length} open position${jobs.length !== 1 ? 's' : ''} across ${departments.length} department${departments.length !== 1 ? 's' : ''}`}
            />
            <div className="space-y-12">
              {departments
                .filter((dept) => otherJobs.some((j) => j.department === dept))
                .map((dept) => (
                  <div key={dept}>
                    <h3 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      {dept}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs normal-case tracking-normal">
                        {otherJobs.filter((j) => j.department === dept).length}
                      </span>
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {otherJobs
                        .filter((j) => j.department === dept)
                        .map((job) => (
                          <JobCard key={job.id} job={job} />
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </PageSection>
        </div>
      )}

      {/* Culture section */}
      <PageSection>
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            title="Why Laundrease?"
            subtitle="We are not just another startup. Here is what makes us different."
            centered
          />
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {[
              { emoji: '🚀', title: 'Ship Real Things', body: 'No endless planning. We build, test with real users, and iterate fast.' },
              { emoji: '🧠', title: 'Own Your Work', body: 'Every team member owns a meaningful slice of the product. No hand-holding.' },
              { emoji: '💜', title: 'Care for Each Other', body: 'Small team, high trust. We celebrate wins and support each other through challenges.' },
              { emoji: '📈', title: 'Grow With Us', body: 'Early-stage means fast-growing. The opportunities you create here will follow you.' },
              { emoji: '🏠', title: 'Flexible Work', body: 'Async-friendly culture. Most roles offer hybrid or fully remote options.' },
              { emoji: '🧺', title: 'Free Laundrease', body: 'Yes, we give all employees monthly Laundrease credits. Perks of the job.' },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-border/50 bg-card p-6 text-center">
                <div className="mb-3 text-3xl">{item.emoji}</div>
                <h4 className="font-semibold text-foreground">{item.title}</h4>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      {/* General application CTA */}
      <div className="border-t border-border/50 bg-muted/30">
        <PageSection tight>
          <div className="flex flex-col items-center gap-4 text-center md:flex-row md:justify-between md:text-left">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Do not see a role that fits?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Send your resume and a short note about what you would like to build.
              </p>
            </div>
            <a
              href="mailto:careers@laundrease.in"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
            >
              careers@laundrease.in
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </PageSection>
      </div>
    </FooterPageLayout>
  )
}
