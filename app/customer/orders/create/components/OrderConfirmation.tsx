'use client'
// components/order-confirmation/OrderConfirmation.tsx
// Changes from original:
//  - Removed the 3-button row (Track / Download / Share tabs)
//  - Track Order button stays as a primary CTA below the steps card
//  - Download Invoice button is now inside the order number gradient card
//  - Invoice download: calls /api/customer/orders/:id/invoice → receives pre-signed S3
//    URL → opens in new tab (browser triggers PDF download)
//  - Share Order code is kept but commented out (unchanged from original)

import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'
import { motion }              from 'framer-motion'
import Confetti                from 'react-confetti'
import {
  CheckCircle, Package, Download, Home,
  Clock, Phone, Mail, Loader2, AlertCircle,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button }            from '@/components/ui/button'
import { Badge }             from '@/components/ui/badge'
import { Separator }         from '@/components/ui/separator'

interface OrderConfirmationProps {
  orderNumber: string
  orderId?:    string
}

export function OrderConfirmation({ orderNumber, orderId }: OrderConfirmationProps) {
  const router = useRouter()

  const [showConfetti, setShowConfetti] = useState(true)
  const [windowSize,   setWindowSize]   = useState({ width: 0, height: 0 })

  // Invoice download state
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceError,   setInvoiceError]   = useState<string | null>(null)

  useEffect(() => {
    setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    const timer = setTimeout(() => setShowConfetti(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  const handleTrackOrder = () => {
    router.push(orderId ? `/customer/orders/${orderId}` : '/customer/orders')
  }

  // Download Invoice — calls API, API generates PDF + uploads to S3,
  // returns a 15-min pre-signed URL, we open it in a new tab.
  const handleDownloadInvoice = async () => {
    if (!orderId) return
    setInvoiceLoading(true)
    setInvoiceError(null)
    try {
      const res  = await fetch(`/api/customer/orders/${orderId}/invoice`, { credentials: 'include' })
      const json = await res.json()
      if (!json.success || !json.data?.url) {
        setInvoiceError('Could not generate invoice. Please try again.')
        return
      }
      // Open pre-signed S3 URL — browser will download the PDF
      window.open(json.data.url, '_blank')
    } catch {
      setInvoiceError('Network error. Please try again.')
    } finally {
      setInvoiceLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative">
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}

      <div className="container mx-auto px-4 py-12 max-w-5xl">

        {/* ---- Success Animation ---- */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              <CheckCircle className="w-16 h-16 text-green-600" />
            </motion.div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2"
          >
            Order Placed Successfully! 🎉
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-muted-foreground"
          >
            We&apos;ve notified the laundry partner — your order will be confirmed once they accept it
          </motion.p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ---- Sidebar: Order Number, Track CTA, Support ---- */}
        <div className="lg:order-2 space-y-5">

        {/* ---- Order Number Card — with Download Invoice button ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-gradient-to-r from-violet-600 to-purple-600 text-white overflow-hidden">
            <CardContent className="p-6">
              <div className="text-center mb-5">
                <p className="text-sm text-white/80 mb-2">Your Order Number</p>
                <p className="text-3xl font-bold font-mono tracking-wider mb-1">
                  #{orderNumber}
                </p>
                <p className="text-sm text-white/80">
                  We&apos;ve sent a confirmation email with order details
                </p>
              </div>

              {/* Download Invoice button — sits inside the card */}
              {orderId && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleDownloadInvoice}
                    disabled={invoiceLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all"
                  >
                    {invoiceLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />}
                    {invoiceLoading ? 'Generating Invoice…' : 'Download Invoice (PDF)'}
                  </button>

                  {invoiceError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {invoiceError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ---- Track Order CTA ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Button
            onClick={handleTrackOrder}
            className="w-full bg-violet-600 hover:bg-violet-700 h-12 text-base font-semibold"
          >
            <Package className="w-5 h-5 mr-2" />
            View Order Details
          </Button>
        </motion.div>

        {/* ---- Contact Support ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card className="bg-muted/30">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3">Need Help?</h3>
              <div className="grid gap-3">
                <a href="tel:+919876543210"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <Phone className="w-5 h-5 text-violet-600" />
                  <div>
                    <p className="text-sm font-medium">Call Us</p>
                    <p className="text-xs text-muted-foreground">+91 98765 43210</p>
                  </div>
                </a>
                <a href="mailto:support@laundrease.in"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors">
                  <Mail className="w-5 h-5 text-violet-600" />
                  <div>
                    <p className="text-sm font-medium">Email Us</p>
                    <p className="text-xs text-muted-foreground">support@laundrease.in</p>
                  </div>
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        </div>
        {/* ---- end sidebar ---- */}

        {/* ---- What Happens Next ---- */}
        <motion.div
          className="lg:order-1 lg:col-span-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Clock className="w-6 h-6 text-violet-600" />
                What Happens Next?
              </h2>

              {/* Static step list — this page only ever appears right after
                  placing an order, when status is always 'pending'. Live
                  status tracking happens on the order details page. */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">1</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Order Placed</h3>
                    <p className="text-sm text-muted-foreground">You&apos;ll receive a confirmation email and SMS with order details</p>
                    <Badge className="mt-2 bg-green-100 text-green-700 dark:bg-green-900/30">
                      <CheckCircle className="w-3 h-3 mr-1" /> Complete
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">2</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Order Confirmation</h3>
                    <p className="text-sm text-muted-foreground">Your order will be confirmed once the laundry partner accepts it</p>
                    <Badge className="mt-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30">Awaiting Confirmation</Badge>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">3</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Pickup</h3>
                    <p className="text-sm text-muted-foreground">Our delivery partner will arrive at your scheduled time to collect your laundry</p>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">4</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Professional Cleaning</h3>
                    <p className="text-sm text-muted-foreground">Your clothes will be professionally cleaned, dried, and ironed with care</p>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">5</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Ready</h3>
                    <p className="text-sm text-muted-foreground">Your order is cleaned and packed, ready to head back to you</p>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">6</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Out for Delivery</h3>
                    <p className="text-sm text-muted-foreground">Your delivery partner is on the way with your order</p>
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-bold">7</div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Delivered</h3>
                    <p className="text-sm text-muted-foreground">Clean, fresh, and neatly folded clothes delivered back to your doorstep</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        </div>
        {/* ---- end grid ---- */}

        {/* ---- Back to Dashboard ---- */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-5 text-center"
        >
          <Button variant="outline" size="lg" onClick={() => router.push('/customer/dashboard')} className="w-full md:w-auto">
            <Home className="w-5 h-5 mr-2" />
            Go to Home
          </Button>
        </motion.div>
      </div>
    </div>
  )
}