'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Briefcase, Clock, ArrowLeft,
  Download, Mail, CheckCircle2, ChevronDown,
  ChevronUp, Loader2, Copy, Check,
} from 'lucide-react'
import { FooterPageLayout, PageSection } from '@/components/layout/footer-page-layout'
import type { CareerJob, EmploymentType } from '@/types/footer-pages'
import { EMPLOYMENT_TYPE_LABELS } from '@/types/footer-pages'

const TYPE_STYLES: Record<EmploymentType, string> = {
  full_time: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  part_time: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  contract: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  internship: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400',
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-foreground">{title}</h2>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="text-muted-foreground leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmailTemplate({ job }: { job: CareerJob }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null)

  const copy = async (text: string, field: 'subject' | 'body') => {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h3 className="font-semibold text-foreground">How to Apply</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Email {job.hr_name} directly with your resume
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="mt-6 space-y-4 border-t border-primary/10 pt-6">
          {/* HR contact */}
          <div className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
            <Mail className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Send your application to</p>
              <a
                href={`mailto:${job.hr_email}`}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {job.hr_email}
              </a>
            </div>
          </div>

          {/* Subject line */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Email Subject
              </p>
              <button
                onClick={() => copy(job.email_subject_format, 'subject')}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied === 'subject' ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy</>
                )}
              </button>
            </div>
            <div className="rounded-lg bg-background/60 px-4 py-2.5 text-sm font-mono text-foreground">
              {job.email_subject_format}
            </div>
          </div>

          {/* Body template */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Email Body Template
              </p>
              <button
                onClick={() => copy(job.email_body_format, 'body')}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied === 'body' ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy</>
                )}
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-background/60 px-4 py-3 text-sm text-foreground/80 font-mono leading-relaxed">
              {job.email_body_format}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Replace the text in {'{curly braces}'} with your own details.
            </p>
          </div>

          {/* Open in mail client */}
          <a
            href={`mailto:${job.hr_email}?subject=${encodeURIComponent(job.email_subject_format)}`}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <Mail className="h-4 w-4" />
            Open in Mail App
          </a>
        </div>
      )}
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [job, setJob] = useState<CareerJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/customer/public/careers/${id}`)
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) throw new Error('Failed')
        const json = await res.json()
        if (!json.success) throw new Error('API error')
        setJob(json.data)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchJob()
  }, [id])

  const handleDownloadJd = async () => {
    if (!job) return
    setDownloadState('loading')
    try {
      const res = await fetch(`/api/customer/public/careers/${id}/jd`)
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      if (!json.success || !json.data?.url) throw new Error('No URL')
      // Open in new tab — browser will trigger download due to Content-Disposition header
      window.open(json.data.url, '_blank', 'noopener,noreferrer')
      setDownloadState('idle')
    } catch {
      setDownloadState('error')
      setTimeout(() => setDownloadState('idle'), 3000)
    }
  }

  if (loading) {
    return (
      <FooterPageLayout>
        <PageSection>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageSection>
      </FooterPageLayout>
    )
  }

  if (notFound || !job) {
    return (
      <FooterPageLayout>
        <PageSection>
          <div className="mx-auto max-w-md rounded-2xl border border-border/50 bg-muted/30 p-12 text-center">
            <div className="mb-4 text-5xl">🔍</div>
            <h2 className="text-xl font-semibold text-foreground">Position not found</h2>
            <p className="mt-2 text-muted-foreground">
              This role may have been filled or is no longer available.
            </p>
            <Link
              href="/customer/careers"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              View all openings
            </Link>
          </div>
        </PageSection>
      </FooterPageLayout>
    )
  }

  return (
    <FooterPageLayout
      breadcrumbs={[
        { label: 'Careers', href: '/careers' },
        { label: job.title },
      ]}
    >
      <PageSection className="py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-3">
          {/* Main content */}
          <div className="space-y-10 lg:col-span-2">
            {/* Title block */}
            <div>
              <Link
                href="/customer/careers"
                className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                All openings
              </Link>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {job.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${TYPE_STYLES[job.employment_type]}`}>
                  {EMPLOYMENT_TYPE_LABELS[job.employment_type]}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                </span>
                {job.experience_range && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    {job.experience_range}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {job.department}
                </span>
              </div>
            </div>

            {/* About role */}
            {job.about_role && (
              <div>
                <h2 className="mb-3 text-xl font-semibold text-foreground">About the Role</h2>
                <p className="text-muted-foreground leading-relaxed">{job.about_role}</p>
              </div>
            )}

            <ListSection title="What You Will Do" items={job.responsibilities} />
            <ListSection title="What We Are Looking For" items={job.requirements} />
            <ListSection title="Nice to Have" items={job.nice_to_have} />
            <ListSection title="Benefits" items={job.benefits} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
            {/* JD Download */}
            {(job as any).has_jd && (
              <button
                onClick={handleDownloadJd}
                disabled={downloadState === 'loading'}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg disabled:opacity-60"
              >
                {downloadState === 'loading' ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating link...</>
                ) : downloadState === 'error' ? (
                  'Could not load JD — try again'
                ) : (
                  <><Download className="h-4 w-4" /> Download Job Description</>
                )}
              </button>
            )}

            {/* Email template */}
            <EmailTemplate job={job} />

            {/* Quick facts */}
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Quick Details</h3>
              <dl className="space-y-3 text-sm">
                {[
                  { label: 'Department', value: job.department },
                  { label: 'Location', value: job.location },
                  { label: 'Type', value: EMPLOYMENT_TYPE_LABELS[job.employment_type] },
                  ...(job.experience_range ? [{ label: 'Experience', value: job.experience_range }] : []),
                  { label: 'Posted', value: new Date(job.posted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium text-foreground text-right">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </PageSection>
    </FooterPageLayout>
  )
}
