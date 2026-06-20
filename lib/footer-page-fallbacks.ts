import type {
  PageContentBlock,
  LegalDocument,
  CareerJob,
} from '@/types/footer-pages'

// ============================================================
// Static fallback content — used when API/DB is unavailable.
// Shaped identically to API responses so components render
// without any conditional logic.
// ============================================================

// ---- About Us -----------------------------------------------
export const ABOUT_US_FALLBACK: PageContentBlock[] = [
  {
    id: 0, page_slug: 'about_us', section_key: 'hero', section_type: 'hero',
    title: 'We Take Care of Your Laundry, So You Can Take Care of What Matters',
    subtitle: 'Laundrease was born from a simple frustration — laundry takes too much time. We built the platform we wished existed.',
    body: { badge: 'Our Story', cta_text: 'Explore Services', cta_href: '/services', founded_year: '2023', tagline: 'Wash. Fold. Deliver. Repeat.' },
    sort_order: 10,
  },
  {
    id: 0, page_slug: 'about_us', section_key: 'mission', section_type: 'text_block',
    title: 'Our Mission',
    subtitle: null,
    body: { body: 'To make professional laundry care accessible, affordable, and effortless for every household in India — starting with Pune. We believe your time is too valuable to spend sorting, washing, and ironing.', highlight: 'Your time is our priority.' },
    sort_order: 20,
  },
  {
    id: 0, page_slug: 'about_us', section_key: 'stats', section_type: 'stats',
    title: null, subtitle: null,
    body: [
      { label: 'Orders Completed', value: '50,000+', icon: 'package' },
      { label: 'Happy Customers', value: '12,000+', icon: 'smile' },
      { label: 'Laundry Partners', value: '80+', icon: 'store' },
      { label: 'Cities Served', value: '3', icon: 'map-pin' },
    ],
    sort_order: 30,
  },
  {
    id: 0, page_slug: 'about_us', section_key: 'values', section_type: 'cards',
    title: 'What We Stand For',
    subtitle: 'Every decision we make comes back to these core values.',
    body: [
      { icon: 'shield-check', title: 'Trust & Safety', body: 'Every laundry partner is background-verified, trained to our quality standards, and rated by real customers after every order.' },
      { icon: 'leaf', title: 'Sustainability', body: 'We prioritize eco-friendly detergents and water-efficient washing methods. Good for your clothes, better for the planet.' },
      { icon: 'clock', title: 'Reliability', body: 'We know how much you depend on us. That is why we have built real-time tracking, guaranteed pickup windows, and a zero-excuse delivery commitment.' },
      { icon: 'heart', title: 'Care in Every Stitch', body: 'Laundry is personal. We treat your garments with the same care we would want for our own.' },
    ],
    sort_order: 40,
  },
  {
    id: 0, page_slug: 'about_us', section_key: 'story', section_type: 'text_block',
    title: 'How It Started',
    subtitle: null,
    body: { body: 'Laundrease started in a small apartment in Hinjewadi, Pune in 2023. Our founder kept running out of clean clothes. So we built something better. We started with three laundry partners and ten customers. Today we serve thousands of households across Pune.', highlight: 'Started in Hinjewadi, growing across India.' },
    sort_order: 50,
  },
]

// ---- Help Center --------------------------------------------
export const HELP_CENTER_FALLBACK: PageContentBlock[] = [
  {
    id: 0, page_slug: 'help_center', section_key: 'hero', section_type: 'hero',
    title: 'How Can We Help You?',
    subtitle: 'Find answers to common questions or reach out to our support team.',
    body: { badge: 'Help Center', search_placeholder: 'Search for answers...' },
    sort_order: 10,
  },
  {
    id: 0, page_slug: 'help_center', section_key: 'faq_orders', section_type: 'faq_group',
    title: 'Orders & Scheduling', subtitle: null,
    body: {
      category: 'orders', icon: 'package',
      items: [
        { q: 'How do I place an order?', a: 'Log in to your account, go to the dashboard, and click Place Order. Select your garments and services, choose a pickup time slot, confirm your address, and proceed to payment.' },
        { q: 'Can I schedule a future pickup?', a: 'Yes. When selecting your pickup slot, you can choose any available date and time within the next 7 days. We offer morning, afternoon, and evening slots.' },
        { q: 'Can I modify or cancel my order?', a: 'You can modify or cancel an order up to 30 minutes before the scheduled pickup time. Go to My Orders and select the order to make changes.' },
        { q: 'What if I am not home during pickup?', a: 'You can leave the laundry bag with your security guard or a trusted neighbour. Add delivery instructions when placing the order.' },
      ],
    },
    sort_order: 20,
  },
  {
    id: 0, page_slug: 'help_center', section_key: 'faq_payment', section_type: 'faq_group',
    title: 'Payments & Refunds', subtitle: null,
    body: {
      category: 'payment', icon: 'credit-card',
      items: [
        { q: 'What payment methods are accepted?', a: 'We accept UPI (Google Pay, PhonePe, Paytm), credit and debit cards, net banking, and cash on delivery in select areas.' },
        { q: 'How do refunds work?', a: 'Refunds are processed within 3–5 business days back to your original payment method. Wallet credits are applied instantly.' },
        { q: 'Can I use a coupon code?', a: 'Yes. On the checkout screen, there is a field to enter your coupon code. Valid codes will show the discount amount before you confirm payment.' },
      ],
    },
    sort_order: 50,
  },
  {
    id: 0, page_slug: 'help_center', section_key: 'contact', section_type: 'cards',
    title: 'Still Need Help?',
    subtitle: 'Our support team is here for you.',
    body: [
      { icon: 'message-circle', title: 'Live Chat', body: 'Chat with us in the app. Average response time is under 5 minutes.', action_label: 'Start Chat', action_href: '#chat' },
      { icon: 'mail', title: 'Email Support', body: 'Email us at support@laundrease.in. We respond within 4 hours on business days.', action_label: 'Send Email', action_href: 'mailto:support@laundrease.in' },
      { icon: 'phone', title: 'Call Us', body: 'Call our helpline at +91 98765-43210, available Monday–Saturday, 9AM–8PM.', action_label: 'Call Now', action_href: 'tel:+919876543210' },
    ],
    sort_order: 70,
  },
]

// ---- Safety Center ------------------------------------------
export const SAFETY_CENTER_FALLBACK: PageContentBlock[] = [
  {
    id: 0, page_slug: 'safety_center', section_key: 'hero', section_type: 'hero',
    title: 'Your Safety Is Our Foundation',
    subtitle: 'Every interaction on Laundrease is built around keeping you safe.',
    body: { badge: 'Safety Center' },
    sort_order: 10,
  },
  {
    id: 0, page_slug: 'safety_center', section_key: 'partner_safety', section_type: 'cards',
    title: 'How We Vet Every Partner',
    subtitle: 'We do not let just anyone handle your belongings.',
    body: [
      { icon: 'shield-check', title: 'Background Verification', body: 'Every delivery partner and laundry service provider undergoes mandatory police verification and address verification.' },
      { icon: 'badge-check', title: 'Identity Verification', body: 'We verify Aadhaar, PAN, driving license, and vehicle documents for all delivery partners.' },
      { icon: 'star', title: 'Rating-Based Access', body: 'Partners must maintain a minimum 3.5-star rating. Consistent low ratings result in retraining or removal.' },
      { icon: 'refresh-cw', title: 'Continuous Monitoring', body: 'We run periodic re-verification checks and monitor complaint patterns.' },
    ],
    sort_order: 20,
  },
  {
    id: 0, page_slug: 'safety_center', section_key: 'data_safety', section_type: 'cards',
    title: 'Your Data & Privacy',
    subtitle: 'We collect only what we need and protect it rigorously.',
    body: [
      { icon: 'lock', title: 'Encrypted Storage', body: 'Your personal data is encrypted at rest and in transit using AES-256 and TLS 1.3.' },
      { icon: 'eye-off', title: 'No Data Selling', body: 'We never sell your personal data to third parties. Your information is used only to provide and improve Laundrease.' },
      { icon: 'smartphone', title: 'Number Masking', body: 'Delivery partners never see your personal phone number. All calls are routed through our in-app calling system.' },
      { icon: 'trash-2', title: 'Right to Deletion', body: 'You can request complete deletion of your account and all associated data at any time.' },
    ],
    sort_order: 40,
  },
]

// ---- Terms of Service ---------------------------------------
export const TERMS_FALLBACK: LegalDocument = {
  id: 0,
  code: 'terms_of_service',
  title: 'Terms of Service',
  version: '1.0',
  effective_date: '2024-01-01',
  updated_at: new Date().toISOString(),
  content: [
    { heading: '1. Acceptance of Terms', body: 'By accessing or using the Laundrease platform, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.' },
    { heading: '2. Description of Services', body: 'Laundrease is an on-demand laundry platform that connects customers with independent laundry service providers and delivery partners.' },
    { heading: '3. Eligibility', body: 'You must be at least 18 years of age to create an account and use our services.' },
    { heading: '4. Orders & Service', body: 'Orders may be cancelled up to 30 minutes before the scheduled pickup time. In case of quality issues, contact support within 24 hours of delivery.' },
    { heading: '5. Payments & Pricing', body: 'All prices are inclusive of applicable taxes. Prices at time of order confirmation are binding for that transaction.' },
    { heading: '6. Liability & Limitation', body: "Laundrease's liability for any lost or damaged garment is limited to ₹5,000 per garment and ₹20,000 per order." },
    { heading: '7. Governing Law', body: 'These Terms are governed by the laws of India. Disputes are subject to the jurisdiction of courts in Pune, Maharashtra.' },
    { heading: '8. Contact', body: 'For questions about these Terms, contact us at legal@laundrease.in.' },
  ],
}

// ---- Privacy Policy -----------------------------------------
export const PRIVACY_FALLBACK: LegalDocument = {
  id: 0,
  code: 'privacy_policy',
  title: 'Privacy Policy',
  version: '1.0',
  effective_date: '2024-01-01',
  updated_at: new Date().toISOString(),
  content: [
    { heading: '1. Introduction', body: 'Laundrease Technologies Private Limited is committed to protecting your personal information. This Privacy Policy explains what information we collect and how we use it.' },
    { heading: '2. Information We Collect', body: 'We collect information you provide (name, email, phone, addresses) and information generated through your use of our platform (device info, usage data).' },
    { heading: '3. How We Use Your Information', body: 'We use your information to provide services, process orders, send notifications, process payments, and prevent fraud.' },
    { heading: '4. How We Share Your Information', body: 'We share only what is necessary — with your assigned service partner and delivery partner, and with our payment processors. We never sell your data.' },
    { heading: '5. Data Security', body: 'We use AES-256 encryption at rest and TLS 1.3 in transit, with regular security audits and strict access controls.' },
    { heading: '6. Your Rights', body: 'You have the right to access, correct, or delete your personal data. Contact us at privacy@laundrease.in to exercise your rights.' },
    { heading: '7. Contact Us', body: 'For privacy questions, contact our Data Protection Officer at: privacy@laundrease.in.' },
  ],
}
