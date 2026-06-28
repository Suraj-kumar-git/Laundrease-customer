// lib/support-routing.ts
// Auto-assignment of newly created support tickets to a team (support_groups),
// based on ticket category + who reported it. Sets assigned_group_id only —
// assigned_to is deliberately left NULL so the ticket lands in that team's
// shared "Group queue" (see app/api/support/dashboard/route.ts) and any
// member can claim it. No specific-agent auto-pick.

import { queryOne } from '@/lib/db'

const PARTNER_ROLES = new Set(['laundry', 'delivery'])

// Group names must match support_groups.name exactly (scripts/25-support-auth.sql
// + the 5th group added later: 'Tier 2 - Technical').
const GROUP_NAMES = {
  GENERAL:    'Tier 1 - General',
  BILLING:    'Tier 2 - Billing',
  TECH_TIER2: 'Tier 2 - Technical',
  TECH_TIER3: 'Tier 3 - Technical',
  OPERATIONS: 'Operations',
} as const

// Sub-categories that describe a damaged/lost/quality/mishandled item — these
// need the team that actually owns provider quality & fulfilment (Operations),
// not generic first-line triage, regardless of who reported it.
const QUALITY_ISSUE_KEYWORDS = [
  'damaged', 'lost', 'quality issue', 'wrong item', 'missing item', 'wrong items returned',
]

function isQualityOrDamageIssue(subCategory?: string | null): boolean {
  if (!subCategory) return false
  const s = subCategory.toLowerCase()
  return QUALITY_ISSUE_KEYWORDS.some(k => s.includes(k))
}

function resolveGroupName(category: string, reporterRole: string, subCategory?: string | null): string {
  const isPartner = PARTNER_ROLES.has(reporterRole)

  if (category === 'technical') return GROUP_NAMES.TECH_TIER2 // first line; escalate to Tier 3 manually
  if (category === 'wallet')    return GROUP_NAMES.BILLING    // refunds, payouts, billing disputes

  // order — a damaged/lost/quality complaint is an operational fulfilment
  // issue regardless of who reported it (customer or partner), so it skips
  // straight to Operations instead of sitting in generic Tier 1 triage.
  if (category === 'order' && isQualityOrDamageIssue(subCategory)) return GROUP_NAMES.OPERATIONS

  // account / coupon / other / remaining order sub-categories:
  // partner-reported (laundry/delivery) issues go to Operations,
  // everything else (customer and any other reporter) goes to General.
  return isPartner ? GROUP_NAMES.OPERATIONS : GROUP_NAMES.GENERAL
}

/**
 * Resolve which support_groups.id a newly-created ticket should auto-route to,
 * based on its category, sub-category, and the reporter's role. Returns null
 * (leaves the ticket unassigned) if the target group doesn't exist in this DB
 * yet — ticket creation should never fail because of a routing lookup miss.
 */
export async function getAutoAssignGroupId(
  category:     string,
  reporterRole: string,
  subCategory?: string | null
): Promise<number | null> {
  const groupName = resolveGroupName(category, reporterRole, subCategory)
  const group = await queryOne<{ id: number }>(
    `SELECT id FROM support_groups WHERE name = $1`,
    [groupName]
  )
  return group?.id ?? null
}
