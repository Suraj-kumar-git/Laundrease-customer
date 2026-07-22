// lib/staff-payslip.ts
// Renders a payslip PDF and uploads it to S3, mirroring the order-invoice
// pattern (lib/order-invoice.ts). Regenerated (overwritten at the same key)
// whenever the payslip is created or its status changes, so the PDF always
// reflects the current payment status/reference.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { PayslipDocument, PayslipData } from '@/lib/payslip-pdf'
import { uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'

const URL_TTL = 15 * 60 // 15 minutes

export async function generateAndUploadPayslip(payoutId: number): Promise<string> {
  const payout = await queryOne<{
    id: number; period_start: string; period_end: string; amount: string; note: string | null
    status: string; pan_number: string | null; bank_account_number: string | null
    bank_ifsc_code: string | null; bank_account_holder: string | null
    payment_method: string | null; payment_reference: string | null; paid_at: string | null
    full_name: string; role: string
  }>(
    `SELECT sp.id, sp.period_start::TEXT, sp.period_end::TEXT, sp.amount::TEXT, sp.note,
            sp.status, sp.pan_number, sp.bank_account_number, sp.bank_ifsc_code,
            sp.bank_account_holder, sp.payment_method, sp.payment_reference, sp.paid_at::TEXT,
            u.full_name, r.name AS role
     FROM staff_payouts sp
     INNER JOIN users u ON u.id = sp.user_id
     INNER JOIN roles r ON r.id = u.role_id
     WHERE sp.id = $1`,
    [payoutId]
  )
  if (!payout) throw new Error('Payslip not found')

  const data: PayslipData = {
    staffName: payout.full_name,
    role: payout.role,
    periodStart: payout.period_start,
    periodEnd: payout.period_end,
    amount: parseFloat(payout.amount),
    note: payout.note,
    status: payout.status,
    panNumber: payout.pan_number,
    bankAccountNumber: payout.bank_account_number,
    bankIfscCode: payout.bank_ifsc_code,
    bankAccountHolder: payout.bank_account_holder,
    paymentMethod: payout.payment_method,
    paymentReference: payout.payment_reference,
    paidAt: payout.paid_at,
    generatedAt: new Date().toISOString(),
  }

  const pdfBuffer = await renderToBuffer(React.createElement(PayslipDocument, { data }))
  const s3Key = `staff-payslips/${payoutId}/payslip.pdf`

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="Payslip-${payout.full_name.replace(/[^a-zA-Z0-9]/g, '_')}-${payout.period_end}.pdf"`,
    metadata: { payoutId: String(payoutId) },
  })

  await query(`UPDATE staff_payouts SET payslip_s3_key = $1 WHERE id = $2`, [s3Key, payoutId])

  return s3Key
}

export async function getPayslipDownloadUrl(payoutId: number): Promise<string | null> {
  const payout = await queryOne<{ payslip_s3_key: string | null }>(
    `SELECT payslip_s3_key FROM staff_payouts WHERE id = $1`, [payoutId]
  )
  if (!payout?.payslip_s3_key) return null
  return getSignedDownloadUrl(payout.payslip_s3_key, { expiresIn: URL_TTL, disposition: 'attachment' })
}
