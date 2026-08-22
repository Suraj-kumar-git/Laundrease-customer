// lib/support-ticket-notify.ts
//
// Bell notification when a new ticket routes to a support group.
//
// Only that group's members are notified. A customer's order problem routed to
// Operations should not light up the bell of every agent on the platform —
// that is how a notification bell becomes something people stop looking at.
//
// FAN OUT AT INSERT, one row per member.
//
// support_notifications.user_id is NOT NULL: every row is addressed to exactly
// one person, and the bell reads WHERE user_id = $1. Writing a single
// group-addressed row would mean a nullable user_id, a group_id column, a
// migration, and a separate table to track who had read what. Fanning out
// needs none of that, and per-agent read state comes free — one agent
// dismissing the notification must not clear it for their colleagues.
//
// The cost is N rows per ticket rather than one. Support groups are small
// teams, so N is single digits, and it buys back the entire read-state problem.

import { query, queryOne } from '@/lib/db'

/**
 * Notify a group's members that a ticket has landed in their queue.
 *
 * Best-effort and never throws: a ticket that was successfully created must
 * not fail because the notification insert did. The caller has already
 * responded to the reporter by the time this runs.
 *
 * @param groupId  null when routing found no matching rule — see below.
 */
export async function notifySupportGroupOfNewTicket(params: {
  ticketId:     number | string
  ticketPublicId: string
  groupId:      number | null
  subject:      string
  reporterRole: string
  reporterName?: string | null
}): Promise<void> {
  const { ticketId, ticketPublicId, groupId, subject, reporterRole } = params

  const who = params.reporterName?.trim()
    ? `${params.reporterName.trim()} (${reporterRole})`
    : `A ${reporterRole}`

  const title = 'New ticket in your queue'
  const body  = `${who} raised: ${subject}`

  try {
    if (groupId != null) {
      // Every member of the routed group, whatever their role — an agent is
      // exactly who should be picking this up, not only the lead.
      await query(`
        INSERT INTO support_notifications (user_id, type, title, body, entity_id)
        SELECT sgm.user_id, 'new_ticket', $2, $3, $4
        FROM support_group_members sgm
        INNER JOIN users u ON u.id = sgm.user_id
        WHERE sgm.group_id = $1::INT
          AND u.status = 'active'
          AND u.deleted_at IS NULL
      `, [groupId, title, body, ticketPublicId])
      return
    }

    // No routing rule matched, so the ticket is sitting in no team's queue.
    //
    // Notifying nobody would be the literal reading of "notify the group", and
    // it is the wrong behaviour: an unrouted ticket is precisely the one at
    // risk of going unseen. Leads get it instead, since triaging an unrouted
    // ticket is a lead's job, and the wording says why they are seeing it.
    await query(`
      INSERT INTO support_notifications (user_id, type, title, body, entity_id)
      SELECT DISTINCT sgm.user_id, 'new_ticket_unrouted', $1, $2, $3
      FROM support_group_members sgm
      INNER JOIN users u ON u.id = sgm.user_id
      WHERE sgm.role = 'lead'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `, [
      'Unrouted ticket needs triage',
      `${who} raised: ${subject} — no routing rule matched, so it is in no team's queue.`,
      ticketPublicId,
    ])
  } catch (err) {
    console.error('[support-ticket-notify] failed for ticket', ticketId, (err as Error).message)
  }
}

/** The reporter's display name, for the notification body. */
export async function getReporterName(userId: string | number): Promise<string | null> {
  const row = await queryOne<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1::BIGINT`, [userId]
  )
  return row?.full_name ?? null
}
