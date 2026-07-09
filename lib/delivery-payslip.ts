// lib/delivery-payslip.ts
// Renders a payslip PDF for a delivery partner's monthly payout and uploads
// it to S3. Reuses the same PayslipDocument/PayslipData renderer as
// lib/staff-payslip.ts (admin/support staff) — just sourced from
// partner_monthly_payouts + delivery_profiles instead of staff_payouts.
// Regenerated (overwritten at the same key) whenever the payout is
// calculated or its status changes, so the PDF always reflects the latest
// counts/status.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { PayslipDocument, PayslipData } from '@/lib/payslip-pdf'
import { uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'

const URL_TTL = 15 * 60 // 15 minutes

export async function generateAndUploadDeliveryPayslip(payoutId: number): Promise<string> {
  const payout = await queryOne<{
    id: number; period_start: string; period_end: string
    pickup_count: number; delivery_count: number
    pickup_salary: string; delivery_salary: string; total_salary: string
    adjustments: string; adjustments_note: string | null
    status: string; payment_reference: string | null; paid_at: string | null
    full_name: string; pan_number: string | null
    bank_account_number: string | null; bank_ifsc_code: string | null
    bank_account_holder_name: string | null
  }>(
    `SELECT pmp.id, pmp.period_start::TEXT, pmp.period_end::TEXT,
            pmp.pickup_count, pmp.delivery_count,
            pmp.pickup_salary::TEXT, pmp.delivery_salary::TEXT, pmp.total_salary::TEXT,
            pmp.adjustments::TEXT, pmp.adjustments_note,
            pmp.status, pmp.payment_reference, pmp.paid_at::TEXT,
            u.full_name, dp.pan_number,
            dp.bank_account_number, dp.bank_ifsc_code, dp.bank_account_holder_name
     FROM partner_monthly_payouts pmp
     INNER JOIN delivery_profiles dp ON dp.id = pmp.delivery_profile_id
     INNER JOIN users u ON u.id = dp.user_id
     WHERE pmp.id = $1`,
    [payoutId]
  )
  if (!payout) throw new Error('Payout not found')

  const breakdown =
    `Pickups: ${payout.pickup_count} (₹${parseFloat(payout.pickup_salary).toFixed(2)}) · ` +
    `Deliveries: ${payout.delivery_count} (₹${parseFloat(payout.delivery_salary).toFixed(2)})` +
    (parseFloat(payout.adjustments) !== 0
      ? ` · Adjustments: ₹${parseFloat(payout.adjustments).toFixed(2)}${payout.adjustments_note ? ` (${payout.adjustments_note})` : ''}`
      : '')

  const data: PayslipData = {
    staffName: payout.full_name,
    role: 'delivery partner',
    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    amount: parseFloat(payout.total_salary),
    note: breakdown,
    status: payout.status,
    panNumber: payout.pan_number,
    bankAccountNumber: payout.bank_account_number,
    bankIfscCode: payout.bank_ifsc_code,
    bankAccountHolder: payout.bank_account_holder_name,
    paymentMethod: payout.status === 'paid' ? 'Bank Transfer' : null,
    paymentReference: payout.payment_reference,
    paidAt: payout.paid_at,
    generatedAt: new Date().toISOString(),
  }

  const pdfBuffer = await renderToBuffer(React.createElement(PayslipDocument, { data }))
  const s3Key = `delivery-payslips/${payoutId}/payslip.pdf`

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="Payslip-${payout.full_name.replace(/[^a-zA-Z0-9]/g, '_')}-${payout.period_end}.pdf"`,
    metadata: { payoutId: String(payoutId) },
  })

  await query(`UPDATE partner_monthly_payouts SET payslip_s3_key = $1 WHERE id = $2`, [s3Key, payoutId])

  return s3Key
}

export async function getDeliveryPayslipDownloadUrl(payoutId: number): Promise<string | null> {
  const payout = await queryOne<{ payslip_s3_key: string | null }>(
    `SELECT payslip_s3_key FROM partner_monthly_payouts WHERE id = $1`, [payoutId]
  )
  if (!payout?.payslip_s3_key) return null
  return getSignedDownloadUrl(payout.payslip_s3_key, { expiresIn: URL_TTL, disposition: 'attachment' })
}
