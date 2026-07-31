import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import Link from "next/link"
import { Bell, Menu, Search, ShoppingCart, MapPin } from "lucide-react"
import { query } from "@/lib/db"
import { safeJsonLd } from "@/lib/json-ld"
import { BrandLogo } from "@/components/brand-logo"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth-provider"
import { CartProvider } from "@/components/cart-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Toaster } from "@/components/ui/toaster"
import '@/styles/globals.css'
import { NewsletterForm } from "@/components/forms/newsletter-form"
import { UserMenuDropdown } from "@/components/header/user-menu-dropdown"
import { HeaderWithCart } from "@/components/header/HeaderWithCart"
import { MobileBottomNav } from "@/components/customer/MobileBottomNav"
import Script from "next/script"

const inter = Inter({ subsets: ["latin"] })

const TITLE = "Laundrease - Laundry Pickup & Delivery Made Effortless"
const DESCRIPTION = "Laundrease connects you with trusted local laundry providers in Pune for convenient online laundry, wash & fold, and dry cleaning pickup and delivery."

// Fallback for every /customer page that doesn't define its own metadata —
// most now do (see their individual page/layout files), so in practice this
// mainly governs the home page, which is a client component and can't
// export metadata itself.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'laundry pickup and delivery Pune', 'online laundry service', 'dry cleaning pickup and delivery',
    'wash and fold service near me', 'same day laundry Pune', 'Laundrease',
  ],
  alternates: { canonical: '/customer' },
  openGraph: {
    title: TITLE, description: DESCRIPTION, url: '/customer',
    siteName: 'Laundrease', type: 'website', locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

async function getFooterConfig() {
  try {
    const { rows } = await query(
      `SELECT key, value FROM platform_config
       WHERE key IN ('social_instagram', 'social_facebook', 'social_twitter', 'business_address', 'app_store_url', 'play_store_url', 'support_phone', 'support_email')`
    )
    const config: Record<string, string | null> = {}
    for (const row of rows) config[row.key] = row.value

    return {
      social: {
        instagram: config.social_instagram || 'https://instagram.com/laundrease.in',
        facebook:  config.social_facebook  || 'https://www.facebook.com/laundreasein',
        x:         config.social_twitter   || 'https://x.com/laundreasein',
      },
      address: config.business_address || null,
      // Admin-configured, no fallback — only show a badge once an admin
      // has actually set a real store listing URL.
      appStoreUrl:  config.app_store_url  || null,
      playStoreUrl: config.play_store_url || null,
      supportPhone: config.support_phone || null,
      supportEmail: config.support_email || null,
    }
  } catch (error) {
    console.error('[customer/layout] Failed to load footer config:', error)
    return {
      social: {
        instagram: 'https://instagram.com/laundrease.in',
        facebook:  'https://www.facebook.com/laundreasein',
        x:         'https://x.com/laundreasein',
      },
      address: null,
      appStoreUrl:  null,
      playStoreUrl: null,
      supportPhone: null,
      supportEmail: null,
    }
  }
}

// Branded store badges (App Store / Google Play look-alikes) — drawn as inline
// SVG rather than shipped as image assets, so they inherit the footer's
// light/dark border color and don't need a separate logo file.
const GooglePlayBadge = () => (
  <span className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-foreground transition-colors hover:bg-muted">
    <svg viewBox="0 0 100 100" className="h-6 w-6 shrink-0" aria-hidden="true">
      {/* Left body */}
      <path fill="#00C2FF" d="M14 8 14 92 56 50Z" />
      {/* Top-right facet */}
      <path fill="#3BDC7E" d="M14 8 67 38 56 50Z" />
      {/* Bottom-right facet */}
      <path fill="#FF5C5C" d="M14 92 67 62 56 50Z" />
      {/* Far-right tip */}
      <path fill="#FFE24A" d="M67 38 90 50 67 62 56 50Z" />
    </svg>
    <span className="text-left leading-tight">
      <span className="block text-[10px] text-muted-foreground">GET IT ON</span>
      <span className="block text-base font-semibold">Google Play</span>
    </span>
  </span>
)

const AppStoreBadge = () => (
  <span className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-foreground transition-colors hover:bg-muted">
    <svg viewBox="0 0 384 512" className="h-6 w-6 shrink-0 fill-current" aria-hidden="true">
      <path d="M318.7 268c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 140.4 4 184.8 4 275.5q0 40.5 14.8 83.2c13.2 36.7 60.8 126.8 110.4 125.2 26.2-.6 44.7-18.6 78.8-18.6 33.1 0 50.2 18.6 79.4 18.6 50.1-.7 93.3-82.4 105.9-119.2-67.5-31.8-74.6-93.4-74.6-96.7zM255.7 81.5C272.1 62 282.7 35 279.8 8c-24.6 1-54.1 16.4-71 35.9-15.2 17.3-28.4 44.8-24.9 71.2 26.1 2 52.8-13.3 71.8-33.6z" />
    </svg>
    <span className="text-left leading-tight">
      <span className="block text-[10px] text-muted-foreground">Download on the</span>
      <span className="block text-base font-semibold">App Store</span>
    </span>
  </span>
)

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // In the future, you can fetch logoUrl from an API here
  // const logoUrl = await fetchLogoFromApi()
  const { social, address, appStoreUrl, playStoreUrl, supportPhone, supportEmail } = await getFooterConfig()

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Laundrease',
    url: 'https://laundrease.in/customer',
    logo: 'https://laundrease.in/laundrease-logo.PNG',
    image: 'https://laundrease.in/laundrease-logo.PNG',
    description: DESCRIPTION,
    ...(address ? { address: { '@type': 'PostalAddress', addressLocality: 'Pune', addressRegion: 'Maharashtra', addressCountry: 'IN' } } : {}),
    ...(supportPhone ? { telephone: supportPhone } : {}),
    ...(supportEmail ? { email: supportEmail } : {}),
    sameAs: [social.instagram, social.facebook, social.x].filter(Boolean),
  }

  return (
    <div className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }}
        />
        {/* If using the below script then the loadScript is not required in checkoutStep.tsx file */}
        {/* <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
        <Script
          src="https://sdk.cashfree.com/js/ui/2.0.0/cashfree.prod.js"
          strategy="afterInteractive"
        /> */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <CartProvider>
            <div className="flex min-h-screen flex-col">
              {/* HeaderWithCart is a client component that manages the CartSheet state */}
            <HeaderWithCart />
              <main className="flex-1">{children}</main>
              <footer className="border-t bg-muted/30 py-8 dark:bg-muted/10">
                <div className="container mx-auto px-4">
                  <div className="mb-8 flex flex-col items-center justify-between gap-4 md:flex-row">
                    <Link href="/customer" className="flex items-center gap-2">
                      <BrandLogo width={180} height={60} className="h-auto w-auto max-h-10" priority />
                    </Link>
                    {/* Mobile: social icons row, then app badge row. Desktop: one row. */}
                    <div className="flex flex-col items-center gap-3 md:flex-row md:gap-4">
                      {/* Social icons */}
                      <div className="flex items-center gap-3">
                        <Link
                          href={social.x}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="X (formerly Twitter)"
                          className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                          </svg>
                        </Link>
                        <Link
                          href={social.facebook}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Facebook"
                          className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                          </svg>
                        </Link>
                        <Link
                          href={social.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Instagram"
                          className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                          </svg>
                        </Link>
                      </div>
                      {/* App store badges — their own row on mobile */}
                      {(appStoreUrl || playStoreUrl) && (
                        <div className="flex items-center gap-3">
                          {appStoreUrl && (
                            <Link href={appStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
                              <AppStoreBadge />
                            </Link>
                          )}
                          {playStoreUrl && (
                            <Link href={playStoreUrl} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">
                              <GooglePlayBadge />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`grid gap-8 md:grid-cols-2 ${address ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Company</h3>
                      <ul className="space-y-2">
                        <li>
                          <Link href="/customer/about" className="text-muted-foreground transition-colors hover:text-primary">
                            About Us
                          </Link>
                        </li>
                        <li>
                          <Link href="/customer/careers" className="text-muted-foreground transition-colors hover:text-primary">
                            Careers
                          </Link>
                        </li>
                        {/* <li>
                          <Link href="#" className="text-muted-foreground transition-colors hover:text-primary">
                            Press
                          </Link>
                        </li> */}
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Support</h3>
                      <ul className="space-y-2">
                        <li>
                          <Link href="/customer/help-center" className="text-muted-foreground transition-colors hover:text-primary">
                            Help Center
                          </Link>
                        </li>
                        <li>
                          <Link href="/customer/safety-center" className="text-muted-foreground transition-colors hover:text-primary">
                            Safety Center
                          </Link>
                        </li>
                        <li>
                          <Link href="/customer/community-guidelines" className="text-muted-foreground transition-colors hover:text-primary">
                            Community Guidelines
                          </Link>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Legal</h3>
                      <ul className="space-y-2">
                        <li>
                          <Link href="/customer/terms-of-service" className="text-muted-foreground transition-colors hover:text-primary">
                            Terms of Service
                          </Link>
                        </li>
                        <li>
                          <Link href="/customer/privacy-policy" className="text-muted-foreground transition-colors hover:text-primary">
                            Privacy Policy
                          </Link>
                        </li>
                        {/* <li>
                          <Link href="#" className="text-muted-foreground transition-colors hover:text-primary">
                            Cookie Policy
                          </Link>
                        </li> */}
                      </ul>
                    </div>
                    <div>
                      <h3 className="mb-4 text-lg font-bold">Newsletter</h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Subscribe to our newsletter for the latest updates and offers.
                      </p>
                      <NewsletterForm />
                    </div>
                    {address && (
                      <div>
                        <h3 className="mb-4 text-lg font-bold">Address</h3>
                        <p className="flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <span>{address}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-12 border-t border-border pt-8 text-center text-sm text-muted-foreground">
                    <p>© 2026 Laundrease. All rights reserved.</p>
                  </div>
                </div>
              </footer>
              <MobileBottomNav />
            </div>
            <Toaster />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
    </div>
  )
}
