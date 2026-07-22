// app/customer/faq/faq-data.ts
// Plain data module (no 'use client', no JSX) so it's safe to import from
// both the client page.tsx (renders it) and the server layout.tsx (builds
// FAQPage JSON-LD from it) without crossing the React Server Component
// client/server module boundary.

export interface FAQItem {
  id: string
  question: string
  answer: string
  category: 'general' | 'orders' | 'pricing' | 'delivery' | 'partners'
  icon: 'sparkles' | 'map-pin' | 'user' | 'package' | 'credit-card' | 'clock' | 'shield' | 'truck' | 'store' | 'star'
}

export const faqData: FAQItem[] = [
  // General Questions
  {
    id: '1',
    question: 'What is Laundrease?',
    answer:
      'Laundrease is an on-demand laundry service platform that connects customers with professional laundry providers. We offer convenient pickup and delivery services, ensuring your clothes are cleaned, pressed, and delivered back to you with care.',
    category: 'general',
    icon: 'sparkles',
  },
  {
    id: '2',
    question: 'What areas do you serve?',
    answer:
      'We currently serve Pune (Pimpri-Chinchwad, Wakad, Hinjewadi, Baner, and surrounding areas). Enter your pincode on our homepage to check if we deliver to your location. We are rapidly expanding to new areas!',
    category: 'general',
    icon: 'map-pin',
  },
  {
    id: '3',
    question: 'How do I create an account?',
    answer:
      'Click on "Sign Up" at the top right corner, enter your email, phone number, and create a password. You will receive an OTP for verification. Once verified, you can start placing orders immediately!',
    category: 'general',
    icon: 'user',
  },

  // Orders
  {
    id: '4',
    question: 'How do I place an order?',
    answer:
      'Simply log in, select the services you need (wash & fold, dry cleaning, ironing, etc.), choose a pickup time, add your address, and place your order. Our delivery partner will pick up your laundry at the scheduled time.',
    category: 'orders',
    icon: 'package',
  },
  {
    id: '5',
    question: 'What is the minimum order value?',
    answer:
      'The minimum order value is ₹100. However, this may vary depending on the laundry provider you choose. Some providers offer free delivery for orders above ₹500.',
    category: 'orders',
    icon: 'credit-card',
  },
  {
    id: '6',
    question: 'Can I schedule a pickup for later?',
    answer:
      'Yes! You can schedule your pickup for any date and time slot that works for you. We offer flexible time slots from 9 AM to 9 PM. Express service is also available for same-day delivery.',
    category: 'orders',
    icon: 'clock',
  },
  {
    id: '7',
    question: 'Can I track my order?',
    answer:
      'Absolutely! Once your order is placed, you can track it in real-time from the "My Orders" section. You will receive notifications at every stage: pickup, washing, quality check, and delivery.',
    category: 'orders',
    icon: 'package',
  },

  // Pricing
  {
    id: '8',
    question: 'How is pricing calculated?',
    answer:
      'Pricing depends on the type of service (wash & fold, dry cleaning, ironing), the weight or quantity of items, and the laundry provider you choose. You can see the exact breakdown before placing your order. We charge ₹40-80 per kg for wash & fold and ₹150+ for dry cleaning.',
    category: 'pricing',
    icon: 'credit-card',
  },
  {
    id: '9',
    question: 'Are there any hidden charges?',
    answer:
      'No hidden charges! The price you see at checkout includes service charges, taxes (18% GST), and delivery fees. If you have a promo code, apply it to see your final discounted price.',
    category: 'pricing',
    icon: 'shield',
  },
  {
    id: '10',
    question: 'What payment methods do you accept?',
    answer:
      'We accept UPI, credit/debit cards, net banking, and wallet payments (Paytm, PhonePe, Google Pay). You can also pay cash on delivery in select areas. All transactions are 100% secure.',
    category: 'pricing',
    icon: 'credit-card',
  },

  // Delivery
  {
    id: '11',
    question: 'How long does it take to get my laundry back?',
    answer:
      'Standard service takes 24-48 hours. Express service delivers within 12 hours. The exact turnaround time depends on the laundry provider and the type of service selected. You will see the estimated delivery time when placing your order.',
    category: 'delivery',
    icon: 'truck',
  },
  {
    id: '12',
    question: 'What if I am not home during delivery?',
    answer:
      'No problem! You can provide special delivery instructions such as "leave with security" or "call before delivery". You can also reschedule the delivery from your order dashboard.',
    category: 'delivery',
    icon: 'truck',
  },
  {
    id: '13',
    question: 'Is there a delivery charge?',
    answer:
      'Delivery charges vary by provider and distance. Typically, it ranges from ₹30-50. Many providers offer free delivery for orders above ₹500. You will see the exact delivery charge at checkout.',
    category: 'delivery',
    icon: 'truck',
  },

  // Partners
  {
    id: '14',
    question: 'How can I join as a Laundry Provider?',
    answer:
      'We welcome professional laundry service providers! Click on "Become a Partner" at the bottom of the page, or email us at partners@laundrease.in. You will need to provide your business license, service details, and complete a verification process. Once approved, you can start receiving orders from our platform.',
    category: 'partners',
    icon: 'store',
  },
  {
    id: '15',
    question: 'How can I join as a Delivery Partner?',
    answer:
      'Want to earn by delivering laundry? Click on "Become a Delivery Partner" or email us at delivery@laundrease.in. You will need a valid vehicle (bike, scooter, or van), a driving license, and complete a background check. Flexible working hours and competitive earnings!',
    category: 'partners',
    icon: 'truck',
  },
  {
    id: '16',
    question: 'What are the requirements to become a partner?',
    answer:
      'For Laundry Providers: Valid business license, commercial laundry equipment, quality certifications. For Delivery Partners: Valid driving license, own vehicle, smartphone, background verification. Both need to agree to our terms of service and quality standards.',
    category: 'partners',
    icon: 'shield',
  },
  {
    id: '17',
    question: 'How much can I earn as a partner?',
    answer:
      'Earnings vary based on the number of orders you complete. Laundry providers typically earn 70-85% of the order value. Delivery partners earn ₹30-50 per delivery. Top performers can earn ₹30,000-50,000+ per month!',
    category: 'partners',
    icon: 'star',
  },
]
