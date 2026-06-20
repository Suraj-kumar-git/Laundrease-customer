import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// GET /api/customer/wallet
// Auth required — returns balance + last 50 transactions

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    // Get or create wallet
    let walletResult = await query<{ id: number; balance: string; currency: string }>(
      `SELECT id, balance, currency FROM wallet_accounts
       WHERE user_id = $1 AND currency = 'INR'`,
      [userId]
    )

    if (walletResult.rowCount === 0) {
      walletResult = await query(
        `INSERT INTO wallet_accounts (user_id, currency, balance)
         VALUES ($1, 'INR', 0)
         RETURNING id, balance, currency`,
        [userId]
      )
    }

    const wallet = walletResult.rows[0]

    const txnsResult = await query(
      `SELECT id, kind, amount, reference, metadata, created_at
       FROM wallet_transactions
       WHERE wallet_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [wallet.id]
    )

    return successResponse({
      balance: Number(wallet.balance),
      currency: wallet.currency,
      transactions: txnsResult.rows.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: Number(t.amount),
        reference: t.reference,
        metadata: t.metadata,
        created_at: t.created_at,
      })),
    })
  } catch (error) {
    console.error('[GET /api/customer/wallet]', error)
    return serverErrorResponse('Failed to fetch wallet data')
  }
}
