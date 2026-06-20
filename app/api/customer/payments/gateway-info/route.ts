import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(_req: NextRequest) {
  try {
    const result = await query(
      `SELECT provider, cod_enabled, cod_max_order_amount, config, is_active
       FROM payment_gateway_config WHERE is_active = TRUE
       LIMIT 1`
    )

    if (result.rowCount === 0) {
      return successResponse({
        gateway_configured: false,
        provider: null,
        cod_enabled: true,
        cod_max_amount: 5000,
      })
    }

    const row = result.rows[0]
    return successResponse({
      gateway_configured: true,
      provider: row.provider,
      cod_enabled: row.cod_enabled,
      cod_max_amount: Number(row.cod_max_order_amount),
      sandbox: row.config?.sandbox ?? true,
    })
  } catch (error) {
    console.error('[GET /api/customer/payments/gateway-info]', error)
    return serverErrorResponse('Failed to fetch gateway info')
  }
}
