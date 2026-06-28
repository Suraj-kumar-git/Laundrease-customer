// lib/payment/index.ts
import { query } from '@/lib/db'
import { safeDecrypt } from '@/lib/encryption'
import { RazorpayAdapter } from './razorpay'
import { CashfreeAdapter } from './cashfree'
import type { PaymentGatewayAdapter, GatewayConfig } from './types'
import { PayUAdapter } from './payu'

export * from './types'

export interface ActiveGatewayInfo {
  id: number
  adapter: PaymentGatewayAdapter
  codEnabled: boolean
  codMaxAmount: number
  provider: string
  sandbox: boolean
}

/**
 * Reads the active payment gateway from DB, decrypts keys, returns the correct adapter.
 * Returns null if no gateway is configured.
 *
 * Call this in API routes — do NOT cache between requests (admin may change config).
 */
export async function getActiveGateway(): Promise<ActiveGatewayInfo | null> {
  const result = await query(
    `SELECT id, provider, api_key_enc, api_secret_enc, webhook_secret_enc,
            config, cod_enabled, cod_max_order_amount
     FROM payment_gateway_config
     WHERE is_active = TRUE
     LIMIT 1`
  )

  if (result.rowCount === 0) return null

  const row = result.rows[0]
  const apiKey = safeDecrypt(row.api_key_enc)
  const apiSecret = safeDecrypt(row.api_secret_enc)

  if (!apiKey || !apiSecret) {
    console.error('[payment] Active gateway has missing or invalid API keys')
    return null
  }

  const config: GatewayConfig = {
    apiKey,
    apiSecret,
    webhookSecret: safeDecrypt(row.webhook_secret_enc),
    sandbox: row.config?.sandbox ?? true,
    currency: row.config?.currency ?? 'INR',
    extra: row.config ?? {},
  }

  if (row.provider === 'payu') {
    config.extra = {
      ...config.extra,
      successUrl: `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/payments/payu/success`,
      failureUrl: `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/payments/payu/failure`,
    }
  }
  
  let adapter: PaymentGatewayAdapter
  switch (row.provider) {
    case 'razorpay':
      adapter = new RazorpayAdapter(config)
      break
    case 'cashfree':
      adapter = new CashfreeAdapter(config)
      break
    case 'payu':
      adapter = new PayUAdapter(config)
      break
    default:
      console.error('[payment] Unknown gateway provider:', row.provider)
      return null
  }

  return {
  id: row.id,
  adapter,
  codEnabled: row.cod_enabled,
  codMaxAmount: parseFloat(row.cod_max_order_amount),
  provider: row.provider,
  sandbox: config.sandbox,
}
}

/**
 * Get just COD config without needing a full gateway (for displaying eligibility in UI).
 */
export async function getCodConfig(): Promise<{ enabled: boolean; maxAmount: number }> {
  try {
    const result = await query(
      `SELECT cod_enabled, cod_max_order_amount FROM payment_gateway_config LIMIT 1`
    )
    if (result.rowCount === 0) return { enabled: true, maxAmount: 5000 }
    return {
      enabled: result.rows[0].cod_enabled,
      maxAmount: parseFloat(result.rows[0].cod_max_order_amount),
    }
  } catch {
    return { enabled: true, maxAmount: 5000 }
  }
}
