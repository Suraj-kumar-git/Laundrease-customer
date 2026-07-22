// lib/support-tab-access.ts
// Resolves which admin-granted tabs (see lib/support-tab-registry.ts) a
// support agent can access, and at what level, based on their group
// memberships and the admin-configured support_tab_grants table.
//
// A grant is keyed by (group_id, role, tab_key) — an 'agent' grant means
// read-only access, a 'lead' grant means read+write. A user's resolved
// access is the union across every group they belong to; if the same tab
// is granted at both levels (e.g. via two different group memberships),
// write wins.
//
// This does NOT cover the support persona's always-on default tabs
// (Dashboard, Tickets, Profile, Analytics-for-any-lead) — those remain a
// simple hardcoded rule in app/support/_config/nav.ts. This resolver only
// covers tabs listed in lib/support-tab-registry.ts.

import { query } from '@/lib/db'

export type TabAccessLevel = 'read' | 'write'

export async function getSupportTabAccess(
  userId: string | number
): Promise<Record<string, TabAccessLevel>> {
  const result = await query<{ tab_key: string; role: string }>(
    `SELECT DISTINCT stg.tab_key, stg.role
     FROM support_group_members sgm
     INNER JOIN support_tab_grants stg
       ON stg.group_id = sgm.group_id AND stg.role = sgm.role
     WHERE sgm.user_id = $1::BIGINT`,
    [userId]
  )

  const access: Record<string, TabAccessLevel> = {}
  for (const row of result.rows) {
    const level: TabAccessLevel = row.role === 'lead' ? 'write' : 'read'
    if (access[row.tab_key] !== 'write') {
      access[row.tab_key] = level
    }
  }
  return access
}

/** Convenience single-tab check — used by per-tab API route guards. */
export async function getTabAccessLevel(
  userId: string | number,
  tabKey: string
): Promise<TabAccessLevel | null> {
  const access = await getSupportTabAccess(userId)
  return access[tabKey] ?? null
}
