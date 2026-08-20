'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface FooterPageLayoutProps {
  children: React.ReactNode
  breadcrumbs?: BreadcrumbItem[]
  className?: string
  /**
   * Where the "Home" breadcrumb points.
   *
   * Pass it on the laundry and delivery apps. The default probes
   * /api/customer/auth/me, which does not exist on those deployments — the
   * proxy 404s cross-role API paths — and /customer is not a page a partner
   * can reach from their own domain anyway.
   */
  homeHref?: string
}

// Resolves the correct "Home" href: /customer/dashboard for logged-in users,
// /customer for guests. Checked once on mount via a lightweight API call.
function useHomeHref(skip = false) {
  const [href, setHref] = useState('/customer')
  useEffect(() => {
    if (skip) return
    fetch('/api/customer/auth/me', { credentials: 'include' })
      .then(r => { if (r.ok) setHref('/customer/dashboard') })
      .catch(() => {})
  }, [skip])
  return href
}

/**
 * Shared wrapper for all footer-linked public pages.
 * Provides consistent top padding, breadcrumb nav, and max-width container.
 * Each page handles its own hero and content sections.
 */
export function FooterPageLayout({
  children,
  breadcrumbs,
  className,
  homeHref: homeHrefProp,
}: FooterPageLayoutProps) {
  const detected = useHomeHref(homeHrefProp != null)
  const homeHref = homeHrefProp ?? detected

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      {/* Breadcrumb */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-b border-border/50 bg-muted/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5 py-3 text-sm text-muted-foreground">
              <Link
                href={homeHref}
                className="transition-colors hover:text-foreground"
              >
                Home
              </Link>
              {breadcrumbs.map((crumb, i) => (
                <React.Fragment key={i}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  {crumb.href && i < breadcrumbs.length - 1 ? (
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Page content */}
      {children}
    </div>
  )
}

/**
 * Standard section container used throughout footer pages.
 */
export function PageSection({
  children,
  className,
  tight = false,
}: {
  children: React.ReactNode
  className?: string
  tight?: boolean
}) {
  return (
    <section
      className={cn(
        'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8',
        tight ? 'py-12 md:py-16' : 'py-16 md:py-24',
        className
      )}
    >
      {children}
    </section>
  )
}

/**
 * Consistent section heading style used across all footer pages.
 */
export function SectionHeading({
  badge,
  title,
  subtitle,
  centered = false,
  className,
}: {
  badge?: string
  title: string
  subtitle?: string | null
  centered?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-10 md:mb-14',
        centered && 'text-center',
        className
      )}
    >
      {badge && (
        <span className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          {badge}
        </span>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className={cn('mt-4 max-w-2xl text-lg text-muted-foreground leading-relaxed', centered && 'mx-auto')}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * The hero band shared by every public footer page (About, Careers, Help
 * Center, Safety Center, Community Guidelines).
 *
 * These heroes were previously copy-pasted per page at `py-24 md:py-32` with a
 * `text-6xl` heading. That combination filled an entire laptop viewport on its
 * own: a visitor landing on Help Center saw a title and nothing else, and had
 * to scroll past a screen of empty gradient before reaching a single answer.
 * On a phone it was worse, because the same padding sits above a heading that
 * now wraps to four or five lines.
 *
 * The proportions here are the ones the Careers page had already been cut down
 * to, promoted into one component so the five pages cannot drift apart again.
 * Roughly half the vertical padding, a heading that tops out at text-4xl, and
 * a subtitle held to max-w-2xl so it wraps on a comfortable measure instead of
 * running the full column width.
 *
 * `children` is the slot for whatever a given page hangs below the subtitle —
 * a CTA row, trust chips, a "last updated" line. It gets a single consistent
 * top margin so those extras line up across pages too.
 */
export function PublicPageHero({
  badge,
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  badge?: string | null
  /** Small glyph shown inside the badge pill. */
  icon?: React.ReactNode
  title: string
  subtitle?: string | null
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(
      'relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10',
      className
    )}>
      {/* Decorative wash. Sized off the band itself rather than fixed pixel
          blobs, so it scales down with the shorter hero instead of bleeding
          past it. */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-[380px] w-[380px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-[280px] w-[280px] rounded-full bg-primary/[0.07] blur-3xl" />

      <PageSection className="relative py-12 md:py-16">
        <div className="max-w-3xl">
          {badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
              {icon}
              {badge}
            </span>
          )}
          <h1 className={cn(
            'text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl md:text-4xl',
            badge && 'mt-3'
          )}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {subtitle}
            </p>
          )}
          {children && <div className="mt-5">{children}</div>}
        </div>
      </PageSection>
    </div>
  )
}
