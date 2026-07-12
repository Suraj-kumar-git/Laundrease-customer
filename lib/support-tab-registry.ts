// lib/support-tab-registry.ts
// Canonical list of tabs an admin can grant to support groups (dynamic
// tab-permissions feature). Single source of truth for:
//   - the admin "Tab Permissions" config page (which tabs exist to grant)
//   - the support sidebar (which granted tabs to render, and where)
//   - server-side tab-access checks on support-scoped API routes
//
// Every admin nav item is eligible EXCEPT: Dashboard/Overview, Settings,
// Support Agents (manages support staff itself — governance risk), and
// Staff Payouts (other employees' salary/bank/PAN data). See app/admin/_config/nav.ts
// for the full admin nav this list mirrors.
//
// `builtForSupport: true` marks the 3 tabs that already have a working
// support-scoped page today (the pre-existing hardcoded Operations-lead-only
// tabs being folded into this system) — everything else needs its
// support-scoped page built out per-tab (see checklist Part A, task 10).

import {
  Users, ShoppingBag, Store, Bike, Building2, Ticket, ListChecks, CreditCard,
  Calendar, IndianRupee, ShieldCheck, ShieldAlert, PhoneCall, Tag, UserPlus,
  Award, Star, MessageSquare, FileText, Briefcase, MapPin, BarChart2, PieChart,
  Truck, HeadphonesIcon, BadgePercent, Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface GrantableTab {
  key:             string       // stable identifier — never changes even if label/route does
  label:           string
  group:           string       // matches an app/admin/_config/nav.ts NAV_GROUPS title
  icon:            LucideIcon
  adminHref:       string | null  // the admin route this mirrors; null for support-native tabs
  supportHref:     string         // route under /support this tab lives (or will live) at
  builtForSupport: boolean        // true = support-scoped page already exists
}

export const GRANTABLE_TABS: GrantableTab[] = [
  // ── Operations ──────────────────────────────────────────────────────────
  { key: 'users',                 label: 'Users',                 group: 'Operations', icon: Users,          adminHref: '/admin/users',                    supportHref: '/support/users',                    builtForSupport: false },
  { key: 'orders',                label: 'Orders',                group: 'Operations', icon: ShoppingBag,    adminHref: '/admin/orders',                   supportHref: '/support/orders',                   builtForSupport: true  },
  { key: 'providers',             label: 'Providers',             group: 'Operations', icon: Store,          adminHref: '/admin/providers',                supportHref: '/support/providers',                builtForSupport: false },
  { key: 'delivery',              label: 'Delivery',               group: 'Operations', icon: Bike,           adminHref: '/admin/delivery',                 supportHref: '/support/delivery',                 builtForSupport: false },
  { key: 'delivery-third-party',  label: '3rd Party Del.',        group: 'Operations', icon: Building2,      adminHref: '/admin/delivery/third-party',     supportHref: '/support/delivery/third-party',     builtForSupport: false },
  { key: 'admin-support-tickets', label: 'Support',               group: 'Operations', icon: Ticket,         adminHref: '/admin/support',                  supportHref: '/support/admin-tickets',            builtForSupport: false },
  { key: 'service-catalog',       label: 'Service Catalog',       group: 'Operations', icon: ListChecks,     adminHref: '/admin/service-catalog',          supportHref: '/support/service-catalog',          builtForSupport: false },
  { key: 'subscriptions',         label: 'Subscriptions',         group: 'Operations', icon: CreditCard,     adminHref: '/admin/subscription',             supportHref: '/support/subscriptions',            builtForSupport: false },
  { key: 'delivery-attendance',   label: 'Attendance',            group: 'Operations', icon: Calendar,       adminHref: '/admin/delivery/attendance',      supportHref: '/support/delivery/attendance',      builtForSupport: false },
  { key: 'delivery-payouts',      label: 'Payouts',               group: 'Operations', icon: IndianRupee,    adminHref: '/admin/delivery/payouts',         supportHref: '/support/delivery/payouts',         builtForSupport: false },
  { key: 'item-protection',       label: 'Item Protection',       group: 'Operations', icon: ShieldCheck,    adminHref: '/admin/item-protection',          supportHref: '/support/item-protection',          builtForSupport: false },
  { key: 'item-reports',          label: 'Item Reports',          group: 'Operations', icon: ShieldAlert,    adminHref: '/admin/claims',                   supportHref: '/support/claims',                   builtForSupport: true  },
  { key: 'quick-pickup-requests', label: 'Quick Pickup Requests', group: 'Operations', icon: PhoneCall,      adminHref: '/admin/quick-pickup-requests',    supportHref: '/support/quick-pickup-requests',    builtForSupport: false },
  { key: 'cash-ledger',           label: 'Cash Ledger',           group: 'Operations', icon: Wallet,         adminHref: null,                              supportHref: '/support/cash-ledger',              builtForSupport: true  },
  { key: 'sac-codes',             label: 'SAC Codes',             group: 'Operations', icon: Tag,            adminHref: null,                              supportHref: '/support/sac-codes',                builtForSupport: true  },

  // ── Marketing ───────────────────────────────────────────────────────────
  { key: 'coupons',               label: 'Coupons',               group: 'Marketing',  icon: Tag,            adminHref: '/admin/coupons',                  supportHref: '/support/coupons',                  builtForSupport: false },
  { key: 'referral',              label: 'Referral',               group: 'Marketing',  icon: UserPlus,       adminHref: '/admin/referral',                 supportHref: '/support/referral',                 builtForSupport: false },
  { key: 'loyalty',               label: 'Loyalty',                group: 'Marketing',  icon: Award,          adminHref: '/admin/loyalty',                  supportHref: '/support/loyalty',                  builtForSupport: false },

  // ── Content ─────────────────────────────────────────────────────────────
  { key: 'reviews',               label: 'Reviews',                group: 'Content',    icon: Star,           adminHref: '/admin/reviews',                  supportHref: '/support/reviews',                  builtForSupport: false },
  { key: 'testimonials',          label: 'Testimonials',           group: 'Content',    icon: MessageSquare,  adminHref: '/admin/testimonials',             supportHref: '/support/testimonials',             builtForSupport: false },
  { key: 'cms',                   label: 'CMS',                    group: 'Content',    icon: FileText,       adminHref: '/admin/cms',                      supportHref: '/support/cms',                      builtForSupport: false },
  { key: 'careers',               label: 'Careers',                group: 'Content',    icon: Briefcase,      adminHref: '/admin/careers',                  supportHref: '/support/careers',                  builtForSupport: false },
  { key: 'service-areas',         label: 'Service Areas',          group: 'Content',    icon: MapPin,         adminHref: '/admin/service-areas',            supportHref: '/support/service-areas',            builtForSupport: false },

  // ── Analytics ───────────────────────────────────────────────────────────
  { key: 'analytics-platform',    label: 'Platform',               group: 'Analytics',  icon: BarChart2,      adminHref: '/admin/analytics',                supportHref: '/support/analytics-platform',       builtForSupport: false },
  { key: 'analytics-users',       label: 'Users',                  group: 'Analytics',  icon: PieChart,       adminHref: '/admin/analytics/users',          supportHref: '/support/analytics-users',          builtForSupport: false },
  { key: 'analytics-providers',   label: 'Providers',              group: 'Analytics',  icon: Store,          adminHref: '/admin/analytics/providers',      supportHref: '/support/analytics-providers',      builtForSupport: false },
  { key: 'analytics-delivery',    label: 'Delivery',               group: 'Analytics',  icon: Truck,          adminHref: '/admin/analytics/delivery',       supportHref: '/support/analytics-delivery',       builtForSupport: false },
  { key: 'analytics-support',     label: 'Support',                group: 'Analytics',  icon: HeadphonesIcon, adminHref: '/admin/analytics/support',        supportHref: '/support/analytics-support',        builtForSupport: false },
  { key: 'analytics-coupons',     label: 'Coupons',                group: 'Analytics',  icon: BadgePercent,   adminHref: '/admin/analytics/coupons',        supportHref: '/support/analytics-coupons',        builtForSupport: false },
  { key: 'analytics-item-claims', label: 'Item Claims',            group: 'Analytics',  icon: ShieldCheck,    adminHref: '/admin/analytics/item-claims',    supportHref: '/support/analytics-item-claims',    builtForSupport: false },

  // ── Finance ─────────────────────────────────────────────────────────────
  { key: 'finance-overview',      label: 'Finance Overview',       group: 'Finance',    icon: IndianRupee,    adminHref: '/admin/finance-overview',         supportHref: '/support/finance-overview',         builtForSupport: false },
  { key: 'wallets',               label: 'Wallets',                 group: 'Finance',    icon: Wallet,         adminHref: '/admin/wallets',                  supportHref: '/support/wallets',                  builtForSupport: false },
  { key: 'cash-remittance',       label: 'Cash Remittance',        group: 'Finance',    icon: Wallet,         adminHref: '/admin/cash-remittance',          supportHref: '/support/cash-remittance',          builtForSupport: false },
  { key: 'laundry-payouts',       label: 'Laundry Payouts',        group: 'Finance',    icon: Wallet,         adminHref: '/admin/laundry/payouts',          supportHref: '/support/laundry-payouts',          builtForSupport: false },
]

export function getGrantableTab(key: string): GrantableTab | undefined {
  return GRANTABLE_TABS.find(t => t.key === key)
}

export const GRANTABLE_TAB_KEYS = GRANTABLE_TABS.map(t => t.key)
