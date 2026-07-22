// lib/support-routing.ts
// Auto-assignment of newly created support tickets to a team (support_groups),
// based on ticket category + who reported it. Sets assigned_group_id only —
// assigned_to is deliberately left NULL so the ticket lands in that team's
// shared "Group queue" (see app/api/support/dashboard/route.ts) and any
// member can claim it. No specific-agent auto-pick.
//
// Routing rules live in support_ticket_category_routing (admin-configurable,
// see scripts/39-support-ticket-category-routing.sql) instead of being
// hardcoded here. A rule matches when every non-NULL column on it is
// satisfied (NULL means "any"); sub_category_keyword is a case-insensitive
// substring match. When several rules match, the most specific one wins via
// a weighted score: category match = 100, sub_category_keyword match = 10,
// reporter_role match = 1 — ties broken by id ASC (earlier-seeded wins).

import { queryOne } from '@/lib/db'

/**
 * Resolve which support_groups.id a newly-created ticket should auto-route to,
 * based on its category, sub-category, and the reporter's role. Returns null
 * (leaves the ticket unassigned) if no rule matches — ticket creation should
 * never fail because of a routing lookup miss.
 */
export async function getAutoAssignGroupId(
  category:     string,
  reporterRole: string,
  subCategory?: string | null
): Promise<number | null> {
  const rule = await queryOne<{ group_id: number }>(
    `SELECT group_id
     FROM support_ticket_category_routing
     WHERE (category IS NULL OR category = $1)
       AND (reporter_role IS NULL OR reporter_role = $2)
       AND (sub_category_keyword IS NULL OR $3::text ILIKE '%' || sub_category_keyword || '%')
     ORDER BY
       (CASE WHEN category IS NOT NULL THEN 100 ELSE 0 END +
        CASE WHEN sub_category_keyword IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN reporter_role IS NOT NULL THEN 1 ELSE 0 END) DESC,
       id ASC
     LIMIT 1`,
    [category, reporterRole, subCategory ?? null]
  )
  return rule?.group_id ?? null
}
