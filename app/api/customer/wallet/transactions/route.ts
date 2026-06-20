// app/api/customer/wallet/transactions/route.ts
// GET — wallet balance + full transaction history

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const walletRes = await query(
      `SELECT id, balance, currency FROM wallet_accounts WHERE user_id = $1 AND currency = 'INR'`,
      [userId]
    )

    if (walletRes.rowCount === 0) {
      return successResponse({ balance: 0, currency: 'INR', transactions: [] })
    }

    const wallet = walletRes.rows[0]

    const txnRes = await query(
      `SELECT
         wt.id, wt.kind, wt.amount, wt.reference,
         wt.created_at, wt.metadata,
         o.order_number
       FROM wallet_transactions wt
       LEFT JOIN orders o ON o.id = wt.order_id
       WHERE wt.wallet_id = $1
       ORDER BY wt.created_at DESC
       LIMIT 50`,
      [wallet.id]
    )

    return successResponse({
      balance:      parseFloat(wallet.balance) || 0,
      currency:     wallet.currency,
      transactions: txnRes.rows.map(t => ({
        id:           t.id,
        kind:         t.kind,          // 'credit' | 'debit'
        amount:       parseFloat(t.amount),
        reference:    t.reference,
        order_number: t.order_number ?? null,
        metadata:     t.metadata,
        created_at:   t.created_at,
      })),
    })
  } catch (err) {
    console.error('[GET /api/customer/wallet/transactions]', err)
    return serverErrorResponse('Failed to fetch wallet transactions')
  }
}
