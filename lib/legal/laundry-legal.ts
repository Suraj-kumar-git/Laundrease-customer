// lib/legal/laundry-legal.ts
//
// Legal documents for laundry partners. Deliberately STATIC — unlike the
// customer-facing terms and privacy policy, which are served from the DB and
// editable by admins, these ship with the code.
//
// That difference is intentional. These describe commercial terms a partner
// agreed to at a point in time, so a change needs to be a reviewed, dated,
// version-bumped deploy rather than a text box someone edits at 11pm. The
// `version` and `effective_date` below are the record of that.
//
// Figures that operations can legitimately tune — commission rates, the item
// protection multiplier and cap, the claim window, payout cadence — are
// described here as mechanisms and NOT quoted as numbers. A policy document
// carrying a hardcoded figure that no longer matches the platform is worse
// than one that tells you where to look.

import type { LegalDocument } from '@/types/footer-pages'

export const VERSION = '1.0'
const EFFECTIVE_DATE = '2026-08-20'

export const LAUNDRY_TERMS: LegalDocument = {
  id: 0,
  code: 'terms_of_service',
  title: 'Laundry Partner Terms of Service',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: '1. Who These Terms Cover',
      body: 'These Terms govern your use of Laundrease as a laundry service partner. They are separate from, and in addition to, the terms that apply to customers. By completing registration, accepting orders, or accessing the partner dashboard, you agree to be bound by them. If you are registering on behalf of a business, you confirm you are authorised to bind that business.',
    },
    {
      heading: '2. Registration and Verification',
      body: 'Partner accounts are not self-activating. You complete registration in stages, and a Laundrease reviewer then verifies what you have submitted before your business becomes visible to customers.',
      subsections: [
        {
          heading: 'What you must provide',
          body: 'A verified email address and mobile number, your business address with service area and operating hours, a government-issued photo ID and PAN, a recent photograph for identity verification, at least two photographs of your facility, and bank account details for payouts. A GSTIN and a trade licence are optional unless your turnover or local law requires them.',
        },
        {
          heading: 'Review and activation',
          body: 'Your application moves through document review and a verification call before activation. You can follow its progress at any time from the registration status page. Until an administrator activates your account you cannot access the partner dashboard or receive orders — an incomplete or unverified account has no access, regardless of having signed in.',
        },
        {
          heading: 'Accuracy',
          body: 'You are responsible for the accuracy of everything you submit and for keeping it current. Documents that are rejected are returned to you with a reason so you can re-upload. Providing false or altered documents is grounds for immediate termination.',
        },
      ],
    },
    {
      heading: '3. Your Relationship With Laundrease',
      body: 'You operate an independent business. Nothing in these Terms creates employment, partnership, agency, or joint venture between you and Laundrease. You control your own premises, staff, equipment, and working methods, and you are responsible for your own taxes, licences, insurance, and statutory obligations. Laundrease provides the platform that connects you with customers and handles order flow, payments, and support.',
    },
    {
      heading: '4. Subscription and Commission',
      body: 'Access to the platform is offered on subscription plans. Each plan sets a monthly fee, a commission that applies to orders you fulfil, and any cap on order volume. The current plans, their prices, and the commission that applies to you are shown in the Subscription section of your dashboard, and the plan you hold at the time an order is confirmed is the one that applies to that order.',
      subsections: [
        {
          heading: 'Lapse and grace',
          body: 'If a subscription ends without renewal, your business stops appearing in customer search once any grace period configured for your plan has passed. Orders already in progress are unaffected and must still be completed. Renewing restores visibility.',
        },
        {
          heading: 'Changes to plans',
          body: 'Laundrease may change plan pricing or commission with reasonable notice. Changes do not apply retroactively to orders already confirmed.',
        },
      ],
    },
    {
      heading: '5. Pricing Your Services',
      body: 'Laundrease maintains a default price for each combination of garment type and service. You may override any of those prices for your own business, and you may set a higher struck-through reference price where you are offering a discount. Your prices apply only to your business and never affect another partner.',
      subsections: [
        {
          heading: 'Assisted pricing',
          body: 'If you ask us for help, a Laundrease administrator or support lead can set or adjust your pricing matrix on your behalf. Every assisted change is recorded against the individual who made it, you are notified when it happens, and you can change or clear it yourself at any time. We will not change your prices without your instruction.',
        },
        {
          heading: 'GST treatment',
          body: 'Whether your listed prices are treated as inclusive or exclusive of GST is your commercial decision and is controlled only by you, from your own dashboard. It cannot be changed on your behalf. Enabling GST-inclusive pricing requires a verified GSTIN on your account.',
        },
        {
          heading: 'Reference prices',
          body: 'A struck-through price must be a genuine former or standard price for that service. Displaying an inflated reference price to exaggerate a discount is prohibited and may breach consumer protection law.',
        },
      ],
    },
    {
      heading: '6. Orders and Service Standards',
      body: 'Orders reach you based on your service area, operating hours, capacity, and availability, all of which you control. Once you confirm an order you are committing to the turnaround you have advertised.',
      subsections: [
        {
          heading: 'Availability',
          body: 'Keep your operating hours, closed dates, and capacity current. Declining orders you are configured to receive, or repeatedly failing to meet advertised turnaround, affects your rating and may affect how often you are matched with customers.',
        },
        {
          heading: 'Quality',
          body: 'You are expected to maintain the standards agreed at onboarding, to be honest with customers about what you can and cannot handle, and to raise problems proactively rather than hoping they go unnoticed.',
        },
      ],
    },
    {
      heading: '7. Garment Condition, Item Reports and Liability',
      body: 'Where a delivery partner photographs a garment at pickup, those photographs are attached to the order and are visible to you when you review any later report about that item. Where no inspection was recorded, that absence is shown to you too — it is not presented as evidence that nothing was wrong.',
      subsections: [
        {
          heading: 'Reporting window',
          body: 'Customers may report a lost or damaged item for a limited period after delivery. The current window is set out in the Item Protection policy and is shown to customers when they report.',
        },
        {
          heading: 'Your decision',
          body: 'Reports concerning garments in your care are sent to you to approve or reject, with the pickup condition photographs where they exist. If you approve, liability for that item rests with you. If you reject, the report is escalated to Laundrease support for review, and we may still decide in the customer\'s favour on the evidence.',
        },
        {
          heading: 'Compensation and recovery',
          body: 'Compensation is calculated using the multiplier and per-item cap in the Item Protection policy in force at the time of the order. Amounts you are liable for are recovered from your payouts and shown as a line on the relevant payout.',
        },
      ],
    },
    {
      heading: '8. Payouts',
      body: 'You are paid for orders you have fulfilled, net of the commission on your plan and any amounts recovered under Section 7. Payouts are calculated in periods and a payslip is available in your dashboard for each one.',
      subsections: [
        {
          heading: 'When an order becomes payable',
          body: 'For orders paid online, by UPI, or from wallet balance, the order becomes payable on delivery. For cash-on-delivery orders, and for part-cash orders, it becomes payable only once the delivery partner has remitted that cash to Laundrease. Until the money reaches us we cannot pass it on, so a cash order delivered at the end of one period may appear in the next.',
        },
        {
          heading: 'Bank details',
          body: 'Payouts go to the verified bank account on your profile. You are responsible for keeping those details correct; payments that fail because of stale details are reissued once you have corrected them.',
        },
        {
          heading: 'Holds',
          body: 'A payout may be placed on hold while an item report, a payment dispute, or a suspected breach of these Terms is being investigated. We will tell you the reason.',
        },
      ],
    },
    {
      heading: '9. Tax and Invoicing',
      body: 'You are responsible for your own tax compliance. Where you have provided a GSTIN, it is verified before it takes effect on invoices, and SAC codes configured for each service appear on the customer invoice. Laundrease issues invoices on your behalf using the details on your account; keeping them accurate is your responsibility.',
    },
    {
      heading: '10. Contacting Customers',
      body: 'Where number masking is enabled, calls between you and a customer are connected through the platform and neither side sees the other\'s number. Those calls may be recorded, and both parties hear an announcement before the call connects.',
      subsections: [
        {
          heading: 'Staying on the platform',
          body: 'You must not solicit customers to transact outside Laundrease, ask for or share personal contact details for that purpose, or use contact information obtained through an order for marketing. Doing so is a material breach of these Terms.',
        },
        {
          heading: 'Customer data',
          body: 'Customer information reaches you only to the extent you need it to fulfil an order. You must not retain, copy, or use it for anything else, and you must not disclose it to third parties.',
        },
      ],
    },
    {
      heading: '11. Data Protection',
      body: 'How Laundrease collects, uses, stores, and shares information about you and your business is set out in the Laundry Partner Privacy Policy, which forms part of these Terms.',
    },
    {
      heading: '12. Suspension and Termination',
      body: 'You may stop using the platform at any time; orders already accepted must still be completed. Laundrease may suspend or terminate your account for breach of these Terms, falsified documents, repeated quality failures, conduct that endangers customers or delivery partners, off-platform solicitation, or where required by law.',
      subsections: [
        {
          heading: 'On termination',
          body: 'Amounts properly due to you for completed orders remain payable, net of any deductions under Section 7 and any outstanding subscription fees. Your business is removed from customer search immediately. Records we are required to keep are retained as described in the Privacy Policy.',
        },
      ],
    },
    {
      heading: '13. Changes to These Terms',
      body: 'These Terms are versioned and dated. Where a change materially affects your commercial position, we will notify you in the dashboard and by email before it takes effect. Continuing to accept orders after that date constitutes acceptance.',
    },
    {
      heading: '14. Governing Law and Disputes',
      body: 'These Terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the courts at Pune, Maharashtra. We ask that you raise any dispute with partner support first — most are resolved there.',
    },
    {
      heading: '15. Contact',
      body: 'For questions about these Terms, write to legal@laundrease.in. For day-to-day operational matters, raise a ticket from the Support section of your dashboard.',
    },
  ],
}

export const LAUNDRY_PRIVACY: LegalDocument = {
  id: 0,
  code: 'privacy_policy',
  title: 'Laundry Partner Privacy Policy',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: '1. Scope',
      body: 'This policy explains what information Laundrease holds about you as a laundry partner, why we hold it, who sees it, and how long we keep it. It covers your partner account and dashboard. Information about customers that passes through your account is covered separately in Section 6.',
    },
    {
      heading: '2. What We Collect',
      body: 'We collect only what registration, payment, and safety actually require.',
      subsections: [
        {
          heading: 'Identity and business details',
          body: 'Your name, business name, email address, mobile number, business address, service area, operating hours, capacity, business type, and years in business.',
        },
        {
          heading: 'Verification documents',
          body: 'Government-issued photo ID, PAN, an identity photograph, photographs of your facility, and where applicable your GSTIN and trade licence. These are stored to satisfy verification and statutory record-keeping obligations.',
        },
        {
          heading: 'Financial information',
          body: 'Bank account name, number, and IFSC for payouts, together with the payout and commission records generated by your activity on the platform.',
        },
        {
          heading: 'Operational records',
          body: 'Orders you have fulfilled, prices you have set, ratings and reviews customers leave, item reports and your decisions on them, and support tickets you raise.',
        },
        {
          heading: 'Technical data',
          body: 'Sign-in times, session information, and IP address, used to keep your account secure.',
        },
      ],
    },
    {
      heading: '3. Why We Use It',
      body: 'To verify that you are who you say you are and are entitled to operate; to route orders to you; to calculate and pay what you are owed; to issue tax-compliant invoices; to investigate item reports and disputes fairly; to provide support; to detect fraud and misuse; and to meet legal and regulatory obligations. We do not sell your information, and we do not use it for advertising.',
    },
    {
      heading: '4. Call Recordings',
      body: 'Where number masking is enabled, calls between you and a customer are connected through our telephony provider and may be recorded. Both parties hear an announcement before the call connects. Recordings exist for one purpose — to resolve disputes about what was agreed — and are accessible only to authorised Laundrease staff.',
      subsections: [
        {
          heading: 'Retention',
          body: 'A recording is deleted once the item-report window for that order has passed, unless a report is open on that order, in which case it is kept until that report is closed. Neither party\'s phone number is disclosed to the other at any point.',
        },
      ],
    },
    {
      heading: '5. Who We Share It With',
      body: 'Customers see your business name, address, service area, operating hours, ratings, and reviews — the information they need to choose a provider. They do not see your personal contact number, your documents, or your bank details.',
      subsections: [
        {
          heading: 'Service providers',
          body: 'We use third parties for payment processing, cloud storage, email and SMS delivery, and masked telephony. Each receives only what it needs to perform that function and is bound to protect it.',
        },
        {
          heading: 'Legal disclosure',
          body: 'We disclose information where the law requires it, to enforce our Terms, or to protect the safety of people using the platform.',
        },
      ],
    },
    {
      heading: '6. Customer Information You Receive',
      body: 'To fulfil an order you receive the customer\'s name and pickup and delivery addresses. Where masking is enabled you do not receive their phone number at all. You act as a processor of this information: use it only to fulfil the order, do not retain it beyond what your own records require, and never use it for marketing or share it onward.',
    },
    {
      heading: '7. How Long We Keep It',
      body: 'Verification documents and financial records are kept for the period required by tax and company law, which is longer than the life of your account. Operational records are kept while your account is active and for a reasonable period afterwards so that disputes and payouts can be settled. Call recordings follow the shorter schedule in Section 4. Records we no longer need are deleted.',
    },
    {
      heading: '8. Security',
      body: 'Documents are stored in access-controlled cloud storage and are served only through short-lived links to authorised staff. Passwords are stored hashed and never in readable form. Access to partner records inside Laundrease is limited by role, and sensitive actions are logged.',
    },
    {
      heading: '9. Your Rights',
      body: 'Under the Digital Personal Data Protection Act, 2023 you may ask for a copy of the personal data we hold about you, ask us to correct anything inaccurate, ask us to erase data we are no longer required to keep, and nominate someone to exercise these rights on your behalf. Write to privacy@laundrease.in and we will respond within the period the Act allows.',
    },
    {
      heading: '10. Grievances',
      body: 'If you are unhappy with how we have handled your information, contact our Grievance Officer at grievance@laundrease.in. If we cannot resolve it, you may escalate to the Data Protection Board of India.',
    },
    {
      heading: '11. Changes',
      body: 'This policy is versioned and dated. Material changes are notified in your dashboard and by email before they take effect.',
    },
  ],
}

export const LAUNDRY_COMMUNITY: LegalDocument = {
  id: 0,
  code: 'terms_of_service',
  title: 'Laundry Partner Community Guidelines',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: 'Why These Exist',
      body: 'Customers hand over their clothes to someone they have never met, and delivery partners walk into your premises every day. Both of those work because of trust rather than supervision. These guidelines set out what that trust requires of you. They sit alongside the Partner Terms of Service — the Terms are the contract, these are the conduct.',
    },
    {
      heading: 'Handling Garments',
      body: 'Treat every customer\'s garments the way you would want your own handled. Sort carefully, follow care labels, and use processes appropriate to the fabric. If an item arrives already damaged or stained, record it and flag it before processing rather than discovering the argument weeks later — the pickup photographs exist precisely so that pre-existing damage is not your problem.',
    },
    {
      heading: 'Being Honest About What You Can Do',
      body: 'If you cannot handle a fabric, a stain, or a turnaround, say so before accepting the order. Declining an order you cannot do well costs you one job. Accepting it and returning a ruined garment costs you a customer, a claim, and your rating.',
    },
    {
      heading: 'Communication',
      body: 'Respond to customer messages and support requests promptly. Silence is what turns a small problem into a complaint. When a delay or a problem occurs, tell the customer early — people forgive a delay they were warned about far more readily than one they discover.',
    },
    {
      heading: 'Ratings and Reviews',
      body: 'Reviews are how customers choose between partners, which only works if they are real. Do not ask customers to change or remove reviews, do not offer inducements for positive ratings, and do not create or solicit fake reviews. Respond to criticism by fixing the cause.',
    },
    {
      heading: 'Working With Delivery Partners',
      body: 'Delivery partners are colleagues, not couriers to be kept waiting. Have orders ready at the agreed time, keep the handover area accessible, and treat them with the same courtesy you would expect. Disputes about a handover should go to support, not into an argument at your counter.',
    },
    {
      heading: 'Staying on the Platform',
      body: 'Do not ask customers to book with you directly, hand out personal contact details for that purpose, or use an order to build a private customer list. Beyond breaching the Terms, it removes every protection the platform provides to both sides — masked contact, dispute resolution, item protection, and guaranteed payment.',
    },
    {
      heading: 'Respect and Non-Discrimination',
      body: 'Refusing service, or providing worse service, on the basis of religion, caste, gender, age, disability, or any other protected characteristic is prohibited and will end your partnership. The same applies to harassment or intimidation of customers, delivery partners, or Laundrease staff, in person or through any channel.',
    },
    {
      heading: 'Prohibited Items',
      body: 'If you find cash, jewellery, documents, or anything hazardous or illegal in a customer\'s laundry, do not process it. Report it to support immediately and follow the instructions you are given.',
    },
    {
      heading: 'When Something Goes Wrong',
      body: 'Report quality incidents and losses proactively. A partner who tells us they have damaged a garment is in a very different position from one we discover has damaged it. Concealment, not error, is what ends partnerships.',
    },
    {
      heading: 'Enforcement',
      body: 'Depending on severity we may issue a warning, reduce your visibility in customer search, hold a payout while we investigate, suspend your account, or terminate the partnership. Serious breaches — falsified documents, safety incidents, discrimination, sustained off-platform solicitation — can result in immediate termination without a prior warning.',
    },
    {
      heading: 'Reporting a Concern',
      body: 'If you see behaviour that breaches these guidelines, from anyone on the platform, raise a ticket from your dashboard or write to support@laundrease.in. Reports are treated confidentially.',
    },
  ],
}
