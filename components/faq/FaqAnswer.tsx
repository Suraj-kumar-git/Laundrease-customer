'use client'
// components/faq/FaqAnswer.tsx
//
// Renders a CMS-authored FAQ answer, turning [label](href) into real links.
//
// WHY NOT HTML
// The obvious fix is to let admins write <a> tags and render the answer with
// dangerouslySetInnerHTML. These answers appear on public, unauthenticated
// pages, so that turns the CMS into a stored-XSS surface: anyone who can edit
// an FAQ — or anyone who gets write access to the faqs table — can ship a
// <script> to every visitor. Sanitising it properly means pulling in a
// sanitiser and maintaining an allowlist forever.
//
// This parser is the opposite trade. Nothing in the answer is ever treated as
// markup; the only thing that can become an anchor is text this file matched
// itself, with an href this file validated. A malicious answer renders as
// harmless visible text.
//
// AUTHORING
// In the CMS, write links as:  [Become a Partner](/laundry/auth/register)
// Relative paths get client-side navigation; external URLs open in a new tab.

import Link from 'next/link'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'

/** [label](href) — href may not contain whitespace or a closing paren. */
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)/g

/**
 * Returns the href only if it's a shape we're willing to turn into a link.
 *
 * Blocks javascript: and data: (script execution), and protocol-relative
 * "//evil.com" — which passes a naive startsWith('/') check but is an
 * off-site URL, not an internal path.
 */
function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (href.startsWith('//')) return null
  if (href.startsWith('/'))  return href
  if (/^https?:\/\//i.test(href)) return href
  if (/^mailto:/i.test(href))     return href
  return null
}

const LINK_CLASS =
  'font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'

export function FaqAnswer({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let key = 0

  // lastIndex advances across matches; reset first because the regex is
  // module-level and /g regexes carry state between calls.
  LINK_PATTERN.lastIndex = 0

  for (const match of text.matchAll(LINK_PATTERN)) {
    const [full, label, rawHref] = match
    const start = match.index ?? 0

    if (start > cursor) nodes.push(<Fragment key={key++}>{text.slice(cursor, start)}</Fragment>)

    const href = safeHref(rawHref)
    if (!href) {
      // Unsupported scheme — show the original text rather than silently
      // dropping it, so a bad link is visible to whoever wrote it.
      nodes.push(<Fragment key={key++}>{full}</Fragment>)
    } else if (href.startsWith('/')) {
      nodes.push(<Link key={key++} href={href} className={LINK_CLASS}>{label}</Link>)
    } else {
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {label}
        </a>
      )
    }

    cursor = start + full.length
  }

  if (cursor < text.length) nodes.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>)

  // whitespace-pre-line keeps the paragraph breaks admins type in the CMS
  // textarea, which is how these answers have always rendered.
  return <p className={cn('whitespace-pre-line', className)}>{nodes}</p>
}
