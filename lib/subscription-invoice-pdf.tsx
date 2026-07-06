// lib/subscription-invoice-pdf.tsx
// React-PDF document for subscription payment invoices.
// Follows the same conventions as lib/invoice-pdf.tsx:
//   - Logo image from env var, text fallback if missing
//   - "Rs " prefix instead of rupee symbol (renders correctly in Helvetica)
//   - No emojis, arrows, or other non-ASCII glyphs

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, DocumentProps } from '@react-pdf/renderer'

export interface SubscriptionInvoiceData {
  invoiceNumber:    string
  invoiceDate:      string
  planName:         string
  planTagline:      string | null
  amountPaid:       number
  isTrial:          boolean
  startsAt:         string
  endsAt:           string
  transactionId:    string | null
  gateway:          string | null
  gatewayOrderId:   string | null
  providerName:     string
  providerEmail:    string
  providerPhone:    string | null
  providerAddress:  string | null
  commissionType:   string
  commissionValue:  string
}

const logoUrl = process.env.NEXT_PUBLIC_S3_LOGO_URL
  || `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/laundrease-logo.PNG`

const c = {
  brand:  '#7c3aed',
  dark:   '#111827',
  mid:    '#374151',
  light:  '#6b7280',
  border: '#e5e7eb',
  bg:     '#f9fafb',
  white:  '#ffffff',
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, color: c.mid, padding: 40, backgroundColor: c.white },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  logoImage:   { width: 120, height: 40, objectFit: 'contain' },
  logoText:    { fontSize: 20, fontFamily: 'Helvetica-Bold', color: c.brand },
  logoSub:     { fontSize: 7.5, color: c.light, marginTop: 2 },
  metaBlock:   { alignItems: 'flex-end' },
  metaTitle:   { fontSize: 16, fontFamily: 'Helvetica-Bold', color: c.dark },
  metaLine:    { fontSize: 8, color: c.light, marginTop: 2 },
  hr:          { borderBottomWidth: 1, borderBottomColor: c.border, marginVertical: 14 },
  hrAccent:    { borderBottomWidth: 2, borderBottomColor: c.brand, marginVertical: 14 },
  twoCol:      { flexDirection: 'row', gap: 20, marginBottom: 16 },
  col:         { flex: 1 },
  colLabel:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: c.light, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  colLine:     { fontSize: 9, color: c.dark, marginBottom: 2 },
  colSub:      { fontSize: 8, color: c.light, marginBottom: 2 },
  planBanner:  { backgroundColor: c.brand, borderRadius: 5, padding: 12, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: c.white },
  planTagline: { fontSize: 8, color: '#ddd6fe', marginTop: 2 },
  planPeriod:  { fontSize: 8, color: '#ddd6fe', marginTop: 4 },
  planAmt:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: c.white },
  planAmtSub:  { fontSize: 8, color: '#ddd6fe', textAlign: 'right' },
  table:       { marginBottom: 14 },
  tHead:       { flexDirection: 'row', backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
  tRow:        { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.border },
  th:          { fontSize: 7, fontFamily: 'Helvetica-Bold', color: c.light, textTransform: 'uppercase', letterSpacing: 0.5 },
  td:          { fontSize: 8.5, color: c.dark },
  tdSub:       { fontSize: 8, color: c.light, marginTop: 2 },
  colDesc:     { flex: 3 },
  colAmt:      { flex: 1, textAlign: 'right' },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: c.brand, borderRadius: 4, marginTop: 4 },
  totalLabel:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.white, flex: 1, textAlign: 'right', marginRight: 12 },
  totalAmt:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: c.white },
  txBlock:     { backgroundColor: c.bg, borderRadius: 4, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: c.border },
  txLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: c.light, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  txRow:       { flexDirection: 'row', marginBottom: 2 },
  txKey:       { fontSize: 8, color: c.light, width: 90 },
  txVal:       { fontSize: 8, color: c.dark, flex: 1 },
  footer:      { marginTop: 'auto', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerNote:  { fontSize: 7.5, color: c.light, flex: 1 },
  footerBrand: { fontSize: 8, color: c.brand, fontFamily: 'Helvetica-Bold' },
})

function fmt(n: number) {
  return `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function gatewayLabel(g: string | null) {
  if (!g) return 'Online payment'
  const map: Record<string, string> = { payu: 'PayU', razorpay: 'Razorpay', cashfree: 'Cashfree' }
  return map[g] ?? g
}

type SubscriptionInvoiceDocumentProps = DocumentProps & { data: SubscriptionInvoiceData }

export function SubscriptionInvoiceDocument({ data, ...docProps }: SubscriptionInvoiceDocumentProps) {
  const commissionStr = data.commissionType === 'percent'
    ? `${data.commissionValue}% per order`
    : `Rs ${data.commissionValue} per order`

  return (
    <Document title={`Subscription Invoice ${data.invoiceNumber}`} {...docProps}>
      <Page size="A4" style={s.page}>

        {/* Header — logo + invoice metadata */}
        <View style={s.header}>
          <View>
            <Image src={logoUrl} style={s.logoImage}/>
            <Text style={s.logoSub}>Partner Subscription Invoice</Text>
          </View>
          <View style={s.metaBlock}>
            <Text style={s.metaTitle}>INVOICE</Text>
            <Text style={s.metaLine}>No: {data.invoiceNumber}</Text>
            <Text style={s.metaLine}>Date: {fmtDate(data.invoiceDate)}</Text>
          </View>
        </View>

        <View style={s.hrAccent}/>

        {/* Parties */}
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.colLabel}>From</Text>
            <Text style={[s.colLine, { fontFamily: 'Helvetica-Bold' }]}>Laundrease Technologies Pvt. Ltd.</Text>
            <Text style={s.colSub}>support@laundrease.com</Text>
            <Text style={s.colSub}>www.laundrease.com</Text>
          </View>
          <View style={s.col}>
            <Text style={s.colLabel}>Billed To</Text>
            <Text style={[s.colLine, { fontFamily: 'Helvetica-Bold' }]}>{data.providerName}</Text>
            <Text style={s.colSub}>{data.providerEmail}</Text>
            {data.providerPhone ? <Text style={s.colSub}>{data.providerPhone}</Text> : null}
            {data.providerAddress ? <Text style={s.colSub}>{data.providerAddress}</Text> : null}
          </View>
        </View>

        <View style={s.hr}/>

        {/* Plan banner */}
        <View style={s.planBanner}>
          <View>
            <Text style={s.planName}>{data.planName} Plan</Text>
            {data.planTagline ? <Text style={s.planTagline}>{data.planTagline}</Text> : null}
            <Text style={s.planPeriod}>
              {fmtDate(data.startsAt)} to {fmtDate(data.endsAt)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.planAmt}>{data.isTrial ? 'FREE' : fmt(data.amountPaid)}</Text>
            <Text style={s.planAmtSub}>Amount paid</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={s.table}>
          <View style={s.tHead}>
            <Text style={[s.th, s.colDesc]}>Description</Text>
            <Text style={[s.th, s.colAmt]}>Amount</Text>
          </View>
          <View style={s.tRow}>
            <View style={s.colDesc}>
              <Text style={s.td}>{data.planName} Subscription - 30-day cycle</Text>
              <Text style={s.tdSub}>Commission: {commissionStr} - Period: {fmtDate(data.startsAt)} to {fmtDate(data.endsAt)}</Text>
            </View>
            <Text style={[s.td, s.colAmt]}>
              {data.isTrial ? 'Free trial' : fmt(data.amountPaid)}
            </Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Paid</Text>
            <Text style={s.totalAmt}>{data.isTrial ? 'Rs 0.00' : fmt(data.amountPaid)}</Text>
          </View>
        </View>

        {/* Payment details */}
        {(data.transactionId || data.gatewayOrderId) ? (
          <View style={s.txBlock}>
            <Text style={s.txLabel}>Payment Details</Text>
            <View style={s.txRow}>
              <Text style={s.txKey}>Gateway</Text>
              <Text style={s.txVal}>{gatewayLabel(data.gateway)}</Text>
            </View>
            {data.transactionId ? (
              <View style={s.txRow}>
                <Text style={s.txKey}>Transaction ID</Text>
                <Text style={s.txVal}>{data.transactionId}</Text>
              </View>
            ) : null}
            {data.gatewayOrderId && data.gatewayOrderId !== data.transactionId ? (
              <View style={s.txRow}>
                <Text style={s.txKey}>Order Ref</Text>
                <Text style={s.txVal}>{data.gatewayOrderId}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerNote}>
            This is a computer-generated invoice. No signature required.{'\n'}
            For support: support@laundrease.com
          </Text>
          <Text style={s.footerBrand}>Laundrease</Text>
        </View>

      </Page>
    </Document>
  )
}
