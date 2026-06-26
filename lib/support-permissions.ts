// lib/support-permissions.ts
// Group-scoped access control for support agents acting on a ticket.
//
// Rules (confirmed with product owner):
// - A ticket "belongs" to whichever group is in assigned_group_id (set at
//   creation by lib/support-routing.ts, or moved later by a lead).
// - Any member of that group (role 'agent' or 'lead') — OR whoever the
//   ticket is currently assigned_to, even if their own group membership
//   later changes — can view/comment/update status+priority/reassign
//   assigned_to to another member of the SAME group.
// - Only a 'lead' of the ticket's CURRENT group may move it to a different
//   group (assigned_group_id change) — that's an escalation/transfer, a
//   bigger structural action than a same-team hand-off.
// - An agent with no relationship to the ticket (not a group member, not
//   the assignee) has no access at all.
// - A ticket with assigned_group_id IS NULL (legacy/orphaned — shouldn't
//   happen for new tickets now that auto-routing always sets a group) is
//   treated as claimable by any agent, so nothing gets permanently stuck.
// - Admins are unaffected — they use a completely separate route
//   (app/api/admin/support/[id]/route.ts) with no group restriction.

import { queryOne } from '@/lib/db'

export interface TicketAccess {
  allowed: boolean
  isLead:  boolean   // true if the acting agent is a 'lead' in the ticket's current group
}

interface TicketGroupInfo {
  assigned_to:       string | null
  assigned_group_id: number | null
}

export async function getTicketAccess(
  userId: string,
  ticket: TicketGroupInfo
): Promise<TicketAccess> {
  if (ticket.assigned_group_id == null) {
    // Orphaned ticket — anyone can pick it up (and effectively "lead" it,
    // since claiming it into a group is itself the escalation action).
    return { allowed: true, isLead: true }
  }

  if (ticket.assigned_to != null && String(ticket.assigned_to) === String(userId)) {
    // The assignee always has access, even outside their other group memberships.
    const membership = await queryOne<{ role: string }>(
      `SELECT role FROM support_group_members WHERE user_id = $1::BIGINT AND group_id = $2`,
      [userId, ticket.assigned_group_id]
    )
    return { allowed: true, isLead: membership?.role === 'lead' }
  }

  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM support_group_members WHERE user_id = $1::BIGINT AND group_id = $2`,
    [userId, ticket.assigned_group_id]
  )
  if (!membership) return { allowed: false, isLead: false }

  return { allowed: true, isLead: membership.role === 'lead' }
}

/** Is this user a member (any role) of the given group? Used to validate assigned_to targets. */
export async function isGroupMember(userId: string, groupId: number): Promise<boolean> {
  const row = await queryOne(
    `SELECT 1 FROM support_group_members WHERE user_id = $1::BIGINT AND group_id = $2`,
    [userId, groupId]
  )
  return !!row
}
