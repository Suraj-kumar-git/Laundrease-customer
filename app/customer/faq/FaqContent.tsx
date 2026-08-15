'use client'
// app/customer/faq/FaqContent.tsx
//
// The interactive half of the FAQ page (search, category filter, accordion).
// Split out of page.tsx so that page can be a server component and fetch the
// live CMS content — this file renders whatever it is handed and knows nothing
// about where the questions came from.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, Sparkles, Package, Truck, Store, HeadphonesIcon,
  Clock, CreditCard, Shield, MapPin, Star, Phone, Mail, User,
} from 'lucide-react'
import type { FaqEntry } from './get-faqs'
import { FaqAnswer } from '@/components/faq/FaqAnswer'

type IconComponent = React.ComponentType<{ className?: string }>

const ICONS: Record<string, IconComponent> = {
  sparkles: Sparkles, 'map-pin': MapPin, user: User, package: Package,
  'credit-card': CreditCard, clock: Clock, shield: Shield, truck: Truck,
  store: Store, star: Star,
}

// Curated label + icon for the categories we ship with. Categories the admin
// adds later still get a filter pill (see below) — they just fall back to a
// title-cased label and the default icon rather than being dropped.
const CATEGORY_META: Record<string, { label: string; icon: IconComponent }> = {
  general:  { label: 'General',            icon: Sparkles },
  orders:   { label: 'Orders',             icon: Package },
  pricing:  { label: 'Pricing',            icon: CreditCard },
  delivery: { label: 'Delivery',           icon: Truck },
  partners: { label: 'Become a Partner',   icon: Store },
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function FaqContent({ items }: { items: FaqEntry[] }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Built from the data rather than hardcoded, so a category the admin creates
  // in the CMS becomes a filter automatically — and one they stop using stops
  // showing an empty tab.
  const categories = useMemo(() => {
    const present = Array.from(new Set(items.map((i) => i.category)))
    const known = Object.keys(CATEGORY_META).filter((k) => present.includes(k))
    const extra = present.filter((p) => !CATEGORY_META[p])
    return [
      { id: 'all', label: 'All Questions', icon: HeadphonesIcon as IconComponent },
      ...[...known, ...extra].map((id) => ({
        id,
        label: CATEGORY_META[id]?.label ?? titleCase(id),
        icon:  CATEGORY_META[id]?.icon  ?? Sparkles,
      })),
    ]
  }, [items])

  const filteredFAQs = items.filter((faq) => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      searchQuery === '' ||
      faq.question.toLowerCase().includes(q) ||
      faq.answer.toLowerCase().includes(q)
    return matchesCategory && matchesSearch
  })

  const toggleFAQ = (id: string) => setOpenId(openId === id ? null : id)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950">
      <div className="container mx-auto px-4 pt-6 pb-10 sm:pt-8">
        {/* Compact header — the old full-bleed blue hero (py-20, a 6xl
            heading and an 80px icon medallion) filled an entire viewport
            before a single question was visible. Title and subtitle are kept
            but sized down onto the page's own background so the search,
            filters and the first FAQs all land in the first screenful. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl md:text-3xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-1 max-w-xl text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Find answers to common questions about Laundrease services, pricing, and partnerships
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative z-20 mx-auto mt-4 max-w-2xl"
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search for questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border-2 border-blue-200 bg-white py-3 pl-4 pr-12 text-sm shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:py-3.5 sm:pl-5 sm:text-base"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="h-5 w-5 text-blue-500" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Category Filters — a horizontal scroll rail below sm. Six pills at
            the old px-6 py-3 wrapped to three stacked rows on a phone, which
            re-created the exact problem the hero had. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-4 mb-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:gap-2.5 sm:overflow-visible sm:pb-0"
        >
          {categories.map((category) => {
            const Icon = category.icon
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-300 sm:px-4 sm:text-sm ${
                  activeCategory === category.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{category.label}</span>
              </button>
            )
          })}
        </motion.div>

        {/* FAQ Items */}
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            {filteredFAQs.length > 0 ? (
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {filteredFAQs.map((faq, index) => {
                  // Unmapped icon keys (a category the admin invented) would
                  // otherwise render `undefined` as a component and crash.
                  const Icon = ICONS[faq.icon] ?? Sparkles
                  return (
                    <motion.div
                      key={faq.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index, 10) * 0.05 }}
                      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700"
                    >
                      <button
                        onClick={() => toggleFAQ(faq.id)}
                        className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors sm:px-5 sm:py-5"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                          <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-500 flex items-center justify-center text-white">
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                          </div>
                          <h3 className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white sm:text-base">
                            {faq.question}
                          </h3>
                        </div>
                        <motion.div
                          className="shrink-0"
                          animate={{ rotate: openId === faq.id ? 180 : 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        </motion.div>
                      </button>

                      <AnimatePresence>
                        {openId === faq.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            {/* Indent aligns with the question text on sm+; on a
                                phone that 80px gutter left the answer squeezed
                                into a narrow column, so it falls back to the
                                card's own padding. */}
                            <div className="px-4 pb-5 sm:px-5 sm:pb-6 sm:pl-[4.75rem]">
                              <FaqAnswer
                                text={faq.answer}
                                className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-base"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-6">
                  <HeadphonesIcon className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  No results found
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Try adjusting your search or filter
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Contact Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-12 max-w-4xl mx-auto"
        >
          <div className="bg-gradient-to-br from-blue-600 to-blue-600 rounded-3xl p-6 sm:p-8 md:p-12 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
            <div className="relative z-10">
              <h2 className="text-2xl font-bold mb-3 sm:text-3xl sm:mb-4">Still have questions?</h2>
              <p className="text-white/90 mb-6 text-sm sm:mb-8 sm:text-lg">
                Can&apos;t find the answer you&apos;re looking for? Our friendly support team is here to help!
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <motion.a
                  href="mailto:support@laundrease.in"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-4 bg-white/20 backdrop-blur-sm rounded-xl p-6 hover:bg-white/30 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Email Us</div>
                    <div className="text-sm text-white/80">support@laundrease.in</div>
                  </div>
                </motion.a>

                <motion.a
                  href="tel:+919876543210"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-4 bg-white/20 backdrop-blur-sm rounded-xl p-6 hover:bg-white/30 transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Call Us</div>
                    <div className="text-sm text-white/80">+91 98765 43210</div>
                  </div>
                </motion.a>
              </div>
            </div>

            {/* Decorative circles */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
