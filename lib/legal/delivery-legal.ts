// lib/legal/delivery-legal.ts
//
// Legal documents for delivery partners. Static by design — see the note at
// the top of lib/legal/laundry-legal.ts for why these ship with the code
// rather than coming from the database like the customer-facing ones.
//
// As there, tunable figures (the cash-in-hand cap, per-km rates, salary slabs,
// the concurrent-job limit, the item-report window) are described as
// mechanisms and pointed at the app, not quoted. Operations changes those
// values; a document that hardcodes them goes stale silently.

import type { LegalDocument } from '@/types/footer-pages'

export const VERSION = '1.0'
const EFFECTIVE_DATE = '2026-08-20'

export const DELIVERY_TERMS: LegalDocument = {
  id: 0,
  code: 'terms_of_service',
  title: 'Delivery Partner Terms of Service',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: '1. Who These Terms Cover',
      body: 'These Terms govern your use of Laundrease as a delivery partner. They are separate from the terms that apply to customers and to laundry partners. By completing onboarding, accepting a job, or accessing the partner app, you agree to be bound by them. You must be at least 18 years old.',
    },
    {
      heading: '2. Onboarding and Verification',
      body: 'Delivery partner accounts are not self-activating. You complete a series of onboarding steps and upload the required documents, and Laundrease then verifies them before your account is activated.',
      subsections: [
        {
          heading: 'What you must provide',
          body: 'A verified mobile number and email address, your vehicle type, model and registration number, your driving licence details, the area you will work in, bank account details for payment, and uploads of your driving licence (front and back), vehicle registration certificate, vehicle insurance, and Aadhaar.',
        },
        {
          heading: 'Background checks',
          body: 'Your account carries a background-check status. Laundrease may run or renew checks appropriate to the role, and may suspend your account if a check is not completed, expires, or returns a result inconsistent with the safety of customers and their property.',
        },
        {
          heading: 'Activation',
          body: 'Signing in does not grant access to the partner dashboard. Until every step is submitted and an administrator has verified and activated your account, you cannot accept or be assigned work. You can follow your progress at any time from the registration status page.',
        },
        {
          heading: 'Keeping documents valid',
          body: 'You must hold a valid driving licence, vehicle registration, and insurance for the whole time you are active, and you must upload renewals before the current ones expire. Working with a lapsed licence or lapsed insurance is a material breach and is entirely at your own risk.',
        },
      ],
    },
    {
      heading: '3. Your Relationship With Laundrease',
      body: 'You are an independent contractor. Nothing in these Terms creates employment, partnership, or agency. You provide your own vehicle, fuel, phone, and data, you decide when you make yourself available, and you are responsible for your own taxes, licences, and insurance. Laundrease provides the platform that offers you work and pays you for it.',
    },
    {
      heading: '4. Partner Types and Who Pays You',
      body: 'Not every delivery partner is paid by Laundrease, and it matters which you are.',
      subsections: [
        {
          heading: 'Independent partners',
          body: 'You work across the platform and Laundrease calculates and pays your earnings directly. The earnings figures in your app are yours.',
        },
        {
          heading: 'Provider-mapped partners',
          body: 'You are engaged by a specific laundry provider, who pays you under your own arrangement with them. Laundrease routes that provider\'s jobs to you but does not pay you, and does not show you platform earnings figures, because they would not be yours.',
        },
        {
          heading: 'Third-party partners',
          body: 'You are supplied through a delivery company Laundrease contracts with. That company pays you under its own terms. The same applies as above regarding earnings figures.',
        },
      ],
    },
    {
      heading: '5. How Work Reaches You',
      body: 'Jobs are either assigned to you automatically or made available for you to accept from a pool, based on your service area, your availability and shift status, approved leave, and how much work you already hold.',
      subsections: [
        {
          heading: 'Availability',
          body: 'You control your availability, shift status, and leave. Setting yourself available and then declining or abandoning work affects your rating and the volume you are offered.',
        },
        {
          heading: 'Concurrent jobs',
          body: 'The platform limits how many active jobs you may hold at once, so that accepted work actually gets done. The limit is enforced when you accept.',
        },
        {
          heading: 'Once accepted',
          body: 'Accepting a job is a commitment to complete it within the scheduled window. If you genuinely cannot, release it through the app as early as possible so it can be reassigned — do not simply let it lapse.',
        },
      ],
    },
    {
      heading: '6. Pickup and Delivery',
      body: 'Both ends of a job are confirmed by a one-time password from the customer. Do not ask for the OTP before you have actually collected or handed over the items, and never record or share it.',
      subsections: [
        {
          heading: 'Condition photographs at pickup',
          body: 'Where you find a garment that is already damaged or stained, photograph it in the app before collecting. Those photographs attach to the order and are shown to the laundry partner if the item is later reported. Recording pre-existing damage protects you and the provider; failing to record it means a later dispute has nothing to weigh.',
        },
        {
          heading: 'Care of items',
          body: 'Never open, inspect beyond what the app asks of you, or tamper with sealed packages. Keep items secure and dry in transit. If a customer is unavailable, follow the process in the app — never leave laundry unattended.',
        },
      ],
    },
    {
      heading: '7. Cash on Delivery',
      body: 'On cash orders you collect money on behalf of Laundrease. That cash is not yours at any point; you hold it in trust until you remit it.',
      subsections: [
        {
          heading: 'Collecting the right amount',
          body: 'The full amount due must be collected before the delivery OTP can be sent — the app will not let you complete a short collection. If a customer cannot give exact change, you may accept more than the amount due and the excess is credited automatically to their Laundrease wallet. Never hand back change from cash belonging to other orders.',
        },
        {
          heading: 'Cash-in-hand limit',
          body: 'There is a ceiling on how much uncollected cash you may hold. It counts both the cash you are physically holding and the cash you are already committed to collect on jobs you have accepted. Your current figure and remaining headroom are shown in the Cash section of your app.',
        },
        {
          heading: 'Reaching the limit',
          body: 'When you reach the ceiling, cash-on-delivery jobs stop being offered or assigned to you until you have remitted. Other work is unaffected. This is a cash-safety control and applies equally to everyone; it is not a penalty.',
        },
        {
          heading: 'Remitting',
          body: 'Remit collected cash at the designated centre. Your balance clears when Laundrease records the remittance. Failing to remit within a reasonable period, or any shortfall on remittance, is treated as a serious breach and may be recovered from your earnings and referred further.',
        },
      ],
    },
    {
      heading: '8. Earnings and Payouts',
      body: 'This section applies to independent partners paid by Laundrease. Earnings are calculated either per job with a distance component, or as a monthly slab, according to the model configured for you. Payouts are calculated in periods and a payslip showing the arithmetic — jobs completed, distance covered, applicable rate, and any adjustment — is available in your app.',
      subsections: [
        {
          heading: 'Adjustments and deductions',
          body: 'Incentives, corrections, and any amounts recoverable under these Terms appear as separate lines with a note, so you can always see why a figure differs from what you expected.',
        },
        {
          heading: 'Bank details',
          body: 'Payouts go to the bank account on your profile. Keeping those details accurate is your responsibility.',
        },
        {
          heading: 'Holds',
          body: 'A payout may be held while an unremitted cash balance, a loss, or a suspected breach is being investigated. You will be told the reason.',
        },
      ],
    },
    {
      heading: '9. Contacting Customers',
      body: 'Where number masking is enabled, calls between you and a customer are connected through the platform and neither side sees the other\'s number. Those calls may be recorded, and both parties hear an announcement first.',
      subsections: [
        {
          heading: 'Your number and theirs',
          body: 'Never share your personal number with a customer or ask for theirs, and never contact a customer outside the platform or after the job is finished. Contact details you encounter in the course of a job are for that job only.',
        },
      ],
    },
    {
      heading: '10. Safety and Conduct',
      body: 'Follow every traffic law. No delivery is worth an injury, and Laundrease would rather a job ran late. Do not use the app while riding. Do not work while under the influence of alcohol or drugs. Treat customers\' homes, buildings, and neighbours with respect, and treat laundry partners\' premises and staff the same way.',
    },
    {
      heading: '11. Loss, Damage and Liability',
      body: 'You are responsible for items in your custody between collection and handover. Where items are lost or damaged through your negligence, or where cash is unaccounted for, Laundrease may recover the amount from your earnings and, if necessary, pursue it by other means. Where the loss is not attributable to you — including pre-existing damage you photographed at pickup — you are not held liable.',
    },
    {
      heading: '12. Data Protection',
      body: 'How Laundrease collects, uses, stores, and shares information about you is set out in the Delivery Partner Privacy Policy, which forms part of these Terms.',
    },
    {
      heading: '13. Suspension and Termination',
      body: 'You may stop using the platform at any time; jobs already accepted must still be completed or properly released. Laundrease may suspend or terminate your account for breach of these Terms, expired or falsified documents, unremitted cash, safety incidents, tampering with customer property, off-platform contact, or where required by law.',
      subsections: [
        {
          heading: 'On termination',
          body: 'Earnings properly due to you remain payable, net of any unremitted cash and any amounts recoverable under Section 11. Any cash you are holding must be remitted immediately.',
        },
      ],
    },
    {
      heading: '14. Changes to These Terms',
      body: 'These Terms are versioned and dated. Where a change materially affects your earnings or obligations, we will notify you in the app and by email before it takes effect. Continuing to accept work after that date constitutes acceptance.',
    },
    {
      heading: '15. Governing Law and Disputes',
      body: 'These Terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of the courts at Pune, Maharashtra. Please raise any dispute with partner support first.',
    },
    {
      heading: '16. Contact',
      body: 'For questions about these Terms, write to legal@laundrease.in. For day-to-day matters, raise a ticket from the Support section of your app.',
    },
  ],
}

export const DELIVERY_PRIVACY: LegalDocument = {
  id: 0,
  code: 'privacy_policy',
  title: 'Delivery Partner Privacy Policy',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: '1. Scope',
      body: 'This policy explains what information Laundrease holds about you as a delivery partner, why we hold it, who sees it, and how long we keep it. Customer information that passes through your app is covered separately in Section 7.',
    },
    {
      heading: '2. What We Collect',
      body: 'We collect what onboarding, payment, and safety require, and no more.',
      subsections: [
        {
          heading: 'Identity and contact',
          body: 'Your name, mobile number, email address, and the city and area you work in.',
        },
        {
          heading: 'Verification documents',
          body: 'Driving licence (front and back), vehicle registration certificate, vehicle insurance, and Aadhaar, along with your background-check status. These satisfy verification, insurance, and statutory record-keeping obligations.',
        },
        {
          heading: 'Vehicle details',
          body: 'Vehicle type, model, and registration number.',
        },
        {
          heading: 'Financial information',
          body: 'Bank account details for payment, your earnings and payout records, and the cash ledger recording amounts you have collected on cash orders and remitted.',
        },
        {
          heading: 'Work records',
          body: 'Jobs assigned and completed, timings, availability and shift records, approved leave, attendance, ratings, condition photographs you take at pickup, and support tickets you raise.',
        },
        {
          heading: 'Technical data',
          body: 'Sign-in times, session information, device and IP address, used to keep your account secure.',
        },
      ],
    },
    {
      heading: '3. Location',
      body: 'Where the app uses your location, it is used to match you with nearby work, to calculate distance-based earnings, and to support the delivery in progress. We do not track you when you are off duty, and we do not sell or share location data for advertising.',
    },
    {
      heading: '4. Why We Use It',
      body: 'To verify your identity and entitlement to ride; to offer and assign work; to calculate and pay your earnings; to reconcile cash you have collected; to investigate incidents, losses, and disputes fairly; to provide support; to detect fraud; and to meet legal obligations. We do not sell your information and we do not use it for advertising.',
    },
    {
      heading: '5. Call Recordings',
      body: 'Where number masking is enabled, calls between you and a customer are connected through our telephony provider and may be recorded. Both parties hear an announcement before the call connects. Recordings are used only to resolve disputes and are accessible only to authorised Laundrease staff.',
      subsections: [
        {
          heading: 'Retention',
          body: 'A recording is deleted once the item-report window for that order has passed, unless a report is open on that order, in which case it is kept until that report is closed. Neither party\'s phone number is disclosed to the other at any point.',
        },
      ],
    },
    {
      heading: '6. Who We Share It With',
      body: 'Customers see your first name and, where relevant, your vehicle details — enough to identify who is at the door. They do not see your personal phone number, your documents, your address, or your earnings.',
      subsections: [
        {
          heading: 'Laundry partners',
          body: 'Providers whose orders you carry see your name and the job details needed for handover.',
        },
        {
          heading: 'Your employer, where applicable',
          body: 'If you are a third-party or provider-mapped partner, the company or provider that engages you receives the work records they need to pay and manage you.',
        },
        {
          heading: 'Service providers',
          body: 'We use third parties for payments, cloud storage, email and SMS, background checks, and masked telephony. Each receives only what it needs and is bound to protect it.',
        },
        {
          heading: 'Legal disclosure',
          body: 'We disclose information where the law requires it, to enforce our Terms, or to protect the safety of people using the platform.',
        },
      ],
    },
    {
      heading: '7. Customer Information You Receive',
      body: 'To complete a job you receive the customer\'s name and the pickup or delivery address. Where masking is enabled you do not receive their phone number at all. This information is for that job only: do not save it, photograph it, share it, or contact the customer afterwards.',
    },
    {
      heading: '8. How Long We Keep It',
      body: 'Verification documents and financial records are kept for the period required by tax, insurance, and company law, which outlasts your account. Work records are kept while you are active and for a reasonable period afterwards so that payments, cash reconciliation, and disputes can be settled. Condition photographs are kept while the related order can still be disputed. Call recordings follow the shorter schedule in Section 5.',
    },
    {
      heading: '9. Security',
      body: 'Documents and photographs are stored in access-controlled cloud storage and served only through short-lived links to authorised staff. Passwords are stored hashed and never in readable form. Access to partner records inside Laundrease is limited by role, and sensitive actions are logged.',
    },
    {
      heading: '10. Your Rights',
      body: 'Under the Digital Personal Data Protection Act, 2023 you may ask for a copy of the personal data we hold about you, ask us to correct anything inaccurate, ask us to erase data we are no longer required to keep, and nominate someone to exercise these rights for you. Write to privacy@laundrease.in and we will respond within the period the Act allows.',
    },
    {
      heading: '11. Grievances',
      body: 'If you are unhappy with how we have handled your information, contact our Grievance Officer at grievance@laundrease.in. If we cannot resolve it, you may escalate to the Data Protection Board of India.',
    },
    {
      heading: '12. Changes',
      body: 'This policy is versioned and dated. Material changes are notified in the app and by email before they take effect.',
    },
  ],
}

export const DELIVERY_COMMUNITY: LegalDocument = {
  id: 0,
  code: 'terms_of_service',
  title: 'Delivery Partner Community Guidelines',
  version: VERSION,
  effective_date: EFFECTIVE_DATE,
  updated_at: EFFECTIVE_DATE,
  content: [
    {
      heading: 'Why These Exist',
      body: 'You are the only person on the platform a customer actually meets. Whatever the app does well, their impression of Laundrease is formed at their door, by you. These guidelines set out what that responsibility involves. They sit alongside the Partner Terms of Service — the Terms are the contract, these are the conduct.',
    },
    {
      heading: 'Ride Safely',
      body: 'Follow every traffic law, wear your helmet, and do not use the app while moving. No delivery is worth your life or anyone else\'s, and we would far rather a job ran late than that you took a risk to save ten minutes. Never work while under the influence of alcohol or drugs.',
    },
    {
      heading: 'At the Customer\'s Door',
      body: 'Be punctual, be polite, and be brief. Respect homes, lobbies, lifts, and neighbours. Do not smoke near a customer\'s doorway, do not enter a home unless invited, and do not photograph anything beyond what the app asks you to. If a customer is not available, follow the process in the app rather than improvising.',
    },
    {
      heading: 'Handling Laundry',
      body: 'Never open, unpack, or tamper with a sealed package. Keep items dry, secure, and off the ground. Photograph pre-existing damage at pickup — it takes seconds, and it is the only thing standing between you and a later accusation. If something is spilled, torn, or lost in your custody, report it immediately; concealment is what ends partnerships, not honest mistakes.',
    },
    {
      heading: 'Handling Cash',
      body: 'Cash you collect belongs to Laundrease from the moment it is in your hand. Collect the full amount, never a rupee short. Remit promptly rather than letting a balance build. Do not mix platform cash with your own, and never use it, even briefly, expecting to make it up later — that is not a shortfall, it is a breach of trust.',
    },
    {
      heading: 'Contact Stays on the Platform',
      body: 'Use the in-app calling system. Never give a customer your personal number, never ask for theirs, and never contact them once the job is done. Contact details you see during a job are for that job alone.',
    },
    {
      heading: 'Reliability',
      body: 'Set yourself available when you intend to work, and take leave through the app when you do not. Accepting jobs and then abandoning them leaves a customer waiting and a provider holding a bag nobody is coming for. If you genuinely cannot complete a job, release it early so someone else can.',
    },
    {
      heading: 'Working With Laundry Partners',
      body: 'Providers are colleagues. Arrive within the window, be patient if an order is not quite ready, and keep handovers courteous. If there is a disagreement about a handover, take it to support rather than arguing it out at their counter.',
    },
    {
      heading: 'Respect and Non-Discrimination',
      body: 'Refusing or degrading service on the basis of religion, caste, gender, age, disability, or any other protected characteristic is prohibited and will end your partnership. The same applies to harassment or intimidation of customers, providers, or Laundrease staff, whether in person, on a call, or through any other channel. Photographing or commenting on a customer\'s home, appearance, or personal life is never acceptable.',
    },
    {
      heading: 'Your Documents',
      body: 'Keep your licence, registration, and insurance valid and current in the app. Riding on an expired licence or without insurance puts you, the customer\'s property, and your partnership at risk, and no earnings are worth that exposure.',
    },
    {
      heading: 'Enforcement',
      body: 'Depending on severity we may issue a warning, reduce the work offered to you, hold a payout while we investigate, suspend your account, or terminate the partnership. Serious breaches — safety incidents, tampering with customer property, discrimination, unremitted cash, falsified documents — can result in immediate termination without a prior warning.',
    },
    {
      heading: 'Reporting a Concern',
      body: 'If you are made to feel unsafe, or you see behaviour that breaches these guidelines from anyone on the platform, raise a ticket from your app or write to support@laundrease.in. Reports are treated confidentially, and reporting in good faith will never count against you.',
    },
  ],
}
