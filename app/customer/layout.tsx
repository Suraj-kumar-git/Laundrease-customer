import type React from "react"
import { Inter } from "next/font/google"
import Link from "next/link"
import Image from "next/image"
import { Bell, Menu, Search, ShoppingCart, MapPin } from "lucide-react"
import { query } from "@/lib/db"

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
import Script from "next/script"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Laundrease - Laundry Made Effortless Online",
  description: "Laundrease is an online platform that connects users with local laundry services for convenient pickup and delivery.",
}

// Logo component that can accept dynamic logo URL from API
const Logo = ({ logoUrl, className = "" }: { logoUrl?: string; className?: string }) => {
  // Default to local logo, but can be replaced with API URL
  const finalLogoUrl = logoUrl || "/laundrease-logo.PNG" // or "/images/logo.png" depending on your structure
  
  return (
    <Image
      src={finalLogoUrl}
      alt="Laundrease Logo"
      width={180}
      height={60}
      className={`h-auto w-auto max-h-10 ${className}`}
      priority
    />
  )
}

async function getFooterConfig() {
  try {
    const { rows } = await query(
      `SELECT key, value FROM platform_config
       WHERE key IN ('social_instagram', 'social_facebook', 'social_twitter', 'business_address')`
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
    }
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // In the future, you can fetch logoUrl from an API here
  // const logoUrl = await fetchLogoFromApi()
  const { social, address } = await getFooterConfig()

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
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
                      <Logo />
                    </Link>
                    <div className="flex gap-4">
                      <Link
                        href={social.x}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="X (formerly Twitter)"
                        className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                        </svg>
                      </Link>
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
            </div>
            <Toaster />
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
