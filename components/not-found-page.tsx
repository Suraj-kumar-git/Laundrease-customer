'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { WashingMachine, Home, ArrowLeft, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const router = useRouter()

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-16">
      {/* Soft decorative glows, consistent with the rest of the app's gradient accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 flex w-full max-w-lg flex-col items-center text-center"
      >
        <motion.div
          animate={{ rotate: [0, 8, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm"
        >
          <WashingMachine className="h-10 w-10 text-primary" />
        </motion.div>

        <p className="text-7xl font-bold tracking-tight text-primary sm:text-8xl">404</p>

        <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
          This page got lost in the wash
        </h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          We couldn&apos;t find the page you&apos;re looking for. It may have been moved,
          renamed, or never existed.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/customer">
              <Home className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>

        <Link
          href="/customer/help-center"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <Search className="h-3.5 w-3.5" />
          Need help? Visit our Help Center
        </Link>
      </motion.div>
    </div>
  )
}
