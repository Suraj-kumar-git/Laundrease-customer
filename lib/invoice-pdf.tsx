// Sections:
//  1. Header   — logo wordmark + invoice metadata
//  2. Parties  — Laundrease (from) + Customer (to)
//  3. Order    — order number, date, status, pickup/delivery info
//  4. Items    — garment line items table
//  5. Charges  — subtotal, adjustments (fees / discounts), tax, total
//  6. Payments — payment method breakdown
//  7. Footer   — thank-you note + support contact

import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  DocumentProps,
} from '@react-pdf/renderer'

// ---- Types --------------------------------------------------

export interface InvoiceItem {
  label: string
  quantity: number
  weightKg: number | null
  unitPrice: number
  lineTotal: number
  sacCode?: string | null
}

export interface InvoiceAdjustment {
  kind: string
  note: string | null
  amount: number
}

export interface InvoicePayment {
  method: string
  amount: number
  transactionId: string | null
  status: string
}

export interface InvoiceData {
  useLogo: boolean
  // Order core
  orderNumber: string
  orderId: number
  orderDate: string
  status: string
  isExpress: boolean
  specialInstructions: string | null

  // Schedule
  pickupDate: string
  pickupTimeSlot: string | null
  deliveryDate: string | null
  deliveryTimeSlot: string | null

  // Addresses
  pickupAddress: string
  deliveryAddress: string

  // Provider
  providerName: string | null
  providerPhone: string | null
  providerCity: string | null

  // Customer
  customerName: string
  customerEmail: string
  customerPhone: string
  customerGstin?: string | null
  recipientStateName?: string | null
  recipientStateCode?: string | null

  // Supplier
  supplierName?: string | null
  supplierAddress?: string | null
  supplierState?: string | null
  supplierStateCode?: string | null
  supplierEmail?: string | null
  supplierPhone?: string | null
  supplierGstin?: string | null

  // GST / invoice meta
  placeOfSupplyStateName?: string | null
  placeOfSupplyStateCode?: string | null
  serviceAccountingCode?: string | null
  serviceDescription?: string | null

  taxableAmount?: number | null
  taxRate?: number | null
  cgstRate?: number | null
  sgstRate?: number | null
  cgstAmount?: number | null
  sgstAmount?: number | null

  // Signature
  signatureImage?: string | null
  authorizedSignatoryName?: string | null

  // Line items
  items: InvoiceItem[]
  adjustments: InvoiceAdjustment[]
  payments: InvoicePayment[]

  // Totals
  subtotal: number
  taxAmount: number
  discountAmount: number
  totalAmount: number
}

// ---- Palette & styles ----------------------------------------

const VIOLET = '#3b82f6'
const VIOLET2 = '#ede9fe'
const GRAY1 = '#111827'
const GRAY2 = '#374151'
const GRAY3 = '#6b7280'
const GRAY4 = '#e5e7eb'
const GREEN = '#059669'
const WHITE = '#ffffff'
const logoUrl= `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/laundrease-logo.PNG`

const s = StyleSheet.create({
  logoImage: {
    width: 120,
    height: 40,
    objectFit: 'contain',
  },
  logoTextFallback: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: VIOLET,
  },
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: GRAY2,
    paddingHorizontal: 40,
    paddingVertical: 40,
    backgroundColor: WHITE,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  logo: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: VIOLET,
    letterSpacing: 0.5,
  },
  logoTag: {
    fontSize: 7.5,
    color: GRAY3,
    marginTop: 2,
  },
  invoiceBox: {
    alignItems: 'flex-end',
  },
  invoiceTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
    marginBottom: 4,
  },
  invoiceMeta: {
    fontSize: 8,
    color: GRAY3,
    marginBottom: 2,
  },
  invoiceMetaVal: {
    fontSize: 8,
    color: GRAY2,
    fontFamily: 'Helvetica-Bold',
  },

  // Divider
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: GRAY4,
    marginVertical: 14,
  },
  hrThick: {
    borderBottomWidth: 2,
    borderBottomColor: VIOLET,
    marginVertical: 14,
  },

  // Invoice summary
  invoiceSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: GRAY4,
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  summaryField: {
    flex: 1,
    paddingRight: 8,
  },
  summaryLabel: {
    fontSize: 7,
    color: GRAY3,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 8.5,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
  },

  // Two-column parties
  twoCol: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 14,
  },
  partyBox: {
    flex: 1,
    backgroundColor: '#fafafa',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: GRAY4,
  },
  partyLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: GRAY3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
    marginBottom: 3,
  },
  partyLine: {
    fontSize: 8,
    color: GRAY2,
    marginBottom: 2,
    lineHeight: 1.4,
  },

  // GST / service info
  taxInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: GRAY4,
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  taxInfoField: {
    flex: 1,
    paddingRight: 10,
  },
  taxInfoLabel: {
    fontSize: 7,
    color: GRAY3,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  taxInfoValue: {
    fontSize: 8.5,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
  },

  // Order info strip
  orderStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
    backgroundColor: VIOLET2,
    borderRadius: 8,
    padding: 12,
  },
  orderField: {
    minWidth: '22%',
  },
  orderFieldLabel: {
    fontSize: 7,
    color: VIOLET,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  orderFieldValue: {
    fontSize: 8.5,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
  },

  // Express badge
  expressBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  expressBadgeText: {
    fontSize: 7,
    color: '#92400e',
    fontFamily: 'Helvetica-Bold',
  },

  // Section heading
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
    marginBottom: 6,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: VIOLET,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 2,
  },
  tableHeaderTxt: {
    fontSize: 7.5,
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: GRAY4,
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  tableTxt: {
    fontSize: 8.5,
    color: GRAY2,
  },
  colItem: {
    flex: 3,
  },
  colSac: {
    flex: 1.2,
    textAlign: 'center',
  },
  colQty: {
    flex: 1,
    textAlign: 'center',
  },
  colWeight: {
    flex: 1,
    textAlign: 'center',
  },
  colUnit: {
    flex: 1.3,
    textAlign: 'right',
  },
  colTotal: {
    flex: 1.3,
    textAlign: 'right',
  },

  // Tax breakdown
  taxBreakdownBox: {
    flex: 1,
    marginRight: 20,
  },
  taxTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: GRAY4,
    borderBottomWidth: 0,
  },
  taxTableHeaderTxt: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
  },
  taxTableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: GRAY4,
    borderTopWidth: 0,
  },
  taxTableTxt: {
    fontSize: 8,
    color: GRAY2,
  },
  taxTableTotalRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: GRAY4,
    borderTopWidth: 0,
    backgroundColor: '#fafafa',
  },
  taxTableTotalTxt: {
    fontSize: 8,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
  },
  taxColDesc: {
    flex: 1.5,
  },
  taxColRate: {
    flex: 1,
    textAlign: 'center',
  },
  taxColTaxable: {
    flex: 1.5,
    textAlign: 'right',
  },
  taxColAmount: {
    flex: 1.5,
    textAlign: 'right',
  },

  // Totals block
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    alignItems: 'flex-start',
  },
  totalsBox: {
    width: 220,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalsLabel: {
    fontSize: 8.5,
    color: GRAY3,
  },
  totalsValue: {
    fontSize: 8.5,
    color: GRAY2,
  },
  totalsDiscount: {
    color: GREEN,
  },
  totalsFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: VIOLET,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginTop: 4,
  },
  totalsFinalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
  },
  totalsFinalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: WHITE,
  },

  // Payments
  paymentsTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: GRAY4,
  },
  payMethod: {
    fontSize: 8.5,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'capitalize',
  },
  payTxn: {
    fontSize: 7.5,
    color: GRAY3,
    marginTop: 1,
  },
  payAmt: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
  },
  payStatus: {
    fontSize: 7,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  payStatusPaid: {
    backgroundColor: '#d1fae5',
    color: GREEN,
  },
  payStatusPend: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },

  // Special instructions
  instrBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
    marginBottom: 10,
  },
  instrTitle: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#92400e',
    marginBottom: 3,
  },
  instrText: {
    fontSize: 8,
    color: '#78350f',
    lineHeight: 1.5,
  },

  // Signature / declaration
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: GRAY4,
    paddingTop: 14,
  },
  declarationBox: {
    flex: 1,
    paddingRight: 20,
  },
  declarationTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: GRAY1,
    marginBottom: 4,
  },
  declarationText: {
    fontSize: 7.5,
    color: GRAY3,
    lineHeight: 1.5,
    marginBottom: 3,
  },
  signatoryBox: {
    width: 180,
    alignItems: 'center',
  },
  signatoryCompany: {
    fontSize: 8,
    color: GRAY2,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  signatureImage: {
    width: 100,
    height: 40,
    objectFit: 'contain',
    marginBottom: 6,
  },
  digitalSignatureBox: {
    width: 110,
    height: 40,
    borderWidth: 1,
    borderColor: GRAY4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#fafafa',
  },
  digitalSignatureText: {
    fontSize: 7.5,
    color: GRAY3,
    fontFamily: 'Helvetica-Bold',
  },
  authorizedSignatory: {
    fontSize: 8,
    color: GRAY1,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
  },
  signatoryName: {
    fontSize: 7.5,
    color: GRAY3,
    marginTop: 2,
    textAlign: 'center',
  },

  // Footer
  footer: {
    marginTop: 28,
    borderTopWidth: 1,
    borderTopColor: GRAY4,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerLeft: {
    flex: 1,
  },
  footerThank: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: VIOLET,
    marginBottom: 3,
  },
  footerSub: {
    fontSize: 7.5,
    color: GRAY3,
    lineHeight: 1.5,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  footerSmall: {
    fontSize: 7,
    color: GRAY3,
    marginBottom: 1,
  },
  footerNote: {
    fontSize: 7,
    color: GRAY4,
    marginTop: 6,
    textAlign: 'center',
  },
})

// ---- Helpers -------------------------------------------------

function fmt(n: number) {
  return `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function capitalize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function adjustmentLabel(adj: InvoiceAdjustment) {
  if (adj.note) return adj.note
  return capitalize(adj.kind)
}
function formatAddress(a: string | null) {
  if (!a) return '—'
  const looksLikeJson = typeof a === 'string' && /^\s*[\{\[]/.test(a)
  if (looksLikeJson) {
    try {
      const obj = JSON.parse(a)
      const line1 = obj.address_line1 ?? obj.line1 ?? obj.line_1 ?? obj.line1
      const line2 = obj.address_line2 ?? obj.line2 ?? obj.area
      const landmark = obj.landmark
      const cityState = [obj.city, obj.state].filter(Boolean).join(', ')
      const postal = obj.postal_code ?? obj.postalCode ?? obj.postal
      const parts = [line1, line2, landmark, cityState, postal].filter(Boolean)
      return parts.join(', ')
    } catch {
    }
  }
  return a.trim()
}

// ---- Document ------------------------------------------------
type InvoiceDocumentProps = DocumentProps & { data: InvoiceData };
export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ data, ...docProps }) => {
  const taxableAmount = data.taxableAmount ?? data.subtotal
  const effectiveTaxRate = data.taxRate ?? 0
  const cgstRate = data.cgstRate ?? effectiveTaxRate / 2
  const sgstRate = data.sgstRate ?? effectiveTaxRate / 2
  const cgstAmount = data.cgstAmount ?? (data.taxAmount > 0 ? data.taxAmount / 2 : 0)
  const sgstAmount = data.sgstAmount ?? (data.taxAmount > 0 ? data.taxAmount / 2 : 0)
  const serviceAccountingCode =
    data.serviceAccountingCode ||
    data.items?.find(item => item.sacCode)?.sacCode ||
    '9967'

  return (
    <Document
      title={`Invoice - ${data.orderNumber}`}
      author="Laundrease"
      subject="Order Invoice"
      {...docProps}
    >
      <Page size="A4" style={s.page}>

        {/* ---- Header ---- */}
        <View style={s.header}>
          <View>
              {data.useLogo ? (
                // data.logoUrl can be an absolute URL, a public path like '/logo.png', or a data URI
                <Image src={logoUrl} style={s.logoImage}/>
              ) : (
                <>
                  <Text style={s.logoTextFallback}>Laundrease</Text>
                  <Text style={s.logoTag}>Professional Laundry & Dry Cleaning</Text>
                  <Text style={[s.logoTag, { marginTop: 4 }]}>Pimpri-Chinchwad & Pune</Text>
                </>
              )}
            </View>
          <View style={s.invoiceBox}>
            <Text style={s.invoiceTitle}>TAX INVOICE</Text>
            <Text style={s.invoiceMeta}>
              Invoice No:{' '}
              <Text style={s.invoiceMetaVal}>INV-{data.orderNumber}</Text>
            </Text>
            <Text style={s.invoiceMeta}>
              Invoice Date:{' '}
              <Text style={s.invoiceMetaVal}>{fmtDate(data.orderDate)}</Text>
            </Text>
            <Text style={s.invoiceMeta}>
              Order Status:{' '}
              <Text style={s.invoiceMetaVal}>{capitalize(data.status)}</Text>
            </Text>
            {data.isExpress && (
              <View style={s.expressBadge}>
                <Text style={s.expressBadgeText}>⚡ EXPRESS ORDER</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.hrThick} />

        {/* ---- Invoice Summary ---- */}
        <View style={s.invoiceSummaryBox}>
          <View style={s.summaryField}>
            <Text style={s.summaryLabel}>Invoice Number</Text>
            <Text style={s.summaryValue}>INV-{data.orderNumber}</Text>
          </View>
          <View style={s.summaryField}>
            <Text style={s.summaryLabel}>Invoice Date</Text>
            <Text style={s.summaryValue}>{fmtDate(data.orderDate)}</Text>
          </View>
          <View style={s.summaryField}>
            <Text style={s.summaryLabel}>Order Number</Text>
            <Text style={s.summaryValue}>#{data.orderNumber}</Text>
          </View>
          <View style={s.summaryField}>
            <Text style={s.summaryLabel}>Place of Supply</Text>
            <Text style={s.summaryValue}>
              {data.placeOfSupplyStateName || 'Maharashtra'}
              {' '}
              ({data.placeOfSupplyStateCode || '27'})
            </Text>
          </View>
        </View>
        {/* ---- Supplier and Recipient Details ---- */}
        <View style={s.twoCol}>
          {/* Supplier Details */}
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>Supplier Details</Text>
            <Text style={s.partyName}>
              {data.supplierName || 'Laundrease Services Pvt. Ltd.'}
            </Text>
            <Text style={s.partyLine}>
              {data.supplierAddress || 'Pimpri-Chinchwad, Pune - 411018'}
            </Text>
            <Text style={s.partyLine}>
              {data.supplierState || 'Maharashtra'}, India
            </Text>
            <Text style={s.partyLine}>
              Email: {data.supplierEmail || 'support@laundrease.in'}
            </Text>
            <Text style={s.partyLine}>
              Phone: {data.supplierPhone || '+91 98765 43210'}
            </Text>
            <Text style={s.partyLine}>
              GSTIN: {data.supplierGstin || '27XXXXX0000X1ZX'}
            </Text>
            <Text style={s.partyLine}>
              State Code: {data.supplierStateCode || '27'}
            </Text>
          </View>
          {/* Recipient Details */}
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>Recipient Details</Text>
            <Text style={s.partyName}>{data.customerName}</Text>
            <Text style={s.partyLine}>
              Email: {data.customerEmail}
            </Text>
            <Text style={s.partyLine}>
              Phone: {data.customerPhone}
            </Text>
            {data.customerGstin && (
              <Text style={s.partyLine}>
                GSTIN: {data.customerGstin}
              </Text>
            )}
            <Text style={s.partyLine}>
              State: {data.recipientStateName || data.placeOfSupplyStateName || 'Maharashtra'}
            </Text>
            <Text style={s.partyLine}>
              State Code: {data.recipientStateCode || data.placeOfSupplyStateCode || '27'}
            </Text>
            <Text style={[s.partyLabel, { marginTop: 8 }]}>
              Delivery Address
            </Text>
            <Text style={s.partyLine}>
              {formatAddress(data.deliveryAddress)}
            </Text>
          </View>
        </View>

        {/* ---- GST / Service Details ---- */}
        <View style={s.taxInfoBox}>
          <View style={s.taxInfoField}>
            <Text style={s.taxInfoLabel}>Service Accounting Code</Text>
            <Text style={s.taxInfoValue}>{serviceAccountingCode}</Text>
          </View>
          <View style={s.taxInfoField}>
            <Text style={s.taxInfoLabel}>Service Description</Text>
            <Text style={s.taxInfoValue}>
              {data.serviceDescription || 'Laundry and dry cleaning services'}
            </Text>
          </View>
          <View style={s.taxInfoField}>
            <Text style={s.taxInfoLabel}>Place of Supply</Text>
            <Text style={s.taxInfoValue}>
              {data.placeOfSupplyStateName || 'Maharashtra'}
              {' '}
              ({data.placeOfSupplyStateCode || '27'})
            </Text>
          </View>
        </View>
        {/* ---- Order Details ---- */}
        <View style={s.orderStrip}>
          <View style={s.orderField}>
            <Text style={s.orderFieldLabel}>Pickup Date</Text>
            <Text style={s.orderFieldValue}>{fmtDate(data.pickupDate)}</Text>

            {data.pickupTimeSlot && (
              <Text style={[s.orderFieldValue, { fontSize: 7.5, color: VIOLET }]}>
                {data.pickupTimeSlot}
              </Text>
            )}
          </View>

          {data.deliveryDate && (
            <View style={s.orderField}>
              <Text style={s.orderFieldLabel}>Delivery Date</Text>
              <Text style={s.orderFieldValue}>{fmtDate(data.deliveryDate)}</Text>

              {data.deliveryTimeSlot && (
                <Text style={[s.orderFieldValue, { fontSize: 7.5, color: VIOLET }]}>
                  {data.deliveryTimeSlot}
                </Text>
              )}
            </View>
          )}

          {data.providerName && (
            <View style={s.orderField}>
              <Text style={s.orderFieldLabel}>Laundry Partner</Text>
              <Text style={s.orderFieldValue}>{data.providerName}</Text>

              {data.providerCity && (
                <Text style={[s.orderFieldValue, { fontSize: 7.5, color: GRAY3 }]}>
                  {data.providerCity}
                </Text>
              )}
            </View>
          )}

          <View style={s.orderField}>
            <Text style={s.orderFieldLabel}>Pickup From</Text>
            <Text style={[s.orderFieldValue, { fontSize: 7.5 }]}>
              {formatAddress(data.pickupAddress)}
            </Text>
          </View>
        </View>

        {/* ---- Special Instructions ---- */}
        {data.specialInstructions && (
          <View style={s.instrBox}>
            <Text style={s.instrTitle}>Special Instructions</Text>
            <Text style={s.instrText}>{data.specialInstructions}</Text>
          </View>
        )}

        {/* ---- Items Table ---- */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderTxt, s.colItem]}>Item / Service</Text>
          <Text style={[s.tableHeaderTxt, s.colSac]}>SAC</Text>
          <Text style={[s.tableHeaderTxt, s.colQty]}>Qty</Text>
          <Text style={[s.tableHeaderTxt, s.colWeight]}>Wt (kg)</Text>
          <Text style={[s.tableHeaderTxt, s.colUnit]}>Unit Price</Text>
          <Text style={[s.tableHeaderTxt, s.colTotal]}>Taxable Value</Text>
        </View>

        {data.items.length === 0 ? (
          <View style={s.tableRow}>
            <Text style={[s.tableTxt, { color: GRAY3, fontStyle: 'italic' }]}>
              Order items will be confirmed after pickup
            </Text>
          </View>
        ) : (
          data.items.map((item, i) => (
            <View
              key={i}
              style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            >
              <Text style={[s.tableTxt, s.colItem]}>
                {item.label}
              </Text>

              <Text style={[s.tableTxt, s.colSac]}>
                {item.sacCode || serviceAccountingCode}
              </Text>

              <Text style={[s.tableTxt, s.colQty]}>
                {item.quantity}
              </Text>

              <Text style={[s.tableTxt, s.colWeight]}>
                {item.weightKg != null ? item.weightKg.toFixed(2) : '—'}
              </Text>

              <Text style={[s.tableTxt, s.colUnit]}>
                {fmt(item.unitPrice)}
              </Text>

              <Text style={[s.tableTxt, s.colTotal]}>
                {fmt(item.lineTotal)}
              </Text>
            </View>
          ))
        )}

        {/* ---- Totals and Tax Breakdown ---- */}
        <View style={s.totalsWrap}>

          {/* Tax Breakdown */}
          <View style={s.taxBreakdownBox}>
            <Text style={s.sectionTitle}>Tax Breakdown</Text>

            <View style={s.taxTableHeader}>
              <Text style={[s.taxTableHeaderTxt, s.taxColDesc]}>Tax Type</Text>
              <Text style={[s.taxTableHeaderTxt, s.taxColRate]}>Rate</Text>
              <Text style={[s.taxTableHeaderTxt, s.taxColTaxable]}>Taxable Value</Text>
              <Text style={[s.taxTableHeaderTxt, s.taxColAmount]}>Tax Amount</Text>
            </View>

            <View style={s.taxTableRow}>
              <Text style={[s.taxTableTxt, s.taxColDesc]}>CGST</Text>
              <Text style={[s.taxTableTxt, s.taxColRate]}>
                {cgstRate}%
              </Text>
              <Text style={[s.taxTableTxt, s.taxColTaxable]}>
                {fmt(taxableAmount)}
              </Text>
              <Text style={[s.taxTableTxt, s.taxColAmount]}>
                {fmt(cgstAmount)}
              </Text>
            </View>

            <View style={s.taxTableRow}>
              <Text style={[s.taxTableTxt, s.taxColDesc]}>SGST</Text>
              <Text style={[s.taxTableTxt, s.taxColRate]}>
                {sgstRate}%
              </Text>
              <Text style={[s.taxTableTxt, s.taxColTaxable]}>
                {fmt(taxableAmount)}
              </Text>
              <Text style={[s.taxTableTxt, s.taxColAmount]}>
                {fmt(sgstAmount)}
              </Text>
            </View>

            <View style={s.taxTableTotalRow}>
              <Text style={[s.taxTableTotalTxt, s.taxColDesc]}>
                Total Tax
              </Text>
              <Text style={[s.taxTableTotalTxt, s.taxColRate]}>
                —
              </Text>
              <Text style={[s.taxTableTotalTxt, s.taxColTaxable]}>
                {fmt(taxableAmount)}
              </Text>
              <Text style={[s.taxTableTotalTxt, s.taxColAmount]}>
                {fmt(data.taxAmount)}
              </Text>
            </View>
          </View>

          {/* Invoice Totals */}
          <View style={s.totalsBox}>
            <View style={[s.hr, { marginTop: 4, marginBottom: 6 }]} />

            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{fmt(data.subtotal)}</Text>
            </View>

            {data.adjustments
              .filter(adj => adj.kind !== 'tax')
              .map((adj, i) => (
                <View key={i} style={s.totalsRow}>
                  <Text
                    style={[
                      s.totalsLabel,
                      adj.amount < 0 ? s.totalsDiscount : {},
                    ]}
                  >
                    {adjustmentLabel(adj)}
                  </Text>

                  <Text
                    style={[
                      s.totalsValue,
                      adj.amount < 0 ? s.totalsDiscount : {},
                    ]}
                  >
                    {adj.amount < 0
                      ? `-${fmt(Math.abs(adj.amount))}`
                      : fmt(adj.amount)}
                  </Text>
                </View>
              ))}

            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Taxable Amount</Text>
              <Text style={s.totalsValue}>{fmt(taxableAmount)}</Text>
            </View>

            {cgstAmount > 0 && (
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>CGST</Text>
                <Text style={s.totalsValue}>{fmt(cgstAmount)}</Text>
              </View>
            )}

            {sgstAmount > 0 && (
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST</Text>
                <Text style={s.totalsValue}>{fmt(sgstAmount)}</Text>
              </View>
            )}

            <View style={s.totalsFinalRow}>
              <Text style={s.totalsFinalLabel}>Total Amount</Text>
              <Text style={s.totalsFinalValue}>
                {fmt(data.totalAmount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ---- Payments ---- */}
        {data.payments.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <View style={s.hr} />

            <Text style={s.paymentsTitle}>Payment Details</Text>

            {data.payments.map((p, i) => (
              <View key={i} style={s.paymentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.payMethod}>
                    {capitalize(p.method)}
                  </Text>

                  {p.transactionId && (
                    <Text style={s.payTxn}>
                      Ref: {p.transactionId}
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text
                    style={[
                      s.payStatus,
                      p.status === 'completed'
                        ? s.payStatusPaid
                        : s.payStatusPend,
                    ]}
                  >
                    {capitalize(p.status)}
                  </Text>

                  <Text style={s.payAmt}>
                    {fmt(p.amount)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ---- Declaration and Authorized Signatory ---- */}
        <View style={s.signatureSection}>
          <View style={s.declarationBox}>
            <Text style={s.declarationTitle}>Declaration</Text>

            <Text style={s.declarationText}>
              We declare that this invoice shows the actual price of the services
              described and that all particulars are true and correct.
            </Text>

            <Text style={s.declarationText}>
              This is a computer-generated tax invoice.
            </Text>
          </View>

          <View style={s.signatoryBox}>
            <Text style={s.signatoryCompany}>
              For {data.supplierName || 'Laundrease Services Pvt. Ltd.'}
            </Text>

            {data.signatureImage ? (
              <Image
                src={data.signatureImage}
                style={s.signatureImage}
              />
            ) : (
              <View style={s.digitalSignatureBox}>
                <Text style={s.digitalSignatureText}>
                  Digitally Signed
                </Text>
              </View>
            )}

            <Text style={s.authorizedSignatory}>
              Authorized Signatory
            </Text>

            {data.authorizedSignatoryName && (
              <Text style={s.signatoryName}>
                {data.authorizedSignatoryName}
              </Text>
            )}
          </View>
        </View>

        {/* ---- Footer ---- */}
        <View style={s.footer}>
          <View style={s.footerLeft}>
            <Text style={s.footerThank}>
              Thank you for choosing Laundrease!
            </Text>

            <Text style={s.footerSub}>
              For queries: support@laundrease.in  |  +91 98765 43210
            </Text>

            <Text style={s.footerSub}>
              www.laundrease.in  |  Pimpri-Chinchwad & Pune
            </Text>
          </View>

          <View style={s.footerRight}>
            <Text style={s.footerSmall}>
              Generated on {new Date().toLocaleDateString('en-IN')}
            </Text>

            <Text style={s.footerSmall}>
              Invoice: INV-{data.orderNumber}
            </Text>
          </View>
        </View>

        <Text style={s.footerNote}>
          This invoice contains supplier details, recipient details, place of supply,
          service accounting code, tax breakdown, and authorized signatory details.
        </Text>
      </Page>
    </Document>
  )
}