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
}

// Resolves the correct "Home" href: /customer/dashboard for logged-in users,
// /customer for guests. Checked once on mount via a lightweight API call.
function useHomeHref() {
  const [href, setHref] = useState('/customer')
  useEffect(() => {
    fetch('/api/customer/auth/me', { credentials: 'include' })
      .then(r => { if (r.ok) setHref('/customer/dashboard') })
      .catch(() => {})
  }, [])
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
}: FooterPageLayoutProps) {
  const homeHref = useHomeHref()

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
