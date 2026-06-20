'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FaqItem } from '@/types/footer-pages'

interface FaqAccordionProps {
  items: FaqItem[]
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i)

  return (
    <div className="divide-y divide-border/50 rounded-2xl border border-border/50 bg-card overflow-hidden">
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={() => toggle(i)}
            className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/30"
            aria-expanded={openIndex === i}
          >
            <span className="text-sm font-semibold text-foreground leading-snug pr-2">
              {item.q}
            </span>
            <ChevronDown
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                openIndex === i && 'rotate-180 text-primary'
              )}
            />
          </button>
          {openIndex === i && (
            <div className="border-t border-border/30 bg-muted/20 px-6 py-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
