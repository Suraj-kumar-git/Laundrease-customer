import Link from 'next/link'
import { FileText, ChevronRight } from 'lucide-react'
import { FooterPageLayout, PageSection } from '@/components/layout/footer-page-layout'
import type { LegalDocument, LegalSection } from '@/types/footer-pages'

interface LegalPageProps {
  doc: LegalDocument
  breadcrumbLabel: string
  relatedLabel: string
  relatedHref: string
}

function SectionBlock({ section }: { section: LegalSection }) {
  return (
    <div id={section.heading.replace(/\s+/g, '-').toLowerCase()}>
      <h2 className="mb-3 text-xl font-semibold text-foreground">
        {section.heading}
      </h2>
      <p className="text-muted-foreground leading-relaxed">{section.body}</p>

      {section.subsections && section.subsections.length > 0 && (
        <div className="mt-4 space-y-4 pl-4 border-l-2 border-border/50">
          {section.subsections.map((sub, i) => (
            <div key={i}>
              <h3 className="mb-1.5 text-base font-semibold text-foreground">
                {sub.heading}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sub.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function LegalPageRenderer({
  doc,
  breadcrumbLabel,
  relatedLabel,
  relatedHref,
}: LegalPageProps) {
  const effectiveDate = new Date(doc.effective_date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const updatedDate = new Date(doc.updated_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <FooterPageLayout breadcrumbs={[{ label: breadcrumbLabel }]}>
      {/* Hero */}
      <div className="border-b border-border/50 bg-muted/20">
        <PageSection tight>
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {doc.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>Version {doc.version}</span>
                <span>Effective: {effectiveDate}</span>
                <span>Last updated: {updatedDate}</span>
              </div>
            </div>
          </div>
        </PageSection>
      </div>

      <PageSection>
        <div className="grid gap-12 lg:grid-cols-4">
          {/* Table of contents — desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 rounded-2xl border border-border/50 bg-card p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Contents
              </p>
              <nav className="space-y-1">
                {doc.content.map((section, i) => (
                  <a
                    key={i}
                    href={`#${section.heading.replace(/\s+/g, '-').toLowerCase()}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="line-clamp-2">{section.heading}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="lg:col-span-3">
            <div className="space-y-10 divide-y divide-border/50">
              {doc.content.map((section, i) => (
                <div key={i} className={i > 0 ? 'pt-10' : ''}>
                  <SectionBlock section={section} />
                </div>
              ))}
            </div>

            {/* Related doc */}
            <div className="mt-16 rounded-2xl border border-border/50 bg-muted/30 p-6">
              <p className="text-sm text-muted-foreground">
                You may also want to read our{' '}
                <Link
                  href={relatedHref}
                  className="font-semibold text-primary hover:underline"
                >
                  {relatedLabel}
                </Link>
                .
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                For questions, contact us at{' '}
                <a
                  href="mailto:legal@laundrease.in"
                  className="text-primary hover:underline"
                >
                  legal@laundrease.in
                </a>
              </p>
            </div>
          </div>
        </div>
      </PageSection>
    </FooterPageLayout>
  )
}
