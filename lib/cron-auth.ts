// lib/cron-auth.ts
//
// Authenticating Vercel Cron invocations.
//
// Vercel calls cron paths over the public internet, so they are reachable by
// anyone who knows the URL. When CRON_SECRET is set in the project's
// environment, Vercel attaches `Authorization: Bearer <CRON_SECRET>` to every
// cron request — checking it is what separates the scheduler from a stranger.
//
// These endpoints delete recordings and spend money on provider API calls, so
// an unauthenticated one is not a small problem.

import crypto from 'crypto'
import type { NextRequest } from 'next/server'

export function isVercelCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  // Fails closed. An unset secret means the endpoint is wide open, and the
  // safe reading of "not configured" is "not allowed" rather than "allow all".
  if (!expected) {
    console.error('[cron] CRON_SECRET is not set — refusing to run scheduled work')
    return false
  }

  const header = req.headers.get('authorization') ?? ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return false

  // Hashed to a fixed width so timingSafeEqual can't throw on a length
  // mismatch, and so the comparison doesn't leak the secret's length.
  const a = crypto.createHash('sha256').update(token).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

/**
 * Who may run a maintenance sweep by hand, as well as on a schedule.
 *
 * Three callers, and all three are legitimate:
 *   - Vercel Cron, on its timer
 *   - an admin, from the "Run now" button
 *   - a support LEAD holding the relevant tab — the whole point of the tab
 *     model is that operations can act without waiting for an admin, and a
 *     backlog of stuck orders at 9am is exactly when nobody wants to be
 *     hunting for someone with the admin password
 *
 * Agents with read access are deliberately excluded: these sweeps mutate
 * orders and subscriptions, so they need the same 'write' grant as any other
 * change.
 */
export async function authorizeSweep(
  req: NextRequest,
  tabKey: string
): Promise<{ allowed: boolean; via: 'cron' | 'admin' | 'support-lead' | null }> {
  if (isVercelCron(req)) return { allowed: true, via: 'cron' }

  // Imported lazily so the cron path never pulls in the auth/DB stack it
  // doesn't need.
  const { requireRole } = await import('@/lib/auth')

  try {
    await requireRole('admin', req)
    return { allowed: true, via: 'admin' }
  } catch { /* not an admin — try support below */ }

  try {
    const userId = await requireRole('support', req)
    const { getTabAccessLevel } = await import('@/lib/support-tab-access')
    if ((await getTabAccessLevel(userId, tabKey)) === 'write') {
      return { allowed: true, via: 'support-lead' }
    }
  } catch { /* not support either */ }

  return { allowed: false, via: null }
}

/**
 * Stop before the platform does.
 *
 * A cron function killed mid-run leaves no record of how far it got. Every job
 * here is resumable — the next run picks up what's left — so the right
 * behaviour is to finish the current item, report, and exit cleanly.
 */
export function timeBudget(maxMs: number) {
  const startedAt = Date.now()
  return {
    exhausted: () => Date.now() - startedAt > maxMs,
    elapsedMs: () => Date.now() - startedAt,
  }
}
