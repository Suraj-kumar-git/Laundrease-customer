// lib/order-invoice.ts
// Shared invoice generation/caching logic — used by customer, admin, and
// support invoice-download routes alike. Same S3 key regardless of who
// requests it, so the PDF is rendered once and reused across roles.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { InvoiceDocument, InvoiceData } from '@/lib/invoice-pdf'
import { objectExists, uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'
import { getPlatformGstin } from '@/lib/gst'

const URL_TTL = 15 * 60 // 15 minutes in seconds

export async function getOrCreateOrderInvoiceUrl(
  orderId: number
): Promise<{ url: string; cached: boolean } | null> {
  const order = await queryOne<{
    id:                   number
    order_number:         string
    status:               string
    is_express:           boolean
    special_instructions: string | null
    pickup_address:       string
    delivery_address:     string
    pickup_date:          string
    pickup_time_slot:     string | null
    delivery_date:        string | null
    delivery_time_slot:   string | null
    subtotal:             string
    tax_amount:           string
    discount_amount:      string
    total_amount:         string
    payment_method:       string | null
    created_at:           string
    provider_name:        string | null
    provider_phone:       string | null
    provider_city:        string | null
    provider_address_line1: string | null
    provider_address_line2: string | null
    provider_state:         string | null
    provider_postal_code:   string | null
    provider_gst_number:    string | null
    customer_name:        string
    customer_email:       string
    customer_phone:       string | null
    customer_gstin:       string | null
  }>(
    `SELECT
       o.id, o.order_number, o.status, o.is_express,
       o.special_instructions,
       o.pickup_address, o.delivery_address,
       o.pickup_date::text, o.pickup_time_slot,
       o.delivery_date::text, o.delivery_time_slot,
       o.subtotal::text, o.tax_amount::text,
       o.discount_amount::text, o.total_amount::text,
       o.payment_method,
       o.created_at,
       lp.business_name  AS provider_name,
       lp.contact_person_phone          AS provider_phone,
       lp.city           AS provider_city,
       lp.address_line1  AS provider_address_line1,
       lp.address_line2  AS provider_address_line2,
       lp.state          AS provider_state,
       lp.postal_code    AS provider_postal_code,
       -- Only ever surfaced on the invoice when this order actually carries
       -- GST (tax_amount > 0) — see the taxAmount > 0 branch below.
       lp.gst_number     AS provider_gst_number,
       u.full_name       AS customer_name,
       u.email           AS customer_email,
       u.phone           AS customer_phone,
       o.customer_gstin  AS customer_gstin
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
     WHERE o.id = $1`,
    [orderId]
  )

  if (!order) return null

  const s3Key = `customer/orders/invoices/${orderId}/INV-${order.order_number}.pdf`

  // Cached PDF already exists — just re-sign
  if (await objectExists(s3Key)) {
    const url = await getSignedDownloadUrl(s3Key, { expiresIn: URL_TTL, disposition: 'attachment' })
    return { url, cached: true }
  }

  const itemsRes = await query<{
    label:      string
    quantity:   number
    weight_kg:  string | null
    unit_price: string
    line_total: string
    sac_code:   string | null
  }>(
    `SELECT
       COALESCE(oi.garment_label, pt.name || ' — ' || sv.name) AS label,
       oi.quantity,
       oi.weight_kg::text,
       ois.unit_price::text,
       ois.line_total::text,
       sv.sac_code
     FROM order_items oi
     JOIN product_types pt ON pt.id = oi.product_type_id
     JOIN order_item_services ois ON ois.order_item_id = oi.id
     JOIN services sv ON sv.id = ois.service_id
     WHERE oi.order_id = $1
     ORDER BY oi.id, ois.id`,
    [orderId]
  )

  const adjRes = await query<{
    kind:     string
    note:     string | null
    amount:   string
    metadata: { fee_code?: string; taxable_base?: number } | null
  }>(
    `SELECT kind, note, amount::text, metadata
     FROM order_adjustments
     WHERE order_id = $1
     ORDER BY id`,
    [orderId]
  )

  const payRes = await query<{
    payment_method:  string
    amount:          string
    merchant_txn_id: string | null
    status:          string
  }>(
    `SELECT payment_method, amount::text, merchant_txn_id, status
     FROM payments
     WHERE order_id = $1
     ORDER BY id`,
    [orderId]
  )

  const subtotal  = parseFloat(order.subtotal)
  const taxAmount = parseFloat(order.tax_amount) // service-price GST only (embedded in subtotal)
  const serviceTaxableAmount = Math.round((subtotal - taxAmount) * 100) / 100

  // Fee-level GST (Part C) — an entirely separate, additive charge on top of
  // order fees (platform/convenience fee, express surcharge — never delivery
  // fee), stored as its own order_adjustments row by calculate_order_fees().
  // This is Laundrease's OWN tax liability, under Laundrease's OWN GSTIN —
  // legally distinct from the provider's service-price GST above, so it's
  // never combined into the same CGST/SGST figures; lib/invoice-pdf.tsx
  // renders it as its own labeled block via the separate feeGst field.
  const feeGstRow = adjRes.rows.find(r => r.metadata?.fee_code === 'fee_gst')
  const feeGstAmount = feeGstRow ? parseFloat(feeGstRow.amount) : 0
  const feeGstTaxableBase = feeGstRow?.metadata?.taxable_base ?? 0
  // Effective rate derived from the historical snapshot (not looked up
  // live), so the invoice always reflects what was actually charged even if
  // the admin-configured rate changes later — same principle used in
  // lib/subscription-invoice.ts.
  const feeGstRate = feeGstTaxableBase > 0 ? Math.round((feeGstAmount / feeGstTaxableBase) * 100) : 0

  const feeGstFields = feeGstAmount > 0 ? {
    feeGst: {
      supplierName: 'Laundrease Technologies Pvt. Ltd.',
      supplierGstin: await getPlatformGstin(),
      taxableAmount: feeGstTaxableBase,
      taxAmount: feeGstAmount,
      cgstRate: feeGstRate / 2,
      sgstRate: feeGstRate / 2,
      cgstAmount: Math.round((feeGstAmount / 2) * 100) / 100,
      sgstAmount: Math.round((feeGstAmount / 2) * 100) / 100,
    },
  } : {}

  // A GST-inclusive order is legally the individual laundry provider's own
  // supply (their GSTIN, their liability) — not the platform's — so the
  // invoice's "Supplier" section shows the provider's own business details
  // only when this order actually carries SERVICE-price GST (a platform-fee-
  // only-GST order must not swap in the provider as legal supplier — that
  // portion of the tax is the platform's own liability). Non-GST orders keep
  // the existing Laundrease-branded placeholder (InvoiceDocument's defaults)
  // exactly as before.
  const gstSupplierFields = taxAmount > 0 ? {
    supplierName: order.provider_name,
    supplierAddress: [order.provider_address_line1, order.provider_address_line2, order.provider_city]
      .filter(Boolean).join(', ') || null,
    supplierState: order.provider_state,
    supplierGstin: order.provider_gst_number,
    // The taxable (pre-GST) value — subtotal here is GST-inclusive, so this
    // must be passed explicitly or InvoiceDocument would default it to the
    // full inclusive subtotal and derive the wrong effective tax rate.
    taxableAmount: serviceTaxableAmount,
  } : {}

  const invoiceData: InvoiceData = {
    useLogo: true,
    orderNumber: order.order_number,
    orderId: order.id,
    orderDate: order.created_at,
    status: order.status,
    isExpress: order.is_express,
    specialInstructions: order.special_instructions,
    pickupDate: order.pickup_date,
    pickupTimeSlot: order.pickup_time_slot,
    deliveryDate: order.delivery_date,
    deliveryTimeSlot: order.delivery_time_slot,
    pickupAddress: order.pickup_address,
    deliveryAddress: order.delivery_address,
    providerName: order.provider_name,
    providerPhone: order.provider_phone,
    providerCity: order.provider_city,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone ?? '',
    // Relevant for ITC claims on any GST-carrying order — a B2B customer can
    // claim back fee-level GST too, not just service-price GST, so this
    // gates on either tax source rather than the service-only amount.
    customerGstin: (taxAmount > 0 || feeGstAmount > 0) ? order.customer_gstin : null,
    subtotal,
    taxAmount,
    discountAmount: parseFloat(order.discount_amount),
    totalAmount: parseFloat(order.total_amount),
    ...gstSupplierFields,
    ...feeGstFields,
    items: itemsRes.rows.map(r => {
      // De-scale to the pre-tax (taxable) value when the service price was
      // GST-inclusive — items must sum to serviceTaxableAmount, the same
      // figure the Tax Breakdown box shows, never the GST-inclusive stored
      // price. Fee-level GST never touches item pricing. Non-GST orders
      // (the majority) pass through unchanged (ratio === 1).
      const ratio = taxAmount > 0 ? serviceTaxableAmount / subtotal : 1
      return {
        label: r.label,
        quantity: r.quantity,
        weightKg: r.weight_kg != null ? parseFloat(r.weight_kg) : null,
        unitPrice: Math.round(parseFloat(r.unit_price) * ratio * 100) / 100,
        lineTotal: Math.round(parseFloat(r.line_total) * ratio * 100) / 100,
        sacCode: r.sac_code,
      }
    }),
    adjustments: adjRes.rows.map(r => ({
      kind: r.kind,
      note: r.note,
      amount: parseFloat(r.amount),
    })),
    payments: payRes.rows.map(r => ({
      method: r.payment_method,
      amount: parseFloat(r.amount),
      transactionId: r.merchant_txn_id,
      status: r.status,
    })),
  }

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoiceDocument, { data: invoiceData })
  )

  await uploadBuffer(s3Key, pdfBuffer, 'application/pdf', {
    contentDisposition: `attachment; filename="INV-${order.order_number}.pdf"`,
    metadata: {
      orderId:     String(orderId),
      orderNumber: order.order_number,
    },
  })

  const url = await getSignedDownloadUrl(s3Key, { expiresIn: URL_TTL, disposition: 'attachment' })
  return { url, cached: false }
}
