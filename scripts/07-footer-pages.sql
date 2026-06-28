-- ============================================================
-- FOOTER PAGES SCHEMA
-- Tables: legal_documents, page_content_blocks, career_jobs
-- ============================================================

-- 1) Legal documents (Terms of Service, Privacy Policy) — versioned
CREATE TABLE IF NOT EXISTS legal_documents (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) NOT NULL,           -- 'terms_of_service' | 'privacy_policy'
  title        VARCHAR(255) NOT NULL,
  version      VARCHAR(20) NOT NULL,           -- e.g. '2.1', '2024-03'
  -- Array of sections: [{ heading, body, subsections?: [{heading, body}] }]
  content      JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE, -- only one active per code
  effective_date DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_legal_code_version UNIQUE (code, version),
  CONSTRAINT chk_legal_content_array CHECK (jsonb_typeof(content) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_active_per_code
  ON legal_documents (code)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_legal_documents_code ON legal_documents (code);
CREATE INDEX IF NOT EXISTS idx_legal_documents_active ON legal_documents (is_active);

-- 2) Generic page content blocks (About Us, Help Center, Safety Center)
CREATE TABLE IF NOT EXISTS page_content_blocks (
  id           SERIAL PRIMARY KEY,
  page_slug    VARCHAR(50) NOT NULL,           -- 'about_us' | 'help_center' | 'safety_center'
  section_key  VARCHAR(100) NOT NULL,          -- 'hero', 'mission', 'team', 'faq_group_billing' etc.
  section_type VARCHAR(50) NOT NULL DEFAULT 'generic',
  -- e.g. 'hero' | 'stats' | 'cards' | 'faq_group' | 'text_block' | 'team_grid'
  title        VARCHAR(255),
  subtitle     TEXT,
  -- Flexible JSONB payload per section_type:
  -- hero:       { badge, cta_text, cta_href, image_url }
  -- stats:      [{ label, value, icon }]
  -- cards:      [{ icon, title, body }]
  -- faq_group:  { category, items: [{ q, a }] }
  -- text_block: { body (markdown/html) }
  -- team_grid:  [{ name, role, bio, image_url }]
  body         JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_page_section UNIQUE (page_slug, section_key)
);

CREATE INDEX IF NOT EXISTS idx_pcb_page_slug ON page_content_blocks (page_slug, is_active, sort_order);

-- 3) Career job postings
CREATE TABLE IF NOT EXISTS career_jobs (
  id                  SERIAL PRIMARY KEY,
  title               VARCHAR(255) NOT NULL,
  department          VARCHAR(100) NOT NULL,
  location            VARCHAR(150) NOT NULL,   -- e.g. 'Pune, Maharashtra' | 'Remote' | 'Hybrid - Bangalore'
  employment_type     VARCHAR(30) NOT NULL
    CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
  experience_range    VARCHAR(50),             -- e.g. '2-4 years', 'Fresher'
  -- Structured content (arrays of strings for clean rendering)
  about_role          TEXT,
  responsibilities    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  requirements        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  nice_to_have        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  benefits            JSONB NOT NULL DEFAULT '[]'::jsonb,  -- string[]
  -- JD PDF stored in S3
  jd_s3_key           VARCHAR(500),            -- S3 object key (path within bucket)
  -- HR contact for applications
  hr_name             VARCHAR(100) NOT NULL,
  hr_email            VARCHAR(255) NOT NULL,
  -- Email template shown to applicant
  email_subject_format TEXT NOT NULL,          -- e.g. 'Application for {title} - {your_name}'
  email_body_format   TEXT NOT NULL,           -- multi-line template
  -- Lifecycle
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_career_responsibilities CHECK (jsonb_typeof(responsibilities) = 'array'),
  CONSTRAINT chk_career_requirements CHECK (jsonb_typeof(requirements) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_career_jobs_active ON career_jobs (is_active, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_career_jobs_dept ON career_jobs (department);
CREATE INDEX IF NOT EXISTS idx_career_jobs_featured ON career_jobs (is_featured) WHERE is_featured = TRUE;

-- Auto updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at_legal() RETURNS trigger AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_documents_updated_at ON legal_documents;
CREATE TRIGGER trg_legal_documents_updated_at
  BEFORE UPDATE ON legal_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at_legal();

DROP TRIGGER IF EXISTS trg_pcb_updated_at ON page_content_blocks;
CREATE TRIGGER trg_pcb_updated_at
  BEFORE UPDATE ON page_content_blocks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_career_jobs_updated_at ON career_jobs;
CREATE TRIGGER trg_career_jobs_updated_at
  BEFORE UPDATE ON career_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SEED DATA
-- ============================================================

-- --------------------------------------------------------
-- ABOUT US
-- --------------------------------------------------------
INSERT INTO page_content_blocks (page_slug, section_key, section_type, title, subtitle, body, sort_order) VALUES
(
  'about_us', 'hero', 'hero',
  'We Take Care of Your Laundry, So You Can Take Care of What Matters',
  'Laundrease was born from a simple frustration — laundry takes too much time. We built the platform we wished existed.',
  '{"badge": "Our Story", "cta_text": "Explore Services", "cta_href": "/services", "founded_year": "2023", "tagline": "Wash. Fold. Deliver. Repeat."}'::jsonb,
  10
),
(
  'about_us', 'mission', 'text_block',
  'Our Mission',
  NULL,
  '{"body": "To make professional laundry care accessible, affordable, and effortless for every household in India — starting with Pune. We believe your time is too valuable to spend sorting, washing, and ironing. That is why we built a network of verified laundry professionals who bring hotel-quality care to your doorstep.", "highlight": "Your time is our priority."}'::jsonb,
  20
),
(
  'about_us', 'stats', 'stats',
  NULL, NULL,
  '[{"label": "Orders Completed", "value": "50,000+", "icon": "package"}, {"label": "Happy Customers", "value": "12,000+", "icon": "smile"}, {"label": "Laundry Partners", "value": "80+", "icon": "store"}, {"label": "Cities Served", "value": "3", "icon": "map-pin"}]'::jsonb,
  30
),
(
  'about_us', 'values', 'cards',
  'What We Stand For',
  'Every decision we make comes back to these core values.',
  '[{"icon": "shield-check", "title": "Trust & Safety", "body": "Every laundry partner is background-verified, trained to our quality standards, and rated by real customers after every order."}, {"icon": "leaf", "title": "Sustainability", "body": "We prioritize eco-friendly detergents and water-efficient washing methods. Good for your clothes, better for the planet."}, {"icon": "clock", "title": "Reliability", "body": "We know how much you depend on us. That is why we have built real-time tracking, guaranteed pickup windows, and a zero-excuse delivery commitment."}, {"icon": "heart", "title": "Care in Every Stitch", "body": "Laundry is personal. We treat your garments with the same care we would want for our own — right down to how we fold your shirts."}]'::jsonb,
  40
),
(
  'about_us', 'story', 'text_block',
  'How It Started',
  NULL,
  '{"body": "Laundrease started in a small apartment in Hinjewadi, Pune in 2023. Our founder, a software engineer working long hours, kept running out of clean clothes. Local dhobis were inconsistent, self-service laundromats were far away, and existing apps either did not serve Pune or charged premium prices for mediocre service. So we built something better. We started with three laundry partners and ten customers. Today we serve thousands of households across Pune and are growing fast.", "highlight": "Started in Hinjewadi, growing across India."}'::jsonb,
  50
),
(
  'about_us', 'team', 'text_block',
  'Built by a Team That Cares',
  NULL,
  '{"body": "Our team spans product, technology, operations, and logistics. We are a group of people who genuinely believe that mundane chores should not consume your evenings and weekends. We obsess over delivery times, garment handling, and customer feedback because we know that trust, once broken, is hard to rebuild.", "highlight": "A team obsessed with getting the details right."}'::jsonb,
  60
)
ON CONFLICT (page_slug, section_key) DO UPDATE
  SET title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      body = EXCLUDED.body,
      updated_at = NOW();

-- --------------------------------------------------------
-- HELP CENTER
-- --------------------------------------------------------
INSERT INTO page_content_blocks (page_slug, section_key, section_type, title, subtitle, body, sort_order) VALUES
(
  'help_center', 'hero', 'hero',
  'How Can We Help You?',
  'Find answers to common questions or reach out to our support team.',
  '{"badge": "Help Center", "search_placeholder": "Search for answers..."}'::jsonb,
  10
),
(
  'help_center', 'faq_orders', 'faq_group',
  'Orders & Scheduling', NULL,
  '{"category": "orders", "icon": "package", "items": [{"q": "How do I place an order?", "a": "Log in to your account, go to the dashboard, and click Place Order. Select your garments and services, choose a pickup time slot, confirm your address, and proceed to payment. It takes less than 3 minutes."}, {"q": "Can I schedule a future pickup?", "a": "Yes. When selecting your pickup slot, you can choose any available date and time within the next 7 days. We offer morning (9AM–12PM), afternoon (12PM–4PM), and evening (4PM–8PM) slots."}, {"q": "What is the minimum order value?", "a": "The minimum order value is ₹100. For orders above ₹500, delivery is free. Below that, a small delivery fee of ₹30–50 applies depending on your location."}, {"q": "Can I modify or cancel my order?", "a": "You can modify or cancel an order up to 30 minutes before the scheduled pickup time. After that, the order is confirmed and cannot be cancelled. To modify, go to My Orders and select the order."}, {"q": "What if I am not home during pickup?", "a": "You can leave the laundry bag with your security guard or a trusted neighbour. Add delivery instructions when placing the order so our partner knows where to collect it."}]}'::jsonb,
  20
),
(
  'help_center', 'faq_services', 'faq_group',
  'Services & Pricing', NULL,
  '{"category": "services", "icon": "sparkles", "items": [{"q": "What services does Laundrease offer?", "a": "We offer Wash & Fold (priced per kg), Dry Cleaning (priced per garment), Steam Ironing (priced per piece), and Express Service (same-day or next-day delivery at 1.5x the standard rate)."}, {"q": "How is pricing calculated?", "a": "Wash & Fold is charged per kg. Dry Cleaning and Ironing are charged per garment. You will see a detailed price breakdown before confirming your order. Prices may vary slightly by laundry provider."}, {"q": "What is the turnaround time?", "a": "Standard service: 24–48 hours. Express service: 8–12 hours. The estimated delivery time is shown on the order confirmation screen and in your order tracking."}, {"q": "Can I request a specific laundry provider?", "a": "Yes. On the service selection screen, you can browse available providers near you, see their ratings and reviews, and choose your preferred one."}, {"q": "Do you handle delicate or special fabrics?", "a": "Yes. When placing your order, you can add special instructions for individual garments — for example, cold wash only, no tumble dry, or hand wash. Our verified partners are trained to handle silk, wool, and other delicate fabrics."}]}'::jsonb,
  30
),
(
  'help_center', 'faq_delivery', 'faq_group',
  'Pickup & Delivery', NULL,
  '{"category": "delivery", "icon": "truck", "items": [{"q": "How do I track my order?", "a": "Once your order is picked up, you can track it in real-time from the My Orders section. You will also receive notifications at each stage: Picked Up, At Laundry, Quality Check Done, and Out for Delivery."}, {"q": "What areas do you serve?", "a": "We currently serve Pune including Pimpri-Chinchwad, Wakad, Hinjewadi, Baner, Aundh, Kothrud, and surrounding areas. Enter your pincode on the homepage to check availability."}, {"q": "What if my delivery is delayed?", "a": "We take delays seriously. If your order is delayed beyond the promised delivery window, you will be notified immediately and offered a discount on your next order. You can also contact support from the app."}, {"q": "How are my clothes packaged for delivery?", "a": "All garments are neatly folded or hung, wrapped in protective packaging, and delivered in sealed bags. Dry-cleaned items come in individual garment bags."}]}'::jsonb,
  40
),
(
  'help_center', 'faq_payment', 'faq_group',
  'Payments & Refunds', NULL,
  '{"category": "payment", "icon": "credit-card", "items": [{"q": "What payment methods are accepted?", "a": "We accept UPI (Google Pay, PhonePe, Paytm), credit and debit cards, net banking, and cash on delivery in select areas. All online transactions are encrypted and secure."}, {"q": "When is payment collected?", "a": "For prepaid orders, payment is collected at checkout. For Cash on Delivery orders, payment is collected at the time of delivery by our delivery partner."}, {"q": "How do refunds work?", "a": "If you are eligible for a refund (cancelled order, lost item, or quality issue), it will be processed within 3–5 business days back to your original payment method. Wallet credits are applied instantly."}, {"q": "Can I use a coupon code?", "a": "Yes. On the checkout screen, there is a field to enter your coupon code. Valid codes will show the discount amount before you confirm payment."}]}'::jsonb,
  50
),
(
  'help_center', 'faq_account', 'faq_group',
  'Account & Profile', NULL,
  '{"category": "account", "icon": "user-circle", "items": [{"q": "How do I update my address?", "a": "Go to Profile → My Addresses. You can add up to 10 addresses, set a default, and edit or delete existing ones at any time."}, {"q": "I forgot my password. What do I do?", "a": "On the login screen, click Forgot Password. Enter your registered email address and we will send you a reset link. The link is valid for 1 hour."}, {"q": "How do I delete my account?", "a": "To request account deletion, contact our support team via the Help section in the app or email us at support@laundrease.com. We will process the request within 7 business days."}]}'::jsonb,
  60
),
(
  'help_center', 'contact', 'cards',
  'Still Need Help?',
  'Our support team is here for you.',
  '[{"icon": "message-circle", "title": "Live Chat", "body": "Chat with us in the app. Average response time is under 5 minutes.", "action_label": "Start Chat", "action_href": "#chat"}, {"icon": "mail", "title": "Email Support", "body": "Email us at support@laundrease.com. We respond within 4 hours on business days.", "action_label": "Send Email", "action_href": "mailto:support@laundrease.com"}, {"icon": "phone", "title": "Call Us", "body": "Call our helpline at +91 98765-43210, available Monday–Saturday, 9AM–8PM.", "action_label": "Call Now", "action_href": "tel:+919876543210"}]'::jsonb,
  70
)
ON CONFLICT (page_slug, section_key) DO UPDATE
  SET title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      body = EXCLUDED.body,
      updated_at = NOW();

-- --------------------------------------------------------
-- SAFETY CENTER
-- --------------------------------------------------------
INSERT INTO page_content_blocks (page_slug, section_key, section_type, title, subtitle, body, sort_order) VALUES
(
  'safety_center', 'hero', 'hero',
  'Your Safety Is Our Foundation',
  'Every interaction on Laundrease — from the partner who picks up your clothes to how your data is stored — is built around keeping you safe.',
  '{"badge": "Safety Center"}'::jsonb,
  10
),
(
  'safety_center', 'partner_safety', 'cards',
  'How We Vet Every Partner',
  'We do not let just anyone handle your belongings.',
  '[{"icon": "shield-check", "title": "Background Verification", "body": "Every delivery partner and laundry service provider undergoes a mandatory police verification and address verification before they are allowed on the platform."}, {"icon": "badge-check", "title": "Identity Verification", "body": "We verify Aadhaar, PAN, driving license, and vehicle documents for all delivery partners. Laundry providers submit business registration and GST certificates."}, {"icon": "star", "title": "Rating-Based Access", "body": "Partners must maintain a minimum 3.5-star rating to stay active. Consistent low ratings result in retraining or permanent removal from the platform."}, {"icon": "refresh-cw", "title": "Continuous Monitoring", "body": "We run periodic re-verification checks and monitor complaint patterns. A single serious complaint triggers an immediate investigation."}]'::jsonb,
  20
),
(
  'safety_center', 'item_safety', 'cards',
  'Protecting Your Belongings',
  'Your clothes and personal items deserve careful handling.',
  '[{"icon": "scan", "title": "Barcode Tracking", "body": "Every order gets a unique barcode. Your garments are scanned at pickup, at the laundry facility, and at delivery — creating a full chain of custody."}, {"icon": "camera", "title": "Condition Photography", "body": "Delivery partners photograph your items before pickup and after delivery. This creates a timestamped visual record that protects both you and the partner."}, {"icon": "package", "title": "Tamper-Evident Packaging", "body": "All orders are sealed in tamper-evident packaging at the laundry facility before dispatch. If the seal is broken on delivery, do not accept the package and contact support."}, {"icon": "alert-triangle", "title": "Loss & Damage Policy", "body": "In the rare event of loss or damage, we have a clear compensation policy: up to ₹5,000 per garment and up to ₹20,000 per order, processed within 7 business days."}]'::jsonb,
  30
),
(
  'safety_center', 'data_safety', 'cards',
  'Your Data & Privacy',
  'We collect only what we need and protect it rigorously.',
  '[{"icon": "lock", "title": "Encrypted Storage", "body": "Your personal data — including address, phone number, and payment details — is encrypted at rest and in transit using industry-standard AES-256 and TLS 1.3."}, {"icon": "eye-off", "title": "No Data Selling", "body": "We never sell your personal data to third parties. Period. Your information is used only to provide and improve the Laundrease service."}, {"icon": "smartphone", "title": "Number Masking", "body": "When our delivery partners call you, your actual phone number is masked. They call through our in-app calling system and never see your personal number."}, {"icon": "trash-2", "title": "Right to Deletion", "body": "You can request complete deletion of your account and all associated data at any time. We process all deletion requests within 7 business days."}]'::jsonb,
  40
),
(
  'safety_center', 'report', 'text_block',
  'Report a Safety Concern',
  NULL,
  '{"body": "If you ever feel unsafe, notice suspicious behaviour, or want to report a policy violation, please contact our Trust & Safety team immediately. All reports are treated confidentially and investigated within 24 hours.", "highlight": "Every report is taken seriously.", "contacts": [{"label": "Safety Hotline", "value": "+91 98765-43299", "type": "phone"}, {"label": "Safety Email", "value": "safety@laundrease.com", "type": "email"}]}'::jsonb,
  50
)
ON CONFLICT (page_slug, section_key) DO UPDATE
  SET title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle,
      body = EXCLUDED.body,
      updated_at = NOW();

-- --------------------------------------------------------
-- TERMS OF SERVICE
-- --------------------------------------------------------
INSERT INTO legal_documents (code, title, version, effective_date, is_active, content) VALUES
(
  'terms_of_service',
  'Terms of Service',
  '1.0',
  '2024-01-01',
  TRUE,
  '[
    {
      "heading": "1. Acceptance of Terms",
      "body": "By accessing or using the Laundrease platform (including our website, mobile application, and related services), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services. These terms constitute a legally binding agreement between you and Laundrease Technologies Private Limited."
    },
    {
      "heading": "2. Description of Services",
      "body": "Laundrease is an on-demand laundry platform that connects customers with independent laundry service providers and delivery partners. We facilitate the pickup, cleaning, and delivery of garments and household textiles. Laundrease acts as an intermediary platform and is not itself a laundry service provider."
    },
    {
      "heading": "3. Eligibility",
      "body": "You must be at least 18 years of age to create an account and use our services. By registering, you represent and warrant that you meet this requirement and that all information you provide is accurate and complete."
    },
    {
      "heading": "4. User Accounts",
      "body": "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately at security@laundrease.com if you suspect any unauthorized use of your account. Laundrease is not liable for any loss resulting from unauthorized account access due to your failure to safeguard your credentials.",
      "subsections": [
        {"heading": "4.1 Account Information", "body": "You agree to provide accurate, current, and complete information during registration and to update such information as necessary."},
        {"heading": "4.2 Account Security", "body": "You are solely responsible for all activity that occurs under your account. We recommend enabling two-factor authentication where available."}
      ]
    },
    {
      "heading": "5. Orders & Service",
      "body": "When you place an order through the platform, you are entering into a service agreement with the laundry provider you select. Laundrease facilitates this transaction but is not a party to the service agreement between you and the provider.",
      "subsections": [
        {"heading": "5.1 Order Cancellation", "body": "Orders may be cancelled up to 30 minutes before the scheduled pickup time. Cancellations after this window may incur a cancellation fee of ₹50."},
        {"heading": "5.2 Service Quality", "body": "While we vet all service providers, Laundrease cannot guarantee the quality of services provided by independent partners. In case of quality issues, please contact our support team within 24 hours of delivery."}
      ]
    },
    {
      "heading": "6. Payments & Pricing",
      "body": "All prices displayed on the platform are inclusive of applicable taxes unless otherwise stated. Payment is required at the time of order placement for prepaid orders. Cash on delivery is available in select areas. Prices are subject to change; the price at the time of order confirmation is binding for that transaction."
    },
    {
      "heading": "7. Liability & Limitation",
      "body": "Laundrease's liability for any lost or damaged garment is limited to ₹5,000 per garment and ₹20,000 per order. We are not liable for damages resulting from normal wear and tear, pre-existing damage, or items left in pockets. Our total cumulative liability to you for any claims arising from use of the platform shall not exceed the amount paid by you in the 3 months preceding the claim."
    },
    {
      "heading": "8. Prohibited Items",
      "body": "You must not include the following in laundry orders: cash or currency, jewellery or valuables, illegal substances, hazardous materials, or items of irreplaceable sentimental value. Laundrease is not liable for loss of prohibited items submitted with laundry orders."
    },
    {
      "heading": "9. Intellectual Property",
      "body": "All content on the Laundrease platform — including logos, text, graphics, and software — is the property of Laundrease Technologies Private Limited and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission."
    },
    {
      "heading": "10. Governing Law",
      "body": "These Terms of Service are governed by the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts in Pune, Maharashtra, India."
    },
    {
      "heading": "11. Changes to Terms",
      "body": "We reserve the right to modify these terms at any time. We will notify registered users of material changes via email or in-app notification at least 14 days before the changes take effect. Continued use of the platform after the effective date constitutes acceptance of the revised terms."
    },
    {
      "heading": "12. Contact",
      "body": "For questions about these Terms of Service, contact us at legal@laundrease.com or write to: Laundrease Technologies Private Limited, Hinjewadi Phase 1, Pune, Maharashtra 411057, India."
    }
  ]'::jsonb
)
ON CONFLICT (code, version) DO UPDATE
  SET content = EXCLUDED.content,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();

-- --------------------------------------------------------
-- PRIVACY POLICY
-- --------------------------------------------------------
INSERT INTO legal_documents (code, title, version, effective_date, is_active, content) VALUES
(
  'privacy_policy',
  'Privacy Policy',
  '1.0',
  '2024-01-01',
  TRUE,
  '[
    {
      "heading": "1. Introduction",
      "body": "Laundrease Technologies Private Limited (\"Laundrease\", \"we\", \"us\", \"our\") is committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, how we protect it, and your rights regarding your data. This policy applies to all users of the Laundrease platform."
    },
    {
      "heading": "2. Information We Collect",
      "body": "We collect information you provide directly and information generated through your use of our platform.",
      "subsections": [
        {"heading": "2.1 Information You Provide", "body": "Name, email address, phone number, delivery addresses, payment information (stored securely via our payment processors), and any special instructions you provide with orders."},
        {"heading": "2.2 Information We Collect Automatically", "body": "Device information (device type, OS, browser), IP address, location data (only when you use the app and grant permission), usage data (pages visited, features used, order history), and cookies and similar tracking technologies."},
        {"heading": "2.3 Information from Third Parties", "body": "If you log in using Google or Facebook, we receive your name, email address, and profile picture from those services, subject to your privacy settings on those platforms."}
      ]
    },
    {
      "heading": "3. How We Use Your Information",
      "body": "We use your information to: provide and improve our services, process and track orders, send order updates and notifications, process payments, respond to support requests, prevent fraud and ensure platform security, and send promotional communications (with your consent)."
    },
    {
      "heading": "4. How We Share Your Information",
      "body": "We share your information only as necessary to provide the service.",
      "subsections": [
        {"heading": "4.1 With Service Partners", "body": "We share your name, address, and order details with the laundry provider and delivery partner assigned to your order. We do not share your phone number directly — calls are routed through our masked calling system."},
        {"heading": "4.2 With Payment Processors", "body": "Payment information is processed by our PCI-DSS compliant payment partners. We do not store your full card details on our servers."},
        {"heading": "4.3 With Service Providers", "body": "We use third-party services for hosting, analytics, customer support, and communications. These providers are contractually bound to use your data only for the services they provide to us."},
        {"heading": "4.4 Legal Requirements", "body": "We may disclose your information if required to do so by law, court order, or governmental authority."}
      ]
    },
    {
      "heading": "5. Data Security",
      "body": "We implement industry-standard security measures including AES-256 encryption at rest, TLS 1.3 for data in transit, regular security audits, access controls limiting employee access to personal data, and intrusion detection systems. However, no system is completely secure and we cannot guarantee absolute security."
    },
    {
      "heading": "6. Data Retention",
      "body": "We retain your personal data for as long as your account is active or as needed to provide services. Order history is retained for 3 years for accounting and legal compliance. When you delete your account, we delete or anonymize your personal data within 30 days, except where retention is required by law."
    },
    {
      "heading": "7. Your Rights",
      "body": "Under applicable Indian data protection law, you have the right to: access the personal data we hold about you, correct inaccurate data, request deletion of your data (right to be forgotten), object to certain processing, data portability, and withdraw consent at any time. To exercise any of these rights, contact us at privacy@laundrease.com."
    },
    {
      "heading": "8. Cookies",
      "body": "We use essential cookies to operate the platform (session management, security), functional cookies for preferences (language, saved addresses), and analytics cookies to understand how the platform is used. You can control cookie preferences through your browser settings. Disabling cookies may affect platform functionality."
    },
    {
      "heading": "9. Children''s Privacy",
      "body": "Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If we become aware that we have inadvertently collected such information, we will delete it promptly."
    },
    {
      "heading": "10. Changes to This Policy",
      "body": "We may update this Privacy Policy from time to time. We will notify you of significant changes by email or in-app notification. The date at the top of this page indicates when the policy was last updated. Your continued use of the platform after changes are posted constitutes your acceptance of the revised policy."
    },
    {
      "heading": "11. Contact Us",
      "body": "For privacy-related questions, requests, or complaints, contact our Data Protection Officer at: privacy@laundrease.com or write to: Data Protection Officer, Laundrease Technologies Private Limited, Hinjewadi Phase 1, Pune, Maharashtra 411057, India."
    }
  ]'::jsonb
)
ON CONFLICT (code, version) DO UPDATE
  SET content = EXCLUDED.content,
      is_active = EXCLUDED.is_active,
      updated_at = NOW();

-- --------------------------------------------------------
-- CAREER JOB POSTINGS (Sample)
-- --------------------------------------------------------
INSERT INTO career_jobs (
  title, department, location, employment_type, experience_range,
  about_role, responsibilities, requirements, nice_to_have, benefits,
  jd_s3_key, hr_name, hr_email, email_subject_format, email_body_format,
  is_active, is_featured
) VALUES
(
  'Senior Full Stack Engineer',
  'Engineering',
  'Pune, Maharashtra (Hybrid)',
  'full_time',
  '3–6 years',
  'We are looking for a Senior Full Stack Engineer to join our core platform team. You will own critical parts of our customer-facing and partner-facing applications, shape our technical architecture, and mentor junior engineers.',
  '["Design, build, and maintain scalable web applications using Next.js and Node.js", "Own end-to-end features from DB schema to UI implementation", "Collaborate with product and design to ship high-quality user experiences", "Write clean, testable, and well-documented code", "Participate in code reviews and drive engineering best practices", "Identify and fix performance bottlenecks in the frontend and backend"]'::jsonb,
  '["3+ years of professional experience with React and Node.js", "Strong proficiency in TypeScript", "Experience with PostgreSQL and writing complex SQL queries", "Understanding of RESTful API design and security best practices", "Familiarity with cloud infrastructure (AWS, GCP, or Azure)", "Strong problem-solving skills and attention to detail"]'::jsonb,
  '["Experience with Next.js App Router", "Knowledge of database performance tuning and indexing", "Prior experience at a startup or high-growth company", "Contributions to open-source projects"]'::jsonb,
  '["Competitive salary + equity", "Flexible work-from-home policy", "Health insurance for you and your family", "Annual learning & development budget of ₹30,000", "Free Laundrease credits every month"]'::jsonb,
  'careers/jd-senior-fullstack-engineer.pdf',
  'Priya Sharma',
  'careers@laundrease.com',
  'Application for Senior Full Stack Engineer - {your_name}',
  'Hi Priya,\n\nI am writing to apply for the Senior Full Stack Engineer position at Laundrease.\n\nBriefly about me: {2-3 lines about yourself and your experience}\n\nI have attached my resume for your review. I look forward to hearing from you.\n\nBest regards,\n{your_name}\n{your_phone}',
  TRUE, TRUE
),
(
  'Growth Marketing Manager',
  'Marketing',
  'Pune, Maharashtra',
  'full_time',
  '2–5 years',
  'We are looking for a data-driven Growth Marketing Manager to own our customer acquisition and retention efforts. You will run experiments, manage performance marketing campaigns, and work closely with the product team to drive growth.',
  '["Own customer acquisition metrics across digital channels (Google, Meta, influencer)", "Design and run A/B tests to improve conversion rates at every funnel stage", "Manage and optimize paid campaigns with a focus on CAC and LTV", "Collaborate with content and design to create compelling campaign creatives", "Analyze user behaviour data and translate insights into actionable strategies", "Build and manage referral and loyalty programs"]'::jsonb,
  '["2+ years of experience in growth or performance marketing", "Proven track record of running successful paid campaigns on Google Ads and Meta", "Strong analytical skills — comfortable with Google Analytics, Mixpanel, or similar tools", "Experience with email marketing platforms (Mailchimp, Klaviyo, or similar)", "Excellent written communication skills"]'::jsonb,
  '["Experience marketing a consumer app or marketplace", "Familiarity with SQL for data analysis", "Knowledge of SEO and content marketing"]'::jsonb,
  '["Competitive salary + performance bonus", "Health insurance", "Flexible working hours", "Monthly Laundrease credits"]'::jsonb,
  'careers/jd-growth-marketing-manager.pdf',
  'Priya Sharma',
  'careers@laundrease.com',
  'Application for Growth Marketing Manager - {your_name}',
  'Hi Priya,\n\nI am writing to apply for the Growth Marketing Manager position at Laundrease.\n\nBriefly about me: {2-3 lines about yourself and your experience}\n\nI have attached my resume for your review. I look forward to hearing from you.\n\nBest regards,\n{your_name}\n{your_phone}',
  TRUE, FALSE
),
(
  'City Operations Manager',
  'Operations',
  'Pune, Maharashtra',
  'full_time',
  '3–5 years',
  'The City Operations Manager will be responsible for the day-to-day operational health of Laundrease in Pune. You will manage our network of laundry partners and delivery partners, ensure service quality, and drive operational efficiency.',
  '["Manage onboarding and quality compliance for laundry and delivery partners", "Monitor daily operational metrics and respond to service failures in real time", "Build processes that improve partner performance and reduce order defects", "Coordinate with support team to resolve escalated customer complaints", "Identify expansion opportunities and assist in launching new service areas", "Own partner training programs and quality audits"]'::jsonb,
  '["3+ years of experience in operations, logistics, or supply chain", "Strong analytical mindset — comfortable reading dashboards and making data-driven decisions", "Excellent communication and stakeholder management skills", "Experience managing vendor or partner relationships", "Ability to work in a fast-paced, ambiguous environment"]'::jsonb,
  '["Prior experience at a hyperlocal delivery or marketplace startup", "Familiarity with SQL or data tools", "Experience managing a field team"]'::jsonb,
  '["Competitive salary", "Performance-linked bonus", "Health insurance", "Travel allowance", "Monthly Laundrease credits"]'::jsonb,
  'careers/jd-city-operations-manager.pdf',
  'Priya Sharma',
  'careers@laundrease.com',
  'Application for City Operations Manager - {your_name}',
  'Hi Priya,\n\nI am writing to apply for the City Operations Manager position at Laundrease.\n\nBriefly about me: {2-3 lines about yourself and your experience}\n\nI have attached my resume for your review. I look forward to hearing from you.\n\nBest regards,\n{your_name}\n{your_phone}',
  TRUE, FALSE
),
(
  'Product Designer (UX/UI)',
  'Design',
  'Remote / Pune',
  'full_time',
  '2–4 years',
  'We are looking for a Product Designer who can translate complex user needs into clean, intuitive interfaces. You will own the design of key product flows and work closely with engineering and product management to ship polished experiences.',
  '["Own end-to-end design for key product flows — from user research to final UI specs", "Create wireframes, prototypes, and high-fidelity designs using Figma", "Conduct user research and usability testing to validate design decisions", "Collaborate closely with engineers to ensure accurate implementation", "Define and evolve our design system and component library", "Champion accessibility and inclusive design principles"]'::jsonb,
  '["2+ years of experience as a product or UX designer", "Strong portfolio demonstrating user-centred design thinking", "Proficiency in Figma", "Experience designing for mobile-first and responsive web applications", "Ability to communicate design rationale clearly"]'::jsonb,
  '["Motion design skills", "Experience with user research methodologies", "Prior experience designing for consumer apps or marketplaces", "Basic HTML/CSS knowledge"]'::jsonb,
  '["Competitive salary", "Remote-friendly", "Health insurance", "Design tool subscriptions covered", "Monthly Laundrease credits"]'::jsonb,
  'careers/jd-product-designer.pdf',
  'Priya Sharma',
  'careers@laundrease.com',
  'Application for Product Designer (UX/UI) - {your_name}',
  'Hi Priya,\n\nI am writing to apply for the Product Designer (UX/UI) position at Laundrease.\n\nBriefly about me: {2-3 lines about yourself and your experience}\n\nI have attached my portfolio link and resume for your review. I look forward to hearing from you.\n\nBest regards,\n{your_name}\n{your_phone}',
  TRUE, TRUE
)
ON CONFLICT DO NOTHING;
