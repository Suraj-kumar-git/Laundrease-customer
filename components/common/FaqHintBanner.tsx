// components/common/FaqHintBanner.tsx
// Sits at the top of every persona's "raise a ticket" form. A large share of
// tickets reaching the support queue are common questions already answered in
// that persona's FAQ, so this offers the answer while the ticket is still
// unwritten rather than after an agent has had to reply.
//
// Opens in a new tab on purpose: the visitor is mid-form, and navigating away
// (especially to a marketing-page anchor, which is a full route change out of
// the dashboard) would discard whatever they'd already typed.

import { HelpCircle, ArrowUpRight } from 'lucide-react'

export function FaqHintBanner({
  href, label = 'Browse FAQs',
}: {
  /** Persona's FAQ destination — a page (/customer/faq) or a marketing-page
   *  section anchor (/laundry#faq) for personas with no FAQ page of their own. */
  href: string
  label?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/10 sm:p-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HelpCircle className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Have a quick question?</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Most common queries are already answered in our FAQs — you might find your answer straight away.
        </p>
      </div>

      {/* Label collapses to just the arrow on narrow screens so the banner
          never pushes the description text into a cramped column. */}
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary">
        <span className="hidden sm:inline">{label}</span>
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </a>
  )
}
