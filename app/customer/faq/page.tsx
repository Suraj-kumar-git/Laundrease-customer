'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Sparkles,
  Package,
  Truck,
  Store,
  HeadphonesIcon,
  Clock,
  CreditCard,
  Shield,
  MapPin,
  Star,
  Phone,
  Mail,
  User,
} from 'lucide-react'

interface FAQItem {
  id: string
  question: string
  answer: string
  category: 'general' | 'orders' | 'pricing' | 'delivery' | 'partners'
  icon: React.ReactNode
}

const faqData: FAQItem[] = [
  // General Questions
  {
    id: '1',
    question: 'What is Laundrease?',
    answer:
      'Laundrease is an on-demand laundry service platform that connects customers with professional laundry providers. We offer convenient pickup and delivery services, ensuring your clothes are cleaned, pressed, and delivered back to you with care.',
    category: 'general',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    id: '2',
    question: 'What areas do you serve?',
    answer:
      'We currently serve Pune (Pimpri-Chinchwad, Wakad, Hinjewadi, Baner, and surrounding areas). Enter your pincode on our homepage to check if we deliver to your location. We are rapidly expanding to new areas!',
    category: 'general',
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    id: '3',
    question: 'How do I create an account?',
    answer:
      'Click on "Sign Up" at the top right corner, enter your email, phone number, and create a password. You will receive an OTP for verification. Once verified, you can start placing orders immediately!',
    category: 'general',
    icon: <User className="w-5 h-5" />,
  },

  // Orders
  {
    id: '4',
    question: 'How do I place an order?',
    answer:
      'Simply log in, select the services you need (wash & fold, dry cleaning, ironing, etc.), choose a pickup time, add your address, and place your order. Our delivery partner will pick up your laundry at the scheduled time.',
    category: 'orders',
    icon: <Package className="w-5 h-5" />,
  },
  {
    id: '5',
    question: 'What is the minimum order value?',
    answer:
      'The minimum order value is ₹100. However, this may vary depending on the laundry provider you choose. Some providers offer free delivery for orders above ₹500.',
    category: 'orders',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    id: '6',
    question: 'Can I schedule a pickup for later?',
    answer:
      'Yes! You can schedule your pickup for any date and time slot that works for you. We offer flexible time slots from 9 AM to 9 PM. Express service is also available for same-day delivery.',
    category: 'orders',
    icon: <Clock className="w-5 h-5" />,
  },
  {
    id: '7',
    question: 'Can I track my order?',
    answer:
      'Absolutely! Once your order is placed, you can track it in real-time from the "My Orders" section. You will receive notifications at every stage: pickup, washing, quality check, and delivery.',
    category: 'orders',
    icon: <Package className="w-5 h-5" />,
  },

  // Pricing
  {
    id: '8',
    question: 'How is pricing calculated?',
    answer:
      'Pricing depends on the type of service (wash & fold, dry cleaning, ironing), the weight or quantity of items, and the laundry provider you choose. You can see the exact breakdown before placing your order. We charge ₹40-80 per kg for wash & fold and ₹150+ for dry cleaning.',
    category: 'pricing',
    icon: <CreditCard className="w-5 h-5" />,
  },
  {
    id: '9',
    question: 'Are there any hidden charges?',
    answer:
      'No hidden charges! The price you see at checkout includes service charges, taxes (18% GST), and delivery fees. If you have a promo code, apply it to see your final discounted price.',
    category: 'pricing',
    icon: <Shield className="w-5 h-5" />,
  },
  {
    id: '10',
    question: 'What payment methods do you accept?',
    answer:
      'We accept UPI, credit/debit cards, net banking, and wallet payments (Paytm, PhonePe, Google Pay). You can also pay cash on delivery in select areas. All transactions are 100% secure.',
    category: 'pricing',
    icon: <CreditCard className="w-5 h-5" />,
  },

  // Delivery
  {
    id: '11',
    question: 'How long does it take to get my laundry back?',
    answer:
      'Standard service takes 24-48 hours. Express service delivers within 12 hours. The exact turnaround time depends on the laundry provider and the type of service selected. You will see the estimated delivery time when placing your order.',
    category: 'delivery',
    icon: <Truck className="w-5 h-5" />,
  },
  {
    id: '12',
    question: 'What if I am not home during delivery?',
    answer:
      'No problem! You can provide special delivery instructions such as "leave with security" or "call before delivery". You can also reschedule the delivery from your order dashboard.',
    category: 'delivery',
    icon: <Truck className="w-5 h-5" />,
  },
  {
    id: '13',
    question: 'Is there a delivery charge?',
    answer:
      'Delivery charges vary by provider and distance. Typically, it ranges from ₹30-50. Many providers offer free delivery for orders above ₹500. You will see the exact delivery charge at checkout.',
    category: 'delivery',
    icon: <Truck className="w-5 h-5" />,
  },

  // Partners
  {
    id: '14',
    question: 'How can I join as a Laundry Provider?',
    answer:
      'We welcome professional laundry service providers! Click on "Become a Partner" at the bottom of the page, or email us at partners@laundrease.in. You will need to provide your business license, service details, and complete a verification process. Once approved, you can start receiving orders from our platform.',
    category: 'partners',
    icon: <Store className="w-5 h-5" />,
  },
  {
    id: '15',
    question: 'How can I join as a Delivery Partner?',
    answer:
      'Want to earn by delivering laundry? Click on "Become a Delivery Partner" or email us at delivery@laundrease.in. You will need a valid vehicle (bike, scooter, or van), a driving license, and complete a background check. Flexible working hours and competitive earnings!',
    category: 'partners',
    icon: <Truck className="w-5 h-5" />,
  },
  {
    id: '16',
    question: 'What are the requirements to become a partner?',
    answer:
      'For Laundry Providers: Valid business license, commercial laundry equipment, quality certifications. For Delivery Partners: Valid driving license, own vehicle, smartphone, background verification. Both need to agree to our terms of service and quality standards.',
    category: 'partners',
    icon: <Shield className="w-5 h-5" />,
  },
  {
    id: '17',
    question: 'How much can I earn as a partner?',
    answer:
      'Earnings vary based on the number of orders you complete. Laundry providers typically earn 70-85% of the order value. Delivery partners earn ₹30-50 per delivery. Top performers can earn ₹30,000-50,000+ per month!',
    category: 'partners',
    icon: <Star className="w-5 h-5" />,
  },
]

const categories = [
  { id: 'all', label: 'All Questions', icon: <HeadphonesIcon className="w-5 h-5" /> },
  { id: 'general', label: 'General', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'orders', label: 'Orders', icon: <Package className="w-5 h-5" /> },
  { id: 'pricing', label: 'Pricing', icon: <CreditCard className="w-5 h-5" /> },
  { id: 'delivery', label: 'Delivery', icon: <Truck className="w-5 h-5" /> },
  { id: 'partners', label: 'Become a Partner', icon: <Store className="w-5 h-5" /> },
]

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFAQs = faqData.filter((faq) => {
    const matchesCategory = activeCategory === 'all' || faq.category === activeCategory
    const matchesSearch =
      searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const toggleFAQ = (id: string) => {
    setOpenId(openId === id ? null : id)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-600 py-20">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto px-4 text-center relative z-10"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6"
          >
            <HeadphonesIcon className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Find answers to common questions about Laundrease services, pricing, and partnerships
          </p>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-float" />
        <div className="absolute bottom-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-xl animate-float" style={{ animationDelay: '1s' }} />
      </div>

      <div className="container mx-auto px-4 py-16">
        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto mb-12 -mt-8 relative z-20"
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search for questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border-2 border-blue-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition-all bg-white dark:bg-gray-800 dark:border-gray-700 shadow-xl"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="w-6 h-6 text-blue-500" />
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Category Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          {categories.map((category, index) => (
            <motion.button
              key={category.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.1 }}
              onClick={() => setActiveCategory(category.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                activeCategory === category.id
                  ? 'bg-gradient-to-r from-blue-600 to-blue-600 text-white shadow-lg shadow-blue-500/50'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {category.icon}
              <span>{category.label}</span>
            </motion.button>
          ))}
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
                {filteredFAQs.map((faq, index) => (
                  <motion.div
                    key={faq.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden border border-gray-100 dark:border-gray-700"
                  >
                    <button
                      onClick={() => toggleFAQ(faq.id)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-500 flex items-center justify-center text-white">
                          {faq.icon}
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {faq.question}
                        </h3>
                      </div>
                      <motion.div
                        animate={{ rotate: openId === faq.id ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <ChevronDown className="w-6 h-6 text-gray-400" />
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
                          <div className="px-6 pb-6 pl-20">
                            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                              {faq.answer}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
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
          className="mt-20 max-w-4xl mx-auto"
        >
          <div className="bg-gradient-to-br from-blue-600 to-blue-600 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">Still have questions?</h2>
              <p className="text-white/90 mb-8 text-lg">
                Can't find the answer you're looking for? Our friendly support team is here to help!
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
