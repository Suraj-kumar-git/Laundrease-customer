// lib/order-invoice.ts
// Shared invoice generation/caching logic — used by customer, admin, and
// support invoice-download routes alike. Same S3 key regardless of who
// requests it, so the PDF is rendered once and reused across roles.

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import { query, queryOne } from '@/lib/db'
import { InvoiceDocument, InvoiceData } from '@/lib/invoice-pdf'
import { objectExists, uploadBuffer, getSignedDownloadUrl } from '@/lib/s3'

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
    kind:   string
    note:   string | null
    amount: string
  }>(
    `SELECT kind, note, amount::text
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
  const taxAmount = parseFloat(order.tax_amount)

  // A GST-inclusive order is legally the individual laundry provider's own
  // supply (their GSTIN, their liability) — not the platform's — so the
  // invoice's "Supplier" section shows the provider's own business details
  // only when this order actually carries GST. Non-GST orders keep the
  // existing Laundrease-branded placeholder (InvoiceDocument's defaults)
  // exactly as before, since nothing here changes their supplier fields.
  const gstSupplierFields = taxAmount > 0 ? {
    supplierName: order.provider_name,
    supplierAddress: [order.provider_address_line1, order.provider_address_line2, order.provider_city]
      .filter(Boolean).join(', ') || null,
    supplierState: order.provider_state,
    supplierGstin: order.provider_gst_number,
    // The taxable (pre-GST) value — subtotal here is GST-inclusive, so this
    // must be passed explicitly or InvoiceDocument would default it to the
    // full inclusive subtotal and derive the wrong effective tax rate.
    taxableAmount: Math.round((subtotal - taxAmount) * 100) / 100,
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
    // Only relevant for ITC claims on a GST-carrying order — a non-GST order
    // has no tax to claim back, so the GSTIN is omitted from that invoice.
    customerGstin: taxAmount > 0 ? order.customer_gstin : null,
    subtotal,
    taxAmount,
    discountAmount: parseFloat(order.discount_amount),
    totalAmount: parseFloat(order.total_amount),
    ...gstSupplierFields,
    items: itemsRes.rows.map(r => ({
      label: r.label,
      quantity: r.quantity,
      weightKg: r.weight_kg != null ? parseFloat(r.weight_kg) : null,
      unitPrice: parseFloat(r.unit_price),
      lineTotal: parseFloat(r.line_total),
      sacCode: r.sac_code,
    })),
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
