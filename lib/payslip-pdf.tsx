// lib/payslip-pdf.tsx
// Payslip PDF for admin/support staff — mirrors lib/invoice-pdf.tsx's
// layout conventions (palette, header style) so generated documents look
// consistent across the platform.

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, DocumentProps } from '@react-pdf/renderer'

export interface PayslipData {
  staffName: string
  role: string
  periodStart: string
  periodEnd: string
  amount: number
  note: string | null
  status: string
  panNumber: string | null
  bankAccountNumber: string | null
  bankIfscCode: string | null
  bankAccountHolder: string | null
  paymentMethod: string | null
  paymentReference: string | null
  paidAt: string | null
  generatedAt: string
}

const VIOLET = '#3b82f6'
const GRAY1 = '#111827'
const GRAY2 = '#374151'
const GRAY3 = '#6b7280'
const GRAY4 = '#e5e7eb'
const GREEN = '#059669'
const WHITE = '#ffffff'
const logoUrl = `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/laundrease-logo.PNG`

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: GRAY2, paddingHorizontal: 40, paddingVertical: 40, backgroundColor: WHITE },
  logoImage: { width: 120, height: 40, objectFit: 'contain' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 4 },
  metaLine: { fontSize: 8, color: GRAY3, marginBottom: 2 },
  metaVal: { fontFamily: 'Helvetica-Bold', color: GRAY2 },
  hrThick: { borderBottomWidth: 2, borderBottomColor: VIOLET, marginVertical: 14 },
  hr: { borderBottomWidth: 1, borderBottomColor: GRAY4, marginVertical: 14 },
  twoCol: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  box: { flex: 1, backgroundColor: '#fafafa', borderRadius: 6, padding: 12, borderWidth: 1, borderColor: GRAY4 },
  boxLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GRAY3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  boxName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 3 },
  boxLine: { fontSize: 8, color: GRAY2, marginBottom: 2, lineHeight: 1.4 },
  amountStrip: { backgroundColor: VIOLET, borderRadius: 8, padding: 16, marginBottom: 14, alignItems: 'center' },
  amountLabel: { fontSize: 8, color: WHITE, opacity: 0.85, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  amountValue: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: WHITE },
  statusBadge: { fontSize: 7.5, color: WHITE, marginTop: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GRAY1, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: GRAY4 },
  rowLabel: { fontSize: 8.5, color: GRAY3 },
  rowValue: { fontSize: 8.5, color: GRAY1, fontFamily: 'Helvetica-Bold' },
  noteBox: { backgroundColor: '#fffbeb', borderRadius: 6, borderWidth: 1, borderColor: '#fde68a', padding: 10, marginTop: 14 },
  noteText: { fontSize: 8, color: '#78350f', lineHeight: 1.5 },
  footer: { marginTop: 28, borderTopWidth: 1, borderTopColor: GRAY4, paddingTop: 14, alignItems: 'center' },
  footerNote: { fontSize: 7, color: GRAY4, textAlign: 'center', lineHeight: 1.5 },
})

function fmt(n: number) {
  return `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function capitalize(str: string) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function maskAccount(acct: string | null) {
  if (!acct) return '—'
  return acct.length > 4 ? `••••${acct.slice(-4)}` : acct
}

type PayslipDocumentProps = DocumentProps & { data: PayslipData }
export const PayslipDocument: React.FC<PayslipDocumentProps> = ({ data, ...docProps }) => {
  const isPaid = data.status === 'paid'

  return (
    <Document title={`Payslip - ${data.staffName} - ${fmtDate(data.periodEnd)}`} author="Laundrease" subject="Staff Payslip" {...docProps}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Image src={logoUrl} style={s.logoImage} />
          <View style={s.titleBox}>
            <Text style={s.title}>PAYSLIP</Text>
            <Text style={s.metaLine}>Period: <Text style={s.metaVal}>{fmtDate(data.periodStart)} – {fmtDate(data.periodEnd)}</Text></Text>
            <Text style={s.metaLine}>Generated: <Text style={s.metaVal}>{fmtDate(data.generatedAt)}</Text></Text>
          </View>
        </View>

        <View style={s.hrThick} />

        <View style={s.twoCol}>
          <View style={s.box}>
            <Text style={s.boxLabel}>Employer</Text>
            <Text style={s.boxName}>Laundrease Services Pvt. Ltd.</Text>
            <Text style={s.boxLine}>Pimpri-Chinchwad, Pune - 411018</Text>
            <Text style={s.boxLine}>support@laundrease.in</Text>
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Employee</Text>
            <Text style={s.boxName}>{data.staffName}</Text>
            <Text style={s.boxLine}>Role: {capitalize(data.role)}</Text>
            <Text style={s.boxLine}>PAN: {data.panNumber || '—'}</Text>
          </View>
        </View>

        <View style={s.amountStrip}>
          <Text style={s.amountLabel}>Net Amount</Text>
          <Text style={s.amountValue}>{fmt(data.amount)}</Text>
          <Text style={s.statusBadge}>{isPaid ? 'PAID' : capitalize(data.status).toUpperCase()}</Text>
        </View>

        <Text style={s.sectionTitle}>Payment Details</Text>
        <View style={s.row}>
          <Text style={s.rowLabel}>Bank account holder</Text>
          <Text style={s.rowValue}>{data.bankAccountHolder || '—'}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Account number</Text>
          <Text style={s.rowValue}>{maskAccount(data.bankAccountNumber)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>IFSC</Text>
          <Text style={s.rowValue}>{data.bankIfscCode || '—'}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Payment method</Text>
          <Text style={s.rowValue}>{data.paymentMethod ? capitalize(data.paymentMethod) : '—'}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Payment reference</Text>
          <Text style={s.rowValue}>{data.paymentReference || '—'}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowLabel}>Paid on</Text>
          <Text style={s.rowValue}>{fmtDate(data.paidAt)}</Text>
        </View>

        {data.note && (
          <View style={s.noteBox}>
            <Text style={s.noteText}>{data.note}</Text>
          </View>
        )}

        <View style={s.footer}>
          <Text style={s.footerNote}>
            This is a system-generated payslip and does not require a physical signature.{'\n'}
            Laundrease Services Pvt. Ltd. — support@laundrease.in
          </Text>
        </View>
      </Page>
    </Document>
  )
}
