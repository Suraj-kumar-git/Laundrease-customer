// components/layout/partner-legal-footer.tsx
//
// The legal footer for the laundry and delivery public pages.
//
// Those landing pages had no footer at all, so the partner terms, privacy
// policy and community guidelines had nowhere to be linked from. One component
// serves both apps rather than two near-identical copies — the only thing that
// differs is which role's documents it points at.
//
// Links are relative on purpose. Each role is deployed as its own project with
// its own domain, and the proxy 404s cross-role paths, so a partner footer must
// never link to /customer/*.

import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'

export function PartnerLegalFooter({ role }: { role: 'laundry' | 'delivery' }) {
  const year  = new Date().getFullYear()
  const label = role === 'laundry' ? 'Laundry Partners' : 'Delivery Partners'

  const links = [
    { href: `/${role}/terms-of-service`,      label: 'Terms of Service' },
    { href: `/${role}/privacy-policy`,        label: 'Privacy Policy' },
    { href: `/${role}/community-guidelines`,  label: 'Community Guidelines' },
  ]

  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <BrandLogo width={140} height={36} className="h-9 w-auto" />
            <p className="mt-3 text-sm text-muted-foreground">
              Laundrease for {label}. Grow with a platform that handles the
              orders, the payments, and the paperwork.
            </p>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Legal
              </p>
              <ul className="space-y-2">
                {links.map(l => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Support
              </p>
              <ul className="space-y-2">
                <li>
                  <a
                    href="mailto:support@laundrease.in"
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    support@laundrease.in
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:legal@laundrease.in"
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    legal@laundrease.in
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:grievance@laundrease.in"
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    grievance@laundrease.in
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border/60 pt-6">
          <p className="text-xs text-muted-foreground">
            © {year} Laundrease. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
