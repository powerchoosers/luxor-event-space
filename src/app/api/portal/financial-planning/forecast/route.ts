import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { loadLuxorExpenseManagementData } from '@/lib/luxorExpensesServer'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview } from '@/lib/luxorFinanceReporting'
import { planningDatedFlows } from '@/lib/luxorFinancialPlanningForecast'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import type { LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'

export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
    const [ledgerResponse, sourceResponse, management] = await Promise.all([ledgers(request), sources(), loadLuxorExpenseManagementData({ generate: false })])
    if (!ledgerResponse.ok || !sourceResponse.ok) throw new Error('Financial sources unavailable')
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
    const business = getLuxorBusinessFinanceRows({ bookings, invoices, expenses: management.expenses, testInquiryIds, testBookingIds: new Set() })
    const known = new Set(bookings.map((row) => row.id.toLowerCase()))
    if ([...management.expenses, ...invoices, ...payments, ...installments, ...refunds].some((row) => row.booking_id && !known.has(row.booking_id.toLowerCase()))) throw new Error('A linked booking could not be classified')
    const excludedBillIds = new Set(management.expenses.filter((row) => row.source_bill_id && !business.expenses.includes(row)).map((row) => row.source_bill_id))
    const now = new Date()
    const today = chicagoCalendarDate(now)
    const revenue = getLuxorFinanceOverview({ bookings: business.bookings, invoices: business.invoices, payments, installments, refunds, allocations: Array.isArray(source.allocations) ? source.allocations as LuxorFinanceAllocationRow[] : null, testInquiryIds: business.testInquiryIds, testBookingIds: business.testBookingIds, testInvoiceIds: business.testInvoiceIds, now })
    const result = planningDatedFlows({ today, revenue, expenses: business.expenses, bills: management.bills.filter((bill) => !excludedBillIds.has(bill.id)), templates: management.templates })
    // These records do not cover every bank movement or ungenerated obligation.
    // Known flows are useful, but an ending cash balance would imply completeness.
    return NextResponse.json({ today, flows: result.flows, inflowAvailable: result.inflowAvailable, outflowAvailable: result.outflowAvailable, sourceComplete: false, issues: [...result.issues, 'This forecast covers recorded schedules and expenses only; other cash movements are not connected.'] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Forecast sources could not be verified.' }, { status: 503 })
  }
}
