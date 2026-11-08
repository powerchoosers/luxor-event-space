import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { GET as expenses } from '@/app/api/expenses/route'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { getEventProfitability } from '@/lib/luxorEventProfitability'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
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
    const events = getEventProfitability({ bookings: business.bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed'), expenses: business.expenses, acceptedInvoiceRows: overview.reportingRows.acceptedInvoiceRows, eventPaymentRows: overview.reportingRows.eventPaymentRows, obligationsVerified: overview.issues.length === 0, collectionsVerified: overview.actualByMonth !== null && overview.unallocatedPayments === 0 && overview.issues.length === 0, expensesVerified: expenseResponse.headers.get('X-Luxor-Expense-History') !== 'legacy-only' })
    return NextResponse.json({ events, issues: overview.issues }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Financial records could not be verified. Refresh to retry.' }, { status: 503 })
  }
}
