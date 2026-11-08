import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { GET as expenses } from '@/app/api/expenses/route'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview, inspectLuxorFinanceOverviewSources, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { getEventProfitability, getEventCashMonths } from '@/lib/luxorEventProfitability'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { loadAllExpenseReceipts } from '@/lib/luxorExpensesServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import type { LuxorExpenseRecord } from '@/lib/luxorExpenseTypes'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    // Both existing loaders enforce portal finance access and fail closed.
    const [ledgerResponse, sourceResponse, expenseResponse] = await Promise.all([ledgers(request), sources(), expenses(new NextRequest(new URL('/api/expenses?strictMetrics=1', request.url), { headers: request.headers }))])
    if (!ledgerResponse.ok) return NextResponse.json({ error: 'Financial records could not be verified.' }, { status: ledgerResponse.status })
    const data = await ledgerResponse.json() as { bookings: LuxorBooking[]; invoices: LuxorInvoice[]; payments: LuxorPayment[]; installments: LuxorPaymentInstallment[]; refunds: LuxorPaymentRefundView[]; expenses: LuxorExpenseRecord[] }
    if (!expenseResponse.ok) throw new Error('Expense records unavailable')
    data.expenses = await expenseResponse.json() as LuxorExpenseRecord[]
    if (![data.bookings, data.invoices, data.payments, data.installments, data.refunds, data.expenses].every(Array.isArray)) throw new Error('Incomplete ledger')
    const source = sourceResponse.ok ? await sourceResponse.json() as { allocations?: LuxorFinanceAllocationRow[] | null } : null
    const testInquiryIds = await getVerifiedTestInquiryIds([...data.bookings, ...data.invoices, ...data.payments, ...data.refunds].map((row) => row.inquiry_id).filter((id): id is string => Boolean(id)))
    testInquiryIds.add(LUXOR_PERMANENT_TEST_LEAD_ID)
    const testBookingIds = new Set(data.bookings.filter((booking) => booking.metadata?.is_test_record === true || Boolean(booking.inquiry_id && testInquiryIds.has(booking.inquiry_id))).map((booking) => booking.id))
    const business = getLuxorBusinessFinanceRows({ bookings: data.bookings, invoices: data.invoices, expenses: data.expenses, testInquiryIds, testBookingIds })
    const overview = getLuxorFinanceOverview({ bookings: business.bookings, invoices: business.invoices, payments: data.payments, installments: data.installments, refunds: data.refunds, testInquiryIds: business.testInquiryIds, testBookingIds: business.testBookingIds, testInvoiceIds: business.testInvoiceIds, allocations: Array.isArray(source?.allocations) ? source.allocations : null })
    const sourceCheck = inspectLuxorFinanceOverviewSources({ invoices: business.invoices, payments: data.payments.filter((row) => !business.testBookingIds.has((row.booking_id || '').toLowerCase()) && !business.testInquiryIds.has((row.inquiry_id || '').toLowerCase()) && !business.testInvoiceIds.has((row.invoice_id || '').toLowerCase())), installments: data.installments, allocations: Array.isArray(source?.allocations) ? source.allocations : null })
    const obligationsVerified = !sourceCheck.issues.some((issue) => /invoice identity|multiple accepted master|invalid accepted contract/i.test(issue))
    const invoiceBooking = new Map(business.invoices.map((invoice) => [invoice.id, invoice.booking_id]))
    const refundReviewBookingIds = new Set<string>()
    let unidentifiedRefund = false
    for (const refund of overview.reportingRows.refunds) {
      if (refund.status !== 'pending' && refund.status !== 'uncertain') continue
      const invoiceBookingId = refund.invoice_id ? invoiceBooking.get(refund.invoice_id) : null
      if (refund.booking_id) refundReviewBookingIds.add(refund.booking_id)
      if (invoiceBookingId) refundReviewBookingIds.add(invoiceBookingId)
      if (!refund.booking_id && !invoiceBookingId) unidentifiedRefund = true
    }
    const eventRows = getEventProfitability({ bookings: business.bookings, expenses: business.expenses, acceptedInvoiceRows: overview.reportingRows.acceptedInvoiceRows, eventPaymentRows: overview.reportingRows.eventPaymentRows, obligationsVerified, collectionsVerified: overview.actualByMonth !== null && overview.unallocatedPayments === 0 && !unidentifiedRefund, expensesVerified: expenseResponse.headers.get('X-Luxor-Expense-History') !== 'legacy-only', refundReviewBookingIds })
    // The receipt reader is finance-authorized by the ledger loader above.
    // Missing document metadata must not be mistaken for an empty library.
    const receiptResult = await Promise.allSettled([loadAllExpenseReceipts()])
    const receipts = receiptResult[0].status === 'fulfilled' ? receiptResult[0].value : null
    const linkedTo = (record: { booking_id: string | null; invoice_id: string | null }, bookingId: string) => record.booking_id === bookingId || (!record.booking_id && Boolean(record.invoice_id && invoiceBooking.get(record.invoice_id) === bookingId))
    const events = eventRows.map((event) => ({ ...event, cashMonths: getEventCashMonths(event, overview.reportingRows.eventPaymentRows), receipts: receipts === null ? null : receipts.filter((receipt) => receipt.expense_id && event.expenseRecords.some((expense) => expense.id === receipt.expense_id)).map((receipt) => ({ id: receipt.id, expenseId: receipt.expense_id, fileName: receipt.file_name })), proposal: (() => {
      const invoice = overview.reportingRows.acceptedInvoiceRows.find((row) => row.invoice.id === event.invoiceId)?.invoice
      return invoice ? { originalTotal: invoice.original_total ?? null, discountAmount: invoice.discount_amount ?? null, lines: (invoice.line_items || []).map((line) => ({ description: line.description, total: line.total, role: line.pricingRole || null, bucket: line.paymentBucket || null, classification: line.costClassification || null })) } : null
    })(), activity: [
      ...overview.reportingRows.payments.filter((payment) => linkedTo(payment, event.booking.id)).map((payment) => ({ id: payment.id, kind: 'Payment', amount: payment.amount, date: payment.received_date || payment.paid_at, status: payment.status, note: [payment.payment_method, payment.processor_reference, 'Recorded payment; may include a refundable security deposit.'].filter(Boolean).join(' · ') })),
      ...overview.reportingRows.refunds.filter((refund) => linkedTo(refund, event.booking.id)).map((refund) => ({ id: refund.id, kind: 'Refund', amount: refund.amount, date: refund.completed_at || refund.requested_at, status: refund.status, note: refund.refund_kind.replaceAll('_', ' ') })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')) }))
    return NextResponse.json({ events, issues: overview.issues }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Financial records could not be verified. Refresh to retry.' }, { status: 503 })
  }
}
