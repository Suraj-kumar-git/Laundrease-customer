// lib/support-ticket-typing.ts
// Shared read/write for the "X is typing…" indicator — the one piece of the
// ticket-chat polling feature that's genuinely identical across every role
// (support/tickets, support/admin-tickets, customer/laundry/delivery
// support, admin support drawer). See scripts/49-support-ticket-typing.sql.
//
// No "stop typing" call exists — staleness is the signal. markTyping()
// upserts a fresh timestamp; getOtherTypers() only returns rows newer than
// TYPING_STALE_SECONDS. A closed tab or crashed client never leaves a stuck
// flag, and there's nothing to clean up.

import { query } from '@/lib/db'

const TYPING_STALE_SECONDS = 5

export async function markTyping(ticketId: number, userId: string): Promise<void> {
  await query(
    `INSERT INTO support_ticket_typing (ticket_id, user_id, started_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (ticket_id, user_id) DO UPDATE SET started_at = NOW()`,
    [ticketId, userId]
  )
}

export async function getOtherTypers(
  ticketId: number,
  viewerUserId: string
): Promise<Array<{ user_id: string; full_name: string }>> {
  const result = await query<{ user_id: string; full_name: string }>(
    `SELECT t.user_id::TEXT AS user_id, u.full_name
     FROM support_ticket_typing t
     INNER JOIN users u ON u.id = t.user_id
     WHERE t.ticket_id = $1
       AND t.user_id != $2::BIGINT
       AND t.started_at > NOW() - INTERVAL '${TYPING_STALE_SECONDS} seconds'`,
    [ticketId, viewerUserId]
  )
  return result.rows
}
