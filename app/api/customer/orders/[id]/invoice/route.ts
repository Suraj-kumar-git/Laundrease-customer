// app/api/customer/orders/[id]/invoice/route.ts
// GET /api/customer/orders/:id/invoice
//
// Flow:
//  1. Authenticate customer (JWT)
//  2. Verify order belongs to this customer
//  3. Check if invoice already exists in S3 → re-sign + return URL
//  4. Otherwise: fetch full order data from DB
//  5. Render PDF with @react-pdf/renderer (server-side, Node only)
//  6. Upload to S3 at  invoices/{orderId}/INV-{orderNumber}.pdf
//  7. Generate pre-signed URL (valid 15 minutes) → return to client
//
// Install:  npm install @react-pdf/renderer
//           (already have: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner)
//
// Env vars needed (already present from existing S3 usage):
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//   AWS_S3_BUCKET_USER_ASSETS

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer }            from '@react-pdf/renderer'
import React                         from 'react'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl }              from '@aws-sdk/s3-request-presigner'
import { GetObjectCommand }          from '@aws-sdk/client-s3'

import { getAuthUser }                from '@/lib/auth'
import { query, queryOne }           from '@/lib/db'
import { serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'
import { InvoiceDocument, InvoiceData } from '@/lib/invoice-pdf'

// ---- S3 client (reuse existing bucket) ----------------------
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' })
const BUCKET   = process.env.AWS_S3_COMMON_BUCKET!
const URL_TTL  = 15 * 60   // 15 minutes in seconds

// ---- Route handler ------------------------------------------
export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
 {
  // 1. Auth
  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'customer') return unauthorizedResponse()
  const userId  = auth.id
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) return NextResponse.json({ success: false, message: 'Invalid order id' }, { status: 400 })

  try {
    // 2. Verify order ownership (fast query — also fetches core fields)
    const order = await queryOne<{
      id:                   number
      order_number:         string
      customer_id:          number
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
      customer_name:        string
      customer_email:       string
      customer_phone:       string | null
    }>(
      `SELECT
         o.id, o.order_number, o.customer_id, o.status, o.is_express,
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
         u.full_name       AS customer_name,
         u.email           AS customer_email,
         u.phone           AS customer_phone
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [orderId, userId]
    )

    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 })
    }

    const s3Key = `customer/orders/invoices/${orderId}/INV-${order.order_number}.pdf`

    // 3. Check S3 cache — if PDF already exists, just re-sign
    const exists = await headS3(s3Key)
    if (exists) {
      const url = await signedUrl(s3Key)
      return NextResponse.json({ success: true, data: { url, cached: true } })
    }

    // 4. Fetch line items
    const itemsRes = await query<{
      label:      string
      quantity:   number
      weight_kg:  string | null
      unit_price: string
      line_total: string
    }>(
      `SELECT
         COALESCE(oi.garment_label, pt.name || ' — ' || sv.name) AS label,
         oi.quantity,
         oi.weight_kg::text,
         ois.unit_price::text,
         ois.line_total::text
       FROM order_items oi
       JOIN product_types pt ON pt.id = oi.product_type_id
       JOIN order_item_services ois ON ois.order_item_id = oi.id
       JOIN services sv ON sv.id = ois.service_id
       WHERE oi.order_id = $1
       ORDER BY oi.id, ois.id`,
      [orderId]
    )

    // 4b. Fetch adjustments (delivery fee, express fee, coupons, etc.)
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

    // 4c. Fetch payments
    const payRes = await query<{
      payment_method: string
      amount:         string
      merchant_txn_id: string | null
      status:         string
    }>(
      `SELECT payment_method, amount::text, merchant_txn_id, status
       FROM payments
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    )

    // 5. Build InvoiceData
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
      subtotal: parseFloat(order.subtotal),
      taxAmount: parseFloat(order.tax_amount),
      discountAmount: parseFloat(order.discount_amount),
      totalAmount: parseFloat(order.total_amount),
      items: itemsRes.rows.map(r => ({
        label: r.label,
        quantity: r.quantity,
        weightKg: r.weight_kg != null ? parseFloat(r.weight_kg) : null,
        unitPrice: parseFloat(r.unit_price),
        lineTotal: parseFloat(r.line_total),
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

    // 6. Render PDF buffer (server-side, React element)
    const pdfBuffer = await renderToBuffer(
      React.createElement(InvoiceDocument, { data: invoiceData })
    )

    // 7. Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         s3Key,
      Body:        pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="INV-${order.order_number}.pdf"`,
      Metadata: {
        orderId:     String(orderId),
        orderNumber: order.order_number,
        customerId:  String(userId),
      },
    }))

    // 8. Return pre-signed URL
    const url = await signedUrl(s3Key)
    return NextResponse.json({ success: true, data: { url, cached: false } })

  } catch (error) {
    console.error('[GET /api/customer/orders/[id]/invoice]', error)
    return serverErrorResponse('Failed to generate invoice')
  }
}

// ---- Helpers ------------------------------------------------

async function headS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function signedUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: URL_TTL }
  )
}
}
