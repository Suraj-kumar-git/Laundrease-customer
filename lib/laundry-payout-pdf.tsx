// lib/laundry-payout-pdf.tsx
// Renders the itemized provider payout statement PDF. Structurally follows
// lib/invoice-pdf.tsx (header/summary-box/table/totals/GST-box/footer
// pattern) rather than the generic single-line lib/payslip-pdf.tsx — a
// payout statement needs an itemized order table and a GST breakdown, which
// the generic payslip template doesn't have.

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, DocumentProps } from '@react-pdf/renderer'

export interface PayoutStatementOrderRow {
  orderNumber:          string
  deliveredAt:          string
  subtotal:             number
  taxAmount:             number   // provider's own service-price GST, already embedded in subtotal
  deliveryFeeIncluded:   number
  commissionDeducted:    number
  claimDeduction:        number
  orderAmount:           number   // subtotal + deliveryFeeIncluded — this order's gross contribution
  paymentMethod:         string
}

export interface PayoutStatementData {
  useLogo: boolean
  businessName: string
  panNumber:    string | null
  bankAccountNumber: string | null
  bankIfscCode:      string | null
  bankAccountHolder: string | null
  upiId:             string | null

  periodStart: string
  periodEnd:   string
  status:      string
  paymentMethod:    string | null
  paymentReference: string | null
  paidAt:           string | null

  orders: PayoutStatementOrderRow[]

  grossOrderAmount: number   // SUM(orderAmount) — subtotal + provider-owned delivery fee, across all orders
  commissionAmount: number
  commissionRate:   number
  commissionType:   'percent' | 'flat'
  claimDeduction:   number   // total claims deducted (adjustments)
  claimNote:        string | null
  netPayable:       number

  generatedAt: string
}

const BLUE = '#3b82f6'
const GRAY1 = '#111827'
const GRAY2 = '#374151'
const GRAY3 = '#6b7280'
const GRAY4 = '#e5e7eb'
const GREEN = '#059669'
const RED = '#dc2626'
const WHITE = '#ffffff'
const logoUrl = process.env.NEXT_PUBLIC_S3_LOGO_URL
  || `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/laundrease-logo.PNG`

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: GRAY2, paddingHorizontal: 40, paddingVertical: 40, backgroundColor: WHITE },
  logoImage: { width: 120, height: 40, objectFit: 'contain' },
  logoTextFallback: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BLUE },
  logoTag: { fontSize: 7.5, color: GRAY3, marginTop: 2 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 4 },
  meta: { fontSize: 8, color: GRAY3, marginBottom: 2 },
  metaVal: { fontSize: 8, color: GRAY2, fontFamily: 'Helvetica-Bold' },

  hrThick: { borderBottomWidth: 2, borderBottomColor: BLUE, marginVertical: 14 },
  hr: { borderBottomWidth: 1, borderBottomColor: GRAY4, marginVertical: 10 },

  twoCol: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  box: { flex: 1, backgroundColor: '#fafafa', borderRadius: 6, padding: 12, borderWidth: 1, borderColor: GRAY4 },
  boxLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  boxName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 3 },
  boxLine: { fontSize: 8, color: GRAY2, marginBottom: 2, lineHeight: 1.4 },

  statusBadge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  statusPaid: { backgroundColor: '#d1fae5' },
  statusPending: { backgroundColor: '#fef3c7' },
  statusBadgeTxt: { fontSize: 7, fontFamily: 'Helvetica-Bold' },

  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 6 },

  tableHeader: { flexDirection: 'row', backgroundColor: BLUE, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 7, marginBottom: 2 },
  tableHeaderTxt: { fontSize: 6.8, color: WHITE, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: GRAY4 },
  tableRowAlt: { backgroundColor: '#f9fafb' },
  tableTxt: { fontSize: 7.5, color: GRAY2 },
  colOrder: { flex: 1.5 },
  colDate: { flex: 1.2 },
  colSubtotal: { flex: 1, textAlign: 'right' },
  colDelivery: { flex: 1, textAlign: 'right' },
  colCommission: { flex: 1, textAlign: 'right' },
  colClaim: { flex: 1, textAlign: 'right' },
  colNet: { flex: 1.1, textAlign: 'right' },

  totalsWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, alignItems: 'flex-start' },
  taxBox: { flex: 1, marginRight: 20 },
  taxTableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: GRAY4, borderBottomWidth: 0 },
  taxTableHeaderTxt: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: GRAY1 },
  taxTableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: GRAY4, borderTopWidth: 0 },
  taxTableTxt: { fontSize: 8, color: GRAY2 },
  taxColDesc: { flex: 1.5 },
  taxColAmount: { flex: 1, textAlign: 'right' },

  totalsBox: { width: 220 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel: { fontSize: 8.5, color: GRAY3 },
  totalsValue: { fontSize: 8.5, color: GRAY2 },
  totalsDeduction: { color: RED },
  totalsFinalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BLUE, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 7, marginTop: 4 },
  totalsFinalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },
  totalsFinalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },

  footer: { marginTop: 28, borderTopWidth: 1, borderTopColor: GRAY4, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerThank: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BLUE, marginBottom: 3 },
  footerSub: { fontSize: 7.5, color: GRAY3, lineHeight: 1.5 },
  footerRight: { alignItems: 'flex-end' },
  footerSmall: { fontSize: 7, color: GRAY3, marginBottom: 1 },
  footerNote: { fontSize: 7, color: GRAY4, marginTop: 6, textAlign: 'center' },
})

function fmt(n: number) {
  return `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function capitalize(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type Props = DocumentProps & { data: PayoutStatementData }

export const PayoutStatementDocument: React.FC<Props> = ({ data, ...docProps }) => {
  // GST breakdown across the payout's orders — same reverse-derivation
  // lib/order-invoice.ts already uses per order (taxableValue = subtotal -
  // taxAmount), just aggregated. Purely informational: this is the
  // provider's own already-embedded service-price GST, not an additional
  // charge — nothing here changes net_payable.
  const totalSubtotal = data.orders.reduce((sum, o) => sum + o.subtotal, 0)
  const totalTax = data.orders.reduce((sum, o) => sum + o.taxAmount, 0)
  const taxableValue = Math.max(0, totalSubtotal - totalTax)
  const totalDeliveryFee = data.orders.reduce((sum, o) => sum + o.deliveryFeeIncluded, 0)

  return (
    <Document title={`Payout Statement - ${data.businessName}`} author="Laundrease" subject="Provider Payout Statement" {...docProps}>
      <Page size="A4" style={s.page}>

        {/* ---- Header ---- */}
        <View style={s.header}>
          <View>
            {data.useLogo ? (
              <Image src={logoUrl} style={s.logoImage} />
            ) : (
              <>
                <Text style={s.logoTextFallback}>Laundrease</Text>
                <Text style={s.logoTag}>Professional Laundry & Dry Cleaning</Text>
              </>
            )}
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>PAYOUT STATEMENT</Text>
            <Text style={s.meta}>Period: <Text style={s.metaVal}>{fmtDate(data.periodStart)} – {fmtDate(data.periodEnd)}</Text></Text>
            <Text style={s.meta}>Orders: <Text style={s.metaVal}>{data.orders.length}</Text></Text>
            <View style={[s.statusBadge, data.status === 'paid' ? s.statusPaid : s.statusPending]}>
              <Text style={s.statusBadgeTxt}>{capitalize(data.status)}</Text>
            </View>
          </View>
        </View>

        <View style={s.hrThick} />

        {/* ---- Provider + Payment ---- */}
        <View style={s.twoCol}>
          <View style={s.box}>
            <Text style={s.boxLabel}>Provider</Text>
            <Text style={s.boxName}>{data.businessName}</Text>
            <Text style={s.boxLine}>PAN: {data.panNumber || '—'}</Text>
            <Text style={s.boxLine}>Bank: {data.bankAccountHolder || '—'} {data.bankAccountNumber ? `(···${data.bankAccountNumber.slice(-4)}, ${data.bankIfscCode})` : ''}</Text>
            {data.upiId && <Text style={s.boxLine}>UPI: {data.upiId}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Payment</Text>
            {data.status === 'paid' ? (
              <>
                <Text style={s.boxLine}>Method: {data.paymentMethod ? capitalize(data.paymentMethod) : '—'}</Text>
                <Text style={s.boxLine}>Reference: {data.paymentReference || '—'}</Text>
                <Text style={s.boxLine}>Paid on: {data.paidAt ? fmtDate(data.paidAt) : '—'}</Text>
              </>
            ) : (
              <Text style={s.boxLine}>Not yet paid — this statement reflects orders accumulated so far this cycle.</Text>
            )}
          </View>
        </View>

        {/* ---- Itemized Orders ---- */}
        <Text style={s.sectionTitle}>Orders in this payout</Text>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderTxt, s.colOrder]}>Order #</Text>
          <Text style={[s.tableHeaderTxt, s.colDate]}>Delivered</Text>
          <Text style={[s.tableHeaderTxt, s.colSubtotal]}>Subtotal</Text>
          <Text style={[s.tableHeaderTxt, s.colDelivery]}>Delivery Fee</Text>
          <Text style={[s.tableHeaderTxt, s.colCommission]}>Commission</Text>
          <Text style={[s.tableHeaderTxt, s.colClaim]}>Claim</Text>
          <Text style={[s.tableHeaderTxt, s.colNet]}>Line Net</Text>
        </View>
        {data.orders.length === 0 ? (
          <View style={s.tableRow}>
            <Text style={[s.tableTxt, { fontStyle: 'italic', color: GRAY3 }]}>No orders</Text>
          </View>
        ) : (
          data.orders.map((o, i) => (
            <View key={o.orderNumber} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableTxt, s.colOrder]}>#{o.orderNumber}</Text>
              <Text style={[s.tableTxt, s.colDate]}>{fmtDate(o.deliveredAt)}</Text>
              <Text style={[s.tableTxt, s.colSubtotal]}>{fmt(o.subtotal)}</Text>
              <Text style={[s.tableTxt, s.colDelivery]}>{o.deliveryFeeIncluded > 0 ? fmt(o.deliveryFeeIncluded) : '—'}</Text>
              <Text style={[s.tableTxt, s.colCommission]}>-{fmt(o.commissionDeducted)}</Text>
              <Text style={[s.tableTxt, s.colClaim, o.claimDeduction > 0 ? { color: RED } : {}]}>
                {o.claimDeduction > 0 ? `-${fmt(o.claimDeduction)}` : '—'}
              </Text>
              <Text style={[s.tableTxt, s.colNet]}>
                {fmt(round2(o.orderAmount - o.commissionDeducted - o.claimDeduction))}
              </Text>
            </View>
          ))
        )}

        {/* ---- Totals + GST breakdown ---- */}
        <View style={s.totalsWrap}>
          <View style={s.taxBox}>
            <Text style={s.sectionTitle}>GST Breakdown (provider's own service-price GST)</Text>
            <View style={s.taxTableHeader}>
              <Text style={[s.taxTableHeaderTxt, s.taxColDesc]}>Component</Text>
              <Text style={[s.taxTableHeaderTxt, s.taxColAmount]}>Amount</Text>
            </View>
            <View style={s.taxTableRow}>
              <Text style={[s.taxTableTxt, s.taxColDesc]}>Taxable Value</Text>
              <Text style={[s.taxTableTxt, s.taxColAmount]}>{fmt(taxableValue)}</Text>
            </View>
            <View style={s.taxTableRow}>
              <Text style={[s.taxTableTxt, s.taxColDesc]}>GST (already included in subtotal)</Text>
              <Text style={[s.taxTableTxt, s.taxColAmount]}>{fmt(totalTax)}</Text>
            </View>
            <View style={s.taxTableRow}>
              <Text style={[s.taxTableTxt, s.taxColDesc]}>Delivery fee pass-through</Text>
              <Text style={[s.taxTableTxt, s.taxColAmount]}>{fmt(totalDeliveryFee)}</Text>
            </View>
          </View>

          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Gross (subtotal + delivery fee)</Text>
              <Text style={s.totalsValue}>{fmt(data.grossOrderAmount)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={[s.totalsLabel, s.totalsDeduction]}>
                Commission ({data.commissionType === 'percent' ? `${data.commissionRate}%` : `₹${data.commissionRate}/order`})
              </Text>
              <Text style={[s.totalsValue, s.totalsDeduction]}>-{fmt(data.commissionAmount)}</Text>
            </View>
            {data.claimDeduction > 0 && (
              <View style={s.totalsRow}>
                <Text style={[s.totalsLabel, s.totalsDeduction]}>Item-protection claims</Text>
                <Text style={[s.totalsValue, s.totalsDeduction]}>-{fmt(data.claimDeduction)}</Text>
              </View>
            )}
            <View style={s.totalsFinalRow}>
              <Text style={s.totalsFinalLabel}>Net Payable</Text>
              <Text style={s.totalsFinalValue}>{fmt(data.netPayable)}</Text>
            </View>
          </View>
        </View>

        {data.claimNote && (
          <Text style={[s.footerSub, { marginTop: 8 }]}>{data.claimNote}</Text>
        )}

        {/* ---- Footer ---- */}
        <View style={s.footer}>
          <View>
            <Text style={s.footerThank}>Thank you for partnering with Laundrease!</Text>
            <Text style={s.footerSub}>For queries: support@laundrease.in</Text>
          </View>
          <View style={s.footerRight}>
            <Text style={s.footerSmall}>Generated on {fmtDate(data.generatedAt)}</Text>
          </View>
        </View>

        <Text style={s.footerNote}>
          This statement lists every order settled in this payout, the commission and item-protection
          deductions applied, and the resulting net amount payable.
        </Text>
      </Page>
    </Document>
  )
}

function round2(n: number) { return Math.round(n * 100) / 100 }
