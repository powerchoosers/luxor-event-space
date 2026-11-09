import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { loadLuxorExpenseManagementData } from '@/lib/luxorExpensesServer'
import { getLuxorBusinessFinanceRows, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { buildLuxorBooksHealth } from '@/lib/luxorBooksHealth'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { LUXOR_EXPENSE_EXPORT_CONTRACT_VERIFIED } from '@/lib/luxorAccountantExportGate'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export const dynamic = 'force-dynamic'

async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  return member && member.status === 'active' && memberCan(member, 'finances') ? session : null
}

export async function GET(request: NextRequest) {
  if (!await authorize()) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  try {
    const [ledgerResponse, sourceResponse, management] = await Promise.all([ledgers(request), sources(), loadLuxorExpenseManagementData({ generate: false })])
    if (!ledgerResponse.ok || !sourceResponse.ok) throw new Error('Source unavailable')
    const ledger = await ledgerResponse.json()
    const source = await sourceResponse.json()
    if (![ledger.bookings, ledger.invoices, ledger.payments, ledger.installments, ledger.refunds].every(Array.isArray)) throw new Error('Incomplete ledger')
    const bookings = ledger.bookings as LuxorBooking[]
    const invoices = ledger.invoices as LuxorInvoice[]
    const payments = ledger.payments as LuxorPayment[]
    const installments = ledger.installments as LuxorPaymentInstallment[]
    const refunds = ledger.refunds as LuxorPaymentRefundView[]
    const inquiryIds = [...new Set([...bookings, ...invoices, ...payments, ...installments, ...refunds].map((row) => row.inquiry_id).filter((id): id is string => Boolean(id)))]
    const testInquiryIds = await getVerifiedTestInquiryIds(inquiryIds)
    testInquiryIds.add(LUXOR_PERMANENT_TEST_LEAD_ID)
    const businessRows = getLuxorBusinessFinanceRows({ bookings, invoices, expenses: management.expenses, testInquiryIds, testBookingIds: new Set() })
    const allBookingIds = new Set(bookings.map((row) => row.id.toLowerCase()))
    if ([...management.expenses, ...invoices, ...payments, ...installments, ...refunds].some((row) => row.booking_id && !allBookingIds.has(row.booking_id.toLowerCase()))) throw new Error('A linked booking could not be classified')
    const removedBillIds = new Set(management.expenses.filter((row) => row.source_bill_id && !businessRows.expenses.includes(row)).map((row) => row.source_bill_id))
    const expenses = businessRows.expenses.filter((row) => row.metadata?.is_test_record !== true)
    for (const row of businessRows.expenses) if (row.metadata?.is_test_record === true && row.source_bill_id) removedBillIds.add(row.source_bill_id)
    const bills = management.bills.filter((row) => !removedBillIds.has(row.id))
    const health = buildLuxorBooksHealth({
      bookings: businessRows.bookings,
      invoices: businessRows.invoices,
      payments,
      installments,
      refunds,
      allocations: Array.isArray(source.allocations) ? source.allocations as LuxorFinanceAllocationRow[] : null,
      expenses,
      bills,
      testInquiryIds: businessRows.testInquiryIds,
      testBookingIds: businessRows.testBookingIds,
      testInvoiceIds: businessRows.testInvoiceIds,
      expenseExportsVerified: LUXOR_EXPENSE_EXPORT_CONTRACT_VERIFIED,
      clientExportsVerified: true,
    })
    return NextResponse.json(health, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Books health could not be verified. Refresh to retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
