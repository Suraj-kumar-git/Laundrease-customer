// lib/laundry-payslip.ts
// Renders a payslip PDF for a laundry provider's payout and uploads it to
// S3. Mirrors lib/delivery-payslip.ts — same PayslipDocument/PayslipData
// renderer, just sourced from provider_payouts + laundry_profiles instead
// of partner_monthly_payouts + delivery_profiles. Regenerated (overwritten
// at the same key) whenever the payout is calculated or its status
// changes, so the PDF always reflects the latest state.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { PayslipDocument, PayslipData } from '@/lib/payslip-pdf'
import { uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'

const URL_TTL = 15 * 60 // 15 minutes

export async function generateAndUploadLaundryPayslip(payoutId: number): Promise<string> {
  const payout = await queryOne<{
    id: number; period_start: string; period_end: string
    gross_order_amount: string; commission_rate: string; commission_type: string
    commission_amount: string; net_payable: string; order_count: number
    adjustments: string; adjustments_note: string | null
    status: string; payment_method: string | null; payment_reference: string | null; paid_at: string | null
    business_name: string; pan_number: string | null
    bank_account_number: string | null; bank_ifsc_code: string | null; bank_account_holder: string | null
  }>(
    `SELECT pp.id, pp.period_start::TEXT, pp.period_end::TEXT,
            pp.gross_order_amount::TEXT, pp.commission_rate::TEXT, pp.commission_type,
            pp.commission_amount::TEXT, pp.net_payable::TEXT, pp.order_count,
            pp.adjustments::TEXT, pp.adjustments_note,
            pp.status, pp.payment_method, pp.payment_reference, pp.paid_at::TEXT,
            lp.business_name, pp.pan_number,
            pp.bank_account_number, pp.bank_ifsc_code, pp.bank_account_holder
     FROM provider_payouts pp
     INNER JOIN laundry_profiles lp ON lp.id = pp.provider_id
     WHERE pp.id = $1`,
    [payoutId]
  )
  if (!payout) throw new Error('Payout not found')

  const breakdown =
    `Gross order amount: ₹${parseFloat(payout.gross_order_amount).toFixed(2)} (${payout.order_count} orders) · ` +
    `Commission (${payout.commission_rate}% ${payout.commission_type}): -₹${parseFloat(payout.commission_amount).toFixed(2)}` +
    (parseFloat(payout.adjustments) !== 0
      ? ` · Adjustments: ₹${parseFloat(payout.adjustments).toFixed(2)}${payout.adjustments_note ? ` (${payout.adjustments_note})` : ''}`
      : '')

  const data: PayslipData = {
    staffName: payout.business_name,
    role: 'laundry provider',
    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    amount: parseFloat(payout.net_payable),
    note: breakdown,
    status: payout.status,
    panNumber: payout.pan_number,
    bankAccountNumber: payout.bank_account_number,
    bankIfscCode: payout.bank_ifsc_code,
    bankAccountHolder: payout.bank_account_holder,
    paymentMethod: payout.status === 'paid' ? (payout.payment_method || 'Bank Transfer') : null,
    paymentReference: payout.payment_reference,
    paidAt: payout.paid_at,
    generatedAt: new Date().toISOString(),
  }

  const pdfBuffer = await renderToBuffer(React.createElement(PayslipDocument, { data }))
  const s3Key = `laundry-payslips/${payoutId}/payslip.pdf`

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="Payslip-${payout.business_name.replace(/[^a-zA-Z0-9]/g, '_')}-${payout.period_end}.pdf"`,
    metadata: { payoutId: String(payoutId) },
  })

  await query(`UPDATE provider_payouts SET payslip_s3_key = $1 WHERE id = $2`, [s3Key, payoutId])

  return s3Key
}

export async function getLaundryPayslipDownloadUrl(payoutId: number): Promise<string | null> {
  const payout = await queryOne<{ payslip_s3_key: string | null }>(
    `SELECT payslip_s3_key FROM provider_payouts WHERE id = $1`, [payoutId]
  )
  if (!payout?.payslip_s3_key) return null
  return getSignedDownloadUrl(payout.payslip_s3_key, { expiresIn: URL_TTL, disposition: 'attachment' })
}
