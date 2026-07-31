// lib/subscription-invoice.ts
// Generate (or serve cached) a PDF invoice for a subscription payment.
// S3 key: laundry/subscriptions/invoices/{subId}/SUB-INV-{subId}.pdf
// Cached for the life of the subscription — never regenerated unless deleted.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { queryOne }           from '@/lib/db'
import { objectExists, uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'
import { SubscriptionInvoiceDocument, SubscriptionInvoiceData } from '@/lib/subscription-invoice-pdf'

const URL_TTL = 15 * 60 // 15 min

export async function getOrCreateSubscriptionInvoiceUrl(
  subscriptionId: number,
  providerId:     number
): Promise<{ url: string; cached: boolean } | null> {
  const row = await queryOne<{
    id:                        number
    plan_name:                 string
    plan_tagline:              string | null
    amount_paid:               string
    tax_amount:                string
    is_trial:                  boolean
    starts_at:                 string
    ends_at:                   string
    payment_transaction_id:    string | null
    payment_gateway:           string | null
    payment_gateway_order_id:  string | null
    created_at:                string
    effective_commission_type: string
    effective_commission_value:string
    business_name:             string
    user_email:                string
    user_phone:                string | null
    address_line1:             string | null
    city:                      string | null
    state:                     string | null
  }>(`
    SELECT
      lps.id,
      lsp.name                                                              AS plan_name,
      lsp.tagline                                                           AS plan_tagline,
      lps.amount_paid::TEXT,
      lps.tax_amount::TEXT,
      lps.is_trial,
      lps.starts_at::TEXT,
      lps.ends_at::TEXT,
      lps.payment_transaction_id,
      lps.payment_gateway,
      lps.payment_gateway_order_id,
      lps.created_at::TEXT,
      COALESCE(lps.commission_type_override,  lsp.commission_type)         AS effective_commission_type,
      COALESCE(lps.commission_value_override, lsp.commission_value)::TEXT  AS effective_commission_value,
      lp.business_name,
      u.email                                                               AS user_email,
      u.phone                                                               AS user_phone,
      lp.address_line1,
      lp.city,
      lp.state
    FROM laundry_provider_subscriptions lps
    JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
    JOIN laundry_profiles lp            ON lp.id  = lps.provider_id
    JOIN users u                        ON u.id   = lp.user_id
    WHERE lps.id = $1 AND lps.provider_id = $2
  `, [subscriptionId, providerId])

  if (!row) return null

  const invoiceNumber = `SUB-INV-${row.id}`
  const s3Key         = `laundry/subscriptions/invoices/${row.id}/${invoiceNumber}.pdf`

  if (await objectExists(s3Key)) {
    const url = await getSignedDownloadUrl(s3Key, { expiresIn: URL_TTL, disposition: 'attachment' })
    return { url, cached: true }
  }

  const addressParts = [row.address_line1, row.city, row.state].filter(Boolean)

  // taxAmount was snapshotted at checkout time (see subscription/checkout
  // route) — the effective rate is derived from it rather than looked up
  // live, so the invoice always reflects what was actually charged even if
  // the admin-configured rate changes later.
  const amountPaid = parseFloat(row.amount_paid)
  const taxAmount  = parseFloat(row.tax_amount || '0')
  const taxableAmount = Math.round((amountPaid - taxAmount) * 100) / 100
  const gstRate = taxableAmount > 0 ? Math.round((taxAmount / taxableAmount) * 100) : 0

  const data: SubscriptionInvoiceData = {
    invoiceNumber,
    invoiceDate:    row.created_at,
    planName:       row.plan_name,
    planTagline:    row.plan_tagline,
    amountPaid,
    isTrial:        row.is_trial,
    startsAt:       row.starts_at,
    endsAt:         row.ends_at,
    transactionId:  row.payment_transaction_id,
    gateway:        row.payment_gateway,
    gatewayOrderId: row.payment_gateway_order_id,
    providerName:   row.business_name,
    providerEmail:  row.user_email,
    providerPhone:  row.user_phone,
    providerAddress: addressParts.length ? addressParts.join(', ') : null,
    commissionType:  row.effective_commission_type,
    commissionValue: row.effective_commission_value,
    taxableAmount,
    taxAmount,
    gstRate,
  }

  const pdfBuffer = await renderToBuffer(
    React.createElement(SubscriptionInvoiceDocument, { data })
  )

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="${invoiceNumber}.pdf"`,
    metadata: { subscriptionId: String(row.id), providerId: String(providerId) },
  })

  const url = await getSignedDownloadUrl(s3Key, { expiresIn: URL_TTL, disposition: 'attachment' })
  return { url, cached: false }
}
