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
    distance_pay: string; billable_km: string; slab_top_up: string
    surge_pay: string; first_mile_pay: string
    failed_trip_pay: string; failed_trip_count: number
    volume_bonus: string
    payout_rate_snapshot: { is_active?: boolean; per_km_rate?: number; minimum_billable_km?: number } | null
    status: string; payment_reference: string | null; paid_at: string | null
    full_name: string; pan_number: string | null
    bank_account_number: string | null; bank_ifsc_code: string | null
    bank_account_holder_name: string | null
  }>(
    `SELECT pmp.id, pmp.period_start::TEXT, pmp.period_end::TEXT,
            pmp.pickup_count, pmp.delivery_count,
            pmp.pickup_salary::TEXT, pmp.delivery_salary::TEXT, pmp.total_salary::TEXT,
            pmp.adjustments::TEXT, pmp.adjustments_note,
            pmp.distance_pay::TEXT, pmp.billable_km::TEXT, pmp.slab_top_up::TEXT,
            pmp.surge_pay::TEXT, pmp.first_mile_pay::TEXT,
            pmp.failed_trip_pay::TEXT, pmp.failed_trip_count,
            pmp.volume_bonus::TEXT,
            pmp.payout_rate_snapshot,
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

  const adjustments = parseFloat(payout.adjustments) || 0
  const adjustmentsText = adjustments !== 0
    ? ` · Adjustments: ₹${adjustments.toFixed(2)}${payout.adjustments_note ? ` (${payout.adjustments_note})` : ''}`
    : ''

  // Which pay model this payout was actually calculated under. The snapshot is
  // the authority — distance_pay can legitimately be 0 (a partner who did no
  // legs), and rows calculated before distance pay existed have no snapshot at
  // all. Getting this wrong would print slab figures on a payslip whose total
  // came from distance, so the numbers wouldn't add up for the partner.
  const paidByDistance = payout.payout_rate_snapshot?.is_active === true

  let breakdown: string

  if (paidByDistance) {
    const legs      = payout.pickup_count + payout.delivery_count
    const distance  = parseFloat(payout.distance_pay) || 0
    const km        = parseFloat(payout.billable_km) || 0
    const topUp     = parseFloat(payout.slab_top_up) || 0
    const rate      = payout.payout_rate_snapshot?.per_km_rate
    const slabTotal = (parseFloat(payout.pickup_salary) || 0) + (parseFloat(payout.delivery_salary) || 0)

    // Every earning component gets its own line. A partner asking "why this
    // amount?" should find the answer here, not in a support ticket — and a
    // component silently omitted reads as underpayment.
    const parts = [
      `${payout.pickup_count} pickups + ${payout.delivery_count} deliveries = ${legs} legs`,
      `${km.toFixed(2)} km billable${rate != null ? ` @ ₹${rate}/km` : ''} = ₹${distance.toFixed(2)}`,
    ]

    const surge     = parseFloat(payout.surge_pay) || 0
    const firstMile = parseFloat(payout.first_mile_pay) || 0
    const failedPay = parseFloat(payout.failed_trip_pay) || 0
    const bonus     = parseFloat(payout.volume_bonus) || 0

    if (surge > 0)     parts.push(`Peak-hour bonus: ₹${surge.toFixed(2)}`)
    if (firstMile > 0) parts.push(`First-mile allowance: ₹${firstMile.toFixed(2)}`)
    if (failedPay > 0) {
      parts.push(
        `Failed-trip pay (${payout.failed_trip_count} attempt${payout.failed_trip_count === 1 ? '' : 's'}): ₹${failedPay.toFixed(2)}`
      )
    }
    if (bonus > 0)     parts.push(`Volume bonus: ₹${bonus.toFixed(2)}`)
    if (topUp > 0) {
      parts.push(`Monthly minimum top-up: ₹${topUp.toFixed(2)} (guaranteed ₹${slabTotal.toFixed(2)})`)
    }

    breakdown = parts.join(' · ') + adjustmentsText
  } else {
    breakdown =
      `Pickups: ${payout.pickup_count} (₹${parseFloat(payout.pickup_salary).toFixed(2)}) · ` +
      `Deliveries: ${payout.delivery_count} (₹${parseFloat(payout.delivery_salary).toFixed(2)})` +
      adjustmentsText
  }

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
