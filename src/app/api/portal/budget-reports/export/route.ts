import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { enumerateBudgetMonths, validBudgetMonth } from '@/lib/luxorBudgetMonthRange'
import { loadLuxorExpenseManagementData } from '@/lib/luxorExpensesServer'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export const dynamic = 'force-dynamic'

async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  return member && member.status === 'active' && memberCan(member, 'finances') ? session : null
}

export async function GET(request: NextRequest) {
  if (!await authorize()) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  if (!validBudgetMonth(from) || !validBudgetMonth(to)) {
    return NextResponse.json({ error: 'Choose a valid from and to month.' }, { status: 400 })
  }
  let months: string[]
  try {
    months = enumerateBudgetMonths(from, to, 24)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid range.' }, { status: 400 })
  }
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
    const revenue = getLuxorFinanceOverview({ bookings: businessRows.bookings, invoices: businessRows.invoices, payments, installments, refunds, allocations: Array.isArray(source.allocations) ? source.allocations as LuxorFinanceAllocationRow[] : null, testInquiryIds: businessRows.testInquiryIds, testBookingIds: businessRows.testBookingIds, testInvoiceIds: businessRows.testInvoiceIds })
    const budgetPath = `luxor_monthly_budgets?select=month,category,category_id,amount&month=gte.${from}-01&month=lte.${to}-01&order=month.asc,category.asc`
    const budgetCount = await supabaseRestCount(budgetPath)
    const targets = await supabaseRestStrict<Array<{ month: string; category: string; category_id: string; amount: number | string }>>(`${budgetPath}&limit=${budgetCount + 1}`)
    if (targets.length !== budgetCount) throw new Error('Budget targets changed while loading')
    const revenueTargets = await supabaseRestStrict<Array<{ month: string; amount: number | string }>>(`luxor_monthly_revenue_targets?select=month,amount&month=gte.${from}-01&month=lte.${to}-01&order=month.asc&limit=${months.length + 1}`).catch(() => null)
    if (revenueTargets && revenueTargets.some((row) => !validBudgetMonth(row.month.slice(0, 7)) || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0)) throw new Error('Revenue targets could not be verified')
    const today = chicagoCalendarDate(new Date())
    const budgetRows = targets.map((row) => ({ month: row.month.slice(0, 7), category: management.categories.find((category) => category.id === row.category_id)?.name || row.category, amount: Number(row.amount) }))
    const shared = { today, budgets: budgetRows, availableCategories: management.categories.filter((row) => row.is_active).map((row) => row.name), expenses, bills: management.bills.filter((row) => !removedBillIds.has(row.id)), revenue }
    const exportMonths = months.map((month) => {
    const revenueTargetRow = revenueTargets?.find((row) => row.month.slice(0, 7) === month)
    const report = getLuxorBudgetReport({
      ...shared,
      month,
      revenueTarget: revenueTargetRow ? Number(revenueTargetRow.amount) : null,
    })
    return {
      month,
      summary: report.summary,
      categories: report.categories.map((row) => ({
        category: row.category,
        target: row.target,
        actual: row.actual,
        remaining: row.remaining,
      })),
    }
  })
    return NextResponse.json({
      from,
      to,
      generatedAt: new Date().toISOString(),
      revenueTargetsAvailable: revenueTargets !== null,
      months: exportMonths,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Budget export unavailable:', error)
    return NextResponse.json({ error: 'The export could not be verified. Try again.' }, { status: 503 })
  }
}
