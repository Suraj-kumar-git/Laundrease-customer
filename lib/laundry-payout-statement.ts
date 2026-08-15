// lib/laundry-payout-statement.ts
// Assembles PayoutStatementData from provider_payouts + provider_payout_orders
// and renders/uploads the itemized statement PDF (lib/laundry-payout-pdf.tsx).
// Replaces lib/laundry-payslip.ts as the generator called from the calculate
// and mark-paid routes — same "regenerate at a fixed key, overwrite on every
// call" pattern (no objectExists caching: unlike a customer invoice, a
// payout's contents legitimately change across recalculations and status
// transitions, so there is nothing to cache).

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { PayoutStatementDocument, PayoutStatementData, PayoutStatementOrderRow } from '@/lib/laundry-payout-pdf'
import { uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'

const URL_TTL = 15 * 60 // 15 minutes

export async function generateAndUploadLaundryPayoutStatement(payoutId: number): Promise<string> {
  const payout = await queryOne<{
    id: number; period_start: string; period_end: string
    gross_order_amount: string; commission_rate: string; commission_type: string
    commission_amount: string; net_payable: string; order_count: number
    adjustments: string; adjustments_note: string | null
    status: string; payment_method: string | null; payment_reference: string | null; paid_at: string | null
    business_name: string; pan_number: string | null
    bank_account_number: string | null; bank_ifsc_code: string | null
    bank_account_holder: string | null; upi_id: string | null
  }>(
    `SELECT pp.id, pp.period_start::TEXT, pp.period_end::TEXT,
            pp.gross_order_amount::TEXT, pp.commission_rate::TEXT, pp.commission_type,
            pp.commission_amount::TEXT, pp.net_payable::TEXT, pp.order_count,
            pp.adjustments::TEXT, pp.adjustments_note,
            pp.status, pp.payment_method, pp.payment_reference, pp.paid_at::TEXT,
            lp.business_name, pp.pan_number,
            pp.bank_account_number, pp.bank_ifsc_code, pp.bank_account_holder, pp.upi_id
     FROM provider_payouts pp
     INNER JOIN laundry_profiles lp ON lp.id = pp.provider_id
     WHERE pp.id = $1`,
    [payoutId]
  )
  if (!payout) throw new Error('Payout not found')

  const ordersRes = await query<{
    order_number: string; delivered_at: string
    subtotal: string; tax_amount: string
    commission_deducted: string; delivery_fee_included: string; claim_deduction: string
    order_amount: string; payment_method: string
  }>(
    `SELECT o.order_number, o.delivered_at::TEXT,
            o.subtotal::TEXT, o.tax_amount::TEXT,
            ppo.commission_deducted::TEXT, ppo.delivery_fee_included::TEXT, ppo.claim_deduction::TEXT,
            ppo.order_amount::TEXT, o.payment_method
     FROM provider_payout_orders ppo
     INNER JOIN orders o ON o.id = ppo.order_id
     WHERE ppo.payout_id = $1
     ORDER BY o.delivered_at ASC`,
    [payoutId]
  )

  const orders: PayoutStatementOrderRow[] = ordersRes.rows.map(r => ({
    orderNumber:        r.order_number,
    deliveredAt:        r.delivered_at,
    subtotal:           parseFloat(r.subtotal),
    taxAmount:          parseFloat(r.tax_amount),
    deliveryFeeIncluded: parseFloat(r.delivery_fee_included),
    commissionDeducted:  parseFloat(r.commission_deducted),
    claimDeduction:      parseFloat(r.claim_deduction),
    orderAmount:         parseFloat(r.order_amount),
    paymentMethod:       r.payment_method,
  }))

  const data: PayoutStatementData = {
    useLogo: true,
    businessName: payout.business_name,
    panNumber: payout.pan_number,
    bankAccountNumber: payout.bank_account_number,
    bankIfscCode: payout.bank_ifsc_code,
    bankAccountHolder: payout.bank_account_holder,
    upiId: payout.upi_id,

    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    status: payout.status,
    paymentMethod: payout.status === 'paid' ? (payout.payment_method || 'Bank Transfer') : null,
    paymentReference: payout.payment_reference,
    paidAt: payout.paid_at,

    orders,

    grossOrderAmount: parseFloat(payout.gross_order_amount),
    commissionAmount: parseFloat(payout.commission_amount),
    commissionRate:   parseFloat(payout.commission_rate),
    commissionType:   payout.commission_type as 'percent' | 'flat',
    claimDeduction:   parseFloat(payout.adjustments),
    claimNote:        payout.adjustments_note,
    netPayable:       parseFloat(payout.net_payable),

    generatedAt: new Date().toISOString(),
  }

  const pdfBuffer = await renderToBuffer(React.createElement(PayoutStatementDocument, { data }))
  const s3Key = `laundry-payouts/${payoutId}/statement.pdf`

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="Payout-${payout.business_name.replace(/[^a-zA-Z0-9]/g, '_')}-${payout.period_end}.pdf"`,
    metadata: { payoutId: String(payoutId) },
  })

  await query(`UPDATE provider_payouts SET payslip_s3_key = $1 WHERE id = $2`, [s3Key, payoutId])

  return s3Key
}

export async function getLaundryPayoutStatementDownloadUrl(payoutId: number): Promise<string | null> {
  const payout = await queryOne<{ payslip_s3_key: string | null }>(
    `SELECT payslip_s3_key FROM provider_payouts WHERE id = $1`, [payoutId]
  )
  if (!payout?.payslip_s3_key) return null
  return getSignedDownloadUrl(payout.payslip_s3_key, { expiresIn: URL_TTL, disposition: 'attachment' })
}
