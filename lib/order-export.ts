// lib/order-export.ts
// Shared engine for the Orders → "Download Excel" button in the admin,
// support, and laundry personas.
//
// Two things this file deliberately centralises, because the alternative is
// the admin/support/laundry drift this codebase keeps paying for:
//
//   1. The WHERE builder. The export must return exactly the rows the list
//      endpoint would return for the same filters — just without LIMIT/OFFSET.
//      Re-writing the filter SQL per role is how an export silently starts
//      disagreeing with the screen it was launched from.
//   2. The per-role column list. Row-level scoping (below) is the security
//      boundary; the column list is what a role is allowed to SEE. Keeping it
//      as data in one place beats three diverging SELECTs.
//
// Row scoping mirrors the list routes exactly:
//   admin    — every order.
//   support  — every order (the gate is getTabAccessLevel(userId,'orders'),
//              applied in the route, not here).
//   laundry  — o.laundry_profile_id = <their own> AND o.status <> 'failed'.

import ExcelJS from 'exceljs'

export type ExportRole = 'admin' | 'support' | 'laundry'

// Generating the workbook holds every row in memory, so this is a real
// serverless memory/time ceiling, not a nicety. Callers surface it as a
// "narrow your date range" message rather than dying mid-stream.
export const MAX_EXPORT_ROWS = 10_000

// ── Cell safety ─────────────────────────────────────────────────────────────

// A cell whose text starts with = + - or @ is executed as a FORMULA by Excel
// and Google Sheets. Order exports carry user-supplied text (customer names,
// addresses, special instructions, rejection reasons), so this is a genuine
// injection vector, not a formatting nit. Prefixing with an apostrophe forces
// the value to be read as literal text.
function safeText(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

// ── Column definitions ──────────────────────────────────────────────────────
// `kind` drives cell formatting:
//   text  — written as a string. Used for order numbers, phones and pincodes
//           so Excel can't strip leading zeros or flip long digit strings into
//           scientific notation.
//   money — a real numeric cell with 2dp, so totals can be SUM'd in Excel.
//           (The DB hands money back as ::TEXT to avoid float drift; it's
//           parsed back to a number only here, at write time.)
//   plain — free text (names, addresses, statuses), formula-escaped.
//   date  — already formatted to IST 'YYYY-MM-DD [HH:MM]' text in SQL. Kept as
//           text on purpose: it sorts chronologically, and it can't be
//           re-interpreted by Excel's locale into DD/MM vs MM/DD.
type ColKind = 'text' | 'money' | 'plain' | 'date' | 'int'

interface Col { header: string; field: string; width: number; kind: ColKind }

const C = (header: string, field: string, width: number, kind: ColKind = 'plain'): Col =>
  ({ header, field, width, kind })

// Full set — admin and support.
const ADMIN_COLUMNS: Col[] = [
  C('Order Number',        'order_number',        18, 'text'),
  C('Order Status',        'status',              18),
  C('Payment Status',      'payment_status',      16),
  C('Payment Method',      'payment_method',      16),
  C('Express',             'is_express',          10),
  C('Customer Name',       'customer_name',       22),
  C('Customer Phone',      'customer_phone',      16, 'text'),
  C('Customer Email',      'customer_email',      26),
  C('Provider',            'provider_name',       24),
  C('Delivery Partner',    'delivery_partner_name', 22),
  C('Assignment Status',   'assignment_status',   18),
  C('Items',               'item_count',          8,  'int'),

  C('Subtotal',            'subtotal',            13, 'money'),
  C('Service GST (in subtotal)', 'tax_amount',    20, 'money'),
  C('Delivery Fee',        'delivery_fee',        13, 'money'),
  C('Convenience Fee',     'convenience_fee',     16, 'money'),
  C('Express Surcharge',   'express_surcharge',   17, 'money'),
  C('GST on Fees',         'fee_gst',             13, 'money'),
  C('Other Adjustments',   'other_adjustments',   17, 'money'),
  C('Discount',            'discount_amount',     12, 'money'),
  C('Order Total',         'total_amount',        13, 'money'),
  C('COD Collected',       'cod_amount_collected',14, 'money'),

  C('Created On',          'created_on',          17, 'date'),
  C('Confirmed On',        'confirmed_on',        17, 'date'),
  C('Assigned On',         'assigned_on',         17, 'date'),
  C('Pickup Date',         'pickup_date',         13, 'date'),
  C('Pickup Slot',         'pickup_time_slot',    14),
  C('Delivery Date',       'delivery_date',       14, 'date'),
  C('Estimated Delivery',  'estimated_delivery_date', 18, 'date'),
  C('Delivered On',        'delivered_on',        17, 'date'),
  C('Rejected On',         'rejected_on',         17, 'date'),
  C('Rejection Reason',    'rejection_reason',    30),
  C('Modified by Delivery','modified_by_delivery',20),
  C('Modified On',         'delivery_modified_on',17, 'date'),
  C('Original Subtotal',   'original_subtotal',   17, 'money'),
  C('Original Total',      'original_total_amount',16, 'money'),

  C('Pickup Pincode',      'pickup_pincode',      14, 'text'),
  C('Pickup Address',      'pickup_address',      38),
  C('Delivery Address',    'delivery_address',    38),
  C('Special Instructions','special_instructions',34),
]

// Provider-facing set. Drops platform internals a provider has no business
// reconciling (convenience fee, GST on fees, other adjustments, COD collected)
// and ops/routing fields (delivery partner identity, assignment status), plus
// customer email and the delivery address. Customer name/phone and the pickup
// address are kept because the provider's own Orders screen already shows them.
const LAUNDRY_COLUMNS: Col[] = [
  C('Order Number',        'order_number',        18, 'text'),
  C('Order Status',        'status',              18),
  C('Payment Status',      'payment_status',      16),
  C('Payment Method',      'payment_method',      16),
  C('Express',             'is_express',          10),
  C('Customer Name',       'customer_name',       22),
  C('Customer Phone',      'customer_phone',      16, 'text'),
  C('Items',               'item_count',          8,  'int'),

  C('Subtotal',            'subtotal',            13, 'money'),
  C('Service GST (in subtotal)', 'tax_amount',    20, 'money'),
  C('Delivery Fee',        'delivery_fee',        13, 'money'),
  C('Discount',            'discount_amount',     12, 'money'),
  C('Order Total',         'total_amount',        13, 'money'),

  C('Created On',          'created_on',          17, 'date'),
  C('Confirmed On',        'confirmed_on',        17, 'date'),
  C('Pickup Date',         'pickup_date',         13, 'date'),
  C('Pickup Slot',         'pickup_time_slot',    14),
  C('Delivery Date',       'delivery_date',       14, 'date'),
  C('Estimated Delivery',  'estimated_delivery_date', 18, 'date'),
  C('Delivered On',        'delivered_on',        17, 'date'),
  C('Rejected On',         'rejected_on',         17, 'date'),
  C('Rejection Reason',    'rejection_reason',    30),

  C('Pickup Address',      'pickup_address',      38),
  C('Special Instructions','special_instructions',34),
]

export function columnsForRole(role: ExportRole): Col[] {
  return role === 'laundry' ? LAUNDRY_COLUMNS : ADMIN_COLUMNS
}

// ── Filters ─────────────────────────────────────────────────────────────────

export interface ExportFilterInput {
  from:            string   // YYYY-MM-DD, required
  to:              string   // YYYY-MM-DD, required
  status?:         string
  payment_status?: string
  provider_id?:    string
  assignment?:     string
  search?:         string
  pickup_date?:    string   // laundry list's exact-pickup-date filter
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * Builds the WHERE clause + params. Mirrors each list route's filters exactly
 * so the sheet matches the screen.
 *
 * `from`/`to` are inclusive calendar days in IST. Comparing a TIMESTAMPTZ
 * against a bare date would silently drop everything ordered after 05:30 IST
 * on the `to` day (UTC midnight), so the column is converted to its IST
 * calendar date before comparing.
 */
export function buildExportWhere(
  role: ExportRole,
  f: ExportFilterInput,
  providerId?: number
): { where: string; params: any[] } {
  const conds: string[] = []
  const params: any[]   = []
  let   p               = 1

  if (role === 'laundry') {
    conds.push(`o.laundry_profile_id = $${p++}`); params.push(providerId)
    conds.push(`o.status <> 'failed'`)
  }

  conds.push(`(o.created_at AT TIME ZONE 'Asia/Kolkata')::DATE BETWEEN $${p++}::DATE AND $${p++}::DATE`)
  params.push(f.from, f.to)

  if (f.status) {
    // Admin/support tabs send comma-separated synonym statuses
    // (at_laundry,processing) — the laundry tab sends a single value. Splitting
    // handles both.
    const statuses = f.status.split(',').map(s => s.trim()).filter(Boolean)
    if (statuses.length) { conds.push(`o.status = ANY($${p++}::text[])`); params.push(statuses) }
  }

  if (role !== 'laundry') {
    if (f.payment_status) { conds.push(`o.payment_status = $${p++}`);     params.push(f.payment_status) }
    if (f.provider_id)    { conds.push(`o.laundry_profile_id = $${p++}`); params.push(f.provider_id) }
    if (f.assignment === 'unassigned') conds.push(`o.assignment_status = 'unassigned'`)
    if (f.search) {
      conds.push(`(o.order_number ILIKE $${p} OR cu.full_name ILIKE $${p} OR cu.email ILIKE $${p} OR cu.phone ILIKE $${p})`)
      params.push(`%${f.search}%`); p++
    }
  } else {
    if (f.pickup_date) { conds.push(`o.pickup_date = $${p++}`); params.push(f.pickup_date) }
    if (f.search) {
      conds.push(`(o.order_number ILIKE $${p} OR cu.full_name ILIKE $${p})`)
      params.push(`%${f.search}%`); p++
    }
  }

  return { where: `WHERE ${conds.join(' AND ')}`, params }
}

// ── Query ───────────────────────────────────────────────────────────────────

// One row per order. Fee columns are pivoted out of order_adjustments by
// metadata->>'fee_code' (that's where calculate_order_fees() stores them —
// there are no fee columns on `orders`).
//
// Note the two distinct GST figures, which is why they get separate columns:
//   tax_amount — SERVICE GST, already embedded INSIDE subtotal (reverse-derived
//                from GST-inclusive provider pricing). NOT additive.
//   fee_gst    — GST on platform fees, charged ON TOP under Laundrease's own
//                GSTIN. Additive.
// Collapsing them into one "GST" column would make the sheet fail to reconcile.
export function buildExportSql(where: string): string {
  return `
    SELECT
      o.order_number,
      o.status,
      o.payment_status,
      o.payment_method,
      CASE WHEN o.is_express THEN 'Yes' ELSE 'No' END           AS is_express,
      CASE WHEN o.modified_by_delivery THEN 'Yes' ELSE 'No' END AS modified_by_delivery,
      o.assignment_status,
      o.rejection_reason,
      o.special_instructions,
      o.pickup_address,
      o.delivery_address,
      o.pickup_time_slot,
      o.pickup_pincode,

      o.subtotal::TEXT,
      o.tax_amount::TEXT,
      o.discount_amount::TEXT,
      o.total_amount::TEXT,
      o.cod_amount_collected::TEXT,
      o.original_subtotal::TEXT,
      o.original_total_amount::TEXT,

      fees.delivery_fee::TEXT      AS delivery_fee,
      fees.convenience_fee::TEXT   AS convenience_fee,
      fees.express_surcharge::TEXT AS express_surcharge,
      fees.fee_gst::TEXT           AS fee_gst,
      fees.other_adjustments::TEXT AS other_adjustments,

      -- All timestamps rendered in IST. Kept as sortable 'YYYY-MM-DD HH:MM'
      -- text so Excel's locale can't reinterpret them as DD/MM vs MM/DD.
      to_char(o.created_at           AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS created_on,
      to_char(o.confirmed_at         AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS confirmed_on,
      to_char(o.assigned_at          AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS assigned_on,
      to_char(o.delivered_at         AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS delivered_on,
      to_char(o.rejected_at          AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS rejected_on,
      to_char(o.delivery_modified_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') AS delivery_modified_on,
      to_char(o.pickup_date,             'YYYY-MM-DD') AS pickup_date,
      to_char(o.delivery_date,           'YYYY-MM-DD') AS delivery_date,
      to_char(o.estimated_delivery_date, 'YYYY-MM-DD') AS estimated_delivery_date,

      cu.full_name     AS customer_name,
      cu.phone         AS customer_phone,
      cu.email         AS customer_email,
      lp.business_name AS provider_name,
      du.full_name     AS delivery_partner_name,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id)::INT AS item_count

    FROM orders o
    INNER JOIN users cu ON cu.id = o.customer_id
    LEFT  JOIN laundry_profiles  lp ON lp.id = o.laundry_profile_id
    LEFT  JOIN delivery_profiles dp ON dp.id = o.delivery_profile_id
    LEFT  JOIN users du ON du.id = dp.user_id
    LEFT  JOIN LATERAL (
      SELECT
        COALESCE(SUM(oa.amount) FILTER (WHERE oa.metadata->>'fee_code' = 'delivery_fee'),      0) AS delivery_fee,
        COALESCE(SUM(oa.amount) FILTER (WHERE oa.metadata->>'fee_code' = 'convenience_fee'),   0) AS convenience_fee,
        COALESCE(SUM(oa.amount) FILTER (WHERE oa.metadata->>'fee_code' = 'express_surcharge'), 0) AS express_surcharge,
        COALESCE(SUM(oa.amount) FILTER (WHERE oa.metadata->>'fee_code' = 'fee_gst'),           0) AS fee_gst,
        COALESCE(SUM(oa.amount) FILTER (
          WHERE oa.kind <> 'coupon'
            AND COALESCE(oa.metadata->>'fee_code', '') NOT IN
                ('delivery_fee','convenience_fee','express_surcharge','fee_gst')
        ), 0) AS other_adjustments
      FROM order_adjustments oa
      WHERE oa.order_id = o.id
    ) fees ON TRUE
    ${where}
    ORDER BY o.created_at DESC, o.id DESC
  `
}

// Counted before the full fetch so an oversized range fails fast with a clear
// message instead of loading every row into memory and then dying. Only the
// customer join is needed — every filter targets `o.*` or `cu.*`.
export function buildExportCountSql(where: string): string {
  return `
    SELECT COUNT(*)::TEXT AS total
    FROM orders o
    INNER JOIN users cu ON cu.id = o.customer_id
    ${where}
  `
}

// ── Workbook ────────────────────────────────────────────────────────────────

export interface WorkbookMeta {
  role:  ExportRole
  from:  string
  to:    string
  /** Human-readable summary of the filters that were applied, for the header. */
  filterSummary: string
}

export async function buildOrdersWorkbook(
  rows: Record<string, any>[],
  meta: WorkbookMeta
): Promise<Buffer> {
  const cols = columnsForRole(meta.role)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Laundrease'
  wb.created = new Date()
  const ws = wb.addWorksheet('Orders', {
    views: [{ state: 'frozen', ySplit: 3 }],   // keep the header visible while scrolling
  })

  // Two context rows above the table so a downloaded sheet is self-describing
  // — without them there's no way to tell which window/filters produced it.
  ws.mergeCells(1, 1, 1, cols.length)
  const title = ws.getCell(1, 1)
  title.value = `Laundrease — Orders (${meta.from} to ${meta.to})`
  title.font  = { bold: true, size: 13 }

  ws.mergeCells(2, 1, 2, cols.length)
  const sub = ws.getCell(2, 1)
  sub.value = safeText(
    `${rows.length} order${rows.length === 1 ? '' : 's'} · ${meta.filterSummary} · dates in IST · generated ${
      new Date().toISOString().replace('T', ' ').slice(0, 16)
    } UTC`
  )
  sub.font = { size: 9, color: { argb: 'FF666666' } }

  const headerRow = ws.getRow(3)
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    ws.getColumn(i + 1).width = c.width
  })
  headerRow.height = 22
  headerRow.commit()

  for (const r of rows) {
    const row = ws.addRow([])
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      const raw  = r[c.field]

      if (c.kind === 'money') {
        const n = num(raw)
        if (n !== null) { cell.value = n; cell.numFmt = '#,##0.00' }
      } else if (c.kind === 'int') {
        const n = num(raw)
        if (n !== null) cell.value = n
      } else {
        // text / plain / date all land here as formula-escaped strings.
        // NULL becomes an empty cell rather than the string "null".
        cell.value = safeText(raw)
      }
    })
  }

  ws.autoFilter = {
    from: { row: 3, column: 1 },
    to:   { row: 3 + rows.length, column: cols.length },
  }

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

/** `Orders_admin_2026-08-01_to_2026-08-09.xlsx` */
export function exportFilename(meta: WorkbookMeta): string {
  return `Orders_${meta.role}_${meta.from}_to_${meta.to}.xlsx`
}

/** One-line description of the active filters, shown in the sheet header. */
export function describeFilters(f: ExportFilterInput): string {
  const bits: string[] = []
  if (f.status)         bits.push(`status: ${f.status}`)
  if (f.payment_status) bits.push(`payment: ${f.payment_status}`)
  if (f.provider_id)    bits.push(`provider #${f.provider_id}`)
  if (f.assignment)     bits.push(f.assignment)
  if (f.pickup_date)    bits.push(`pickup ${f.pickup_date}`)
  if (f.search)         bits.push(`search "${f.search}"`)
  return bits.length ? bits.join(', ') : 'no extra filters'
}
