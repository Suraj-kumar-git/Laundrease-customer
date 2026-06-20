// app/api/customer/wallet/balance/route.ts
// GET /api/customer/wallet/balance
// Returns wallet balance for the authenticated user.
// Lightweight — used by the checkout page to show wallet option.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    // Compute ledger-driven balance (authoritative)
    const result = await query(
      `SELECT
         COALESCE(get_wallet_balance($1), 0) AS balance,
         wa.id AS wallet_id,
         wa.currency
       FROM wallet_accounts wa
       WHERE wa.user_id = $1 AND wa.currency = 'INR'`,
      [userId]
    )

    if (result.rowCount === 0) {
      // No wallet yet — return zero balance (wallet will be auto-created on first credit)
      return successResponse({ balance: 0, wallet_id: null, has_wallet: false })
    }

    return successResponse({
      balance:    parseFloat(result.rows[0].balance),
      wallet_id:  result.rows[0].wallet_id,
      currency:   result.rows[0].currency,
      has_wallet: true,
    })
  } catch (error) {
    console.error('[GET /api/customer/wallet/balance]', error)
    return serverErrorResponse('Failed to fetch wallet balance')
  }
}
