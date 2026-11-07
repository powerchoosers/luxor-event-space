import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { GET as invoices } from '@/app/api/invoices/route'
import { GET as bookings } from '@/app/api/bookings/route'
import { GET as expenses } from '@/app/api/expenses/route'
import { GET as payments } from '@/app/api/payments/route'
import { GET as installments } from '@/app/api/portal/payment-installments/route'
import { GET as refunds } from '@/app/api/payments/refunds/route'
import { getLuxorBusinessFinanceRows, getLuxorInvoiceFinancialSummary } from '@/lib/luxorFinanceReporting'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const makeRequest = (path: string) => new NextRequest(new URL(path, request.url), { headers: request.headers })
  try {
    const [invoiceResponse, bookingResponse, expenseResponse, paymentResponse, installmentResponse, refundResponse] = await Promise.all([
      invoices(makeRequest('/api/invoices?strictMetrics=1')),
      bookings(makeRequest('/api/bookings?strictMetrics=1&financeRowsOnly=1')),
      expenses(makeRequest('/api/expenses?strictMetrics=1')),
      payments(makeRequest('/api/payments')),
      installments(makeRequest('/api/portal/payment-installments?strictMetrics=1')),
      refunds(makeRequest('/api/payments/refunds')),
    ])
    if (![invoiceResponse, bookingResponse, expenseResponse, paymentResponse, installmentResponse, refundResponse].every((response) => response.ok)) throw new Error('Financial records could not be loaded.')
    const [invoiceRows, bookingRows, expenseRows, paymentRows, installmentRows, refundRows] = await Promise.all([
      invoiceResponse.json(), bookingResponse.json(), expenseResponse.json(), paymentResponse.json(), installmentResponse.json(), refundResponse.json(),
    ])
    const rows = [invoiceRows, bookingRows, expenseRows, paymentRows, installmentRows, refundRows]
    if (!rows.every(Array.isArray)) throw new Error('Financial records could not be verified.')
    const verifiedInvoices = invoiceRows as LuxorInvoice[]
    const verifiedBookings = bookingRows as LuxorBooking[]
    const verifiedPayments = paymentRows as LuxorPayment[]
    const verifiedInstallments = installmentRows as LuxorPaymentInstallment[]
    const verifiedRefunds = refundRows as LuxorPaymentRefundView[]
    const testInquiryIds = await getVerifiedTestInquiryIds([
      ...verifiedInvoices.map((row) => row.inquiry_id),
      ...verifiedBookings.map((row) => row.inquiry_id),
      ...verifiedPayments.map((row) => row.inquiry_id),
      ...verifiedRefunds.map((row) => row.inquiry_id),
    ].filter((id): id is string => Boolean(id)))
    testInquiryIds.add(LUXOR_PERMANENT_TEST_LEAD_ID)
    const testBookingIds = new Set(verifiedBookings.filter((booking) => booking.metadata?.is_test_record === true
      || booking.inquiry_id === LUXOR_PERMANENT_TEST_LEAD_ID
      || Boolean(booking.inquiry_id && testInquiryIds.has(booking.inquiry_id))).map((booking) => booking.id))
    const businessRows = getLuxorBusinessFinanceRows({ invoices: verifiedInvoices, bookings: verifiedBookings, expenses: [], testInquiryIds, testBookingIds })
    const summary = getLuxorInvoiceFinancialSummary(
      businessRows.invoices,
      verifiedPayments,
      businessRows.testInquiryIds,
      businessRows.testBookingIds,
      verifiedInstallments,
      new Date(),
      businessRows.testInvoiceIds,
      verifiedRefunds,
      businessRows.bookings,
    )
    const eventPaymentsReceivedByBooking: Record<string, number> = {}
    for (const row of summary.eventPaymentRows) {
      if (!row.booking_id) continue
      eventPaymentsReceivedByBooking[row.booking_id] = Math.round(((eventPaymentsReceivedByBooking[row.booking_id] || 0) + row.amount) * 100) / 100
    }
    return NextResponse.json({
      invoices: verifiedInvoices,
      bookings: verifiedBookings,
      expenses: rows[2],
      payments: verifiedPayments,
      installments: verifiedInstallments,
      refunds: verifiedRefunds,
      eventPaymentsReceivedByBooking: summary.refundReconciliationRequired ? null : eventPaymentsReceivedByBooking,
      eventPaymentsVerified: !summary.refundReconciliationRequired,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Financial records could not be verified. Refresh to retry.' }, { status: 503 })
  }
}
