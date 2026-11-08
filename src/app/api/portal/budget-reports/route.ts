import { NextRequest, NextResponse } from 'next/server'
import { GET as ledgers } from '@/app/api/portal/finance-overview-ledgers/route'
import { GET as sources } from '@/app/api/portal/finance-overview-sources/route'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { loadLuxorExpenseManagementData } from '@/lib/luxorExpensesServer'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview } from '@/lib/luxorFinanceReporting'
import { getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import type { LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'

export const dynamic = 'force-dynamic'
const validMonth = (month: unknown): month is string => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 1900
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  return member && member.status === 'active' && memberCan(member, 'finances') ? session : null
}

export async function GET(request: NextRequest) {
  if (!await authorize()) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const month = request.nextUrl.searchParams.get('month')
  if (!validMonth(month)) return NextResponse.json({ error: 'Choose a valid month.' }, { status: 400 })
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
    const path = `luxor_monthly_budgets?select=month,category,category_id,amount&month=eq.${month}-01&order=category.asc`
    const count = await supabaseRestCount(path)
    const targets = await supabaseRestStrict<Array<{ month: string; category: string; category_id: string; amount: number | string }>>(`${path}&limit=${count + 1}`)
    if (targets.length !== count || await supabaseRestCount(path) !== count) throw new Error('Budget targets changed while loading')
    const report = getLuxorBudgetReport({ month, today: chicagoCalendarDate(new Date()), budgets: targets.map((row) => ({ month: row.month.slice(0, 7), category: management.categories.find((category) => category.id === row.category_id)?.name || row.category, amount: Number(row.amount) })), availableCategories: management.categories.filter((row) => row.is_active).map((row) => row.name), expenses, bills: management.bills.filter((row) => !removedBillIds.has(row.id)), revenue })
    return NextResponse.json({ report }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Budget report unavailable:', error)
    return NextResponse.json({ error: 'The report could not be verified. Refresh to try again.' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await authorize()
  if (!session) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const body = await request.json().catch(() => null) as { month?: unknown; category?: unknown; amount?: unknown } | null
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const amount = body?.amount
  if (!validMonth(body?.month) || !category || category.length > 100 || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return NextResponse.json({ error: 'Invalid budget target.' }, { status: 400 })
  try {
    const data = await loadLuxorExpenseManagementData({ generate: false })
    const categoryRow = data.categories.find((row) => row.is_active && row.name.toLocaleLowerCase() === category.toLocaleLowerCase())
    if (!categoryRow) return NextResponse.json({ error: 'Choose an active expense category.' }, { status: 400 })
    await supabaseRestStrict('luxor_monthly_budgets?on_conflict=month,category_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ month: `${body.month}-01`, category_id: categoryRow.id, category: categoryRow.name, amount, updated_by: session.email, updated_at: new Date().toISOString() }) })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Budget target could not be saved:', error)
    return NextResponse.json({ error: 'The budget target could not be saved.' }, { status: 503 })
  }
}
