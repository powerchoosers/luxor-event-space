import { NextRequest, NextResponse } from 'next/server'
import { authorizeLuxorExpenseRequest, loadLuxorExpenseManagementData, toExpenseErrorResponse } from '@/lib/luxorExpensesServer'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { getLuxorBusinessFinanceRows } from '@/lib/luxorFinanceReporting'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { buildLuxorExpenseExport, buildLuxorExpensePaymentExport } from '@/lib/luxorAccountantExport'
import type { LuxorBooking } from '@/lib/luxorInquiryTypes'

export const dynamic = 'force-dynamic'

async function loadBookings() {
  const path = 'luxor_bookings?select=*&order=id.asc'
  const count = await supabaseRestCount(path)
  const rows: LuxorBooking[] = []
  for (let offset = 0; offset < count; offset += 500) {
    const page = await supabaseRestStrict<LuxorBooking[]>(`${path}&limit=500&offset=${offset}`)
    if (page.length < Math.min(500, count - offset)) throw new Error('Incomplete bookings')
    rows.push(...page)
  }
  if (rows.length !== count || rows.some((row) => !row.id) || new Set(rows.map((row) => row.id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Bookings changed while loading')
  return rows
}

export async function GET(request: NextRequest) {
  try {
    await authorizeLuxorExpenseRequest()
    const kind = request.nextUrl.searchParams.get('file')
    if (kind !== 'expenses' && kind !== 'payments') return NextResponse.json({ error: 'Choose an export.' }, { status: 400 })
    const [data, bookings] = await Promise.all([loadLuxorExpenseManagementData({ generate: false }), loadBookings()])
    const bookingIds = new Set(bookings.map((row) => row.id.toLowerCase()))
    if (data.expenses.some((row) => row.booking_id && !bookingIds.has(row.booking_id.toLowerCase()))) throw new Error('An expense booking could not be verified')
    const testInquiryIds = await getVerifiedTestInquiryIds(bookings.map((row) => row.inquiry_id).filter((id): id is string => Boolean(id)))
    testInquiryIds.add(LUXOR_PERMANENT_TEST_LEAD_ID)
    const { expenses } = getLuxorBusinessFinanceRows({ invoices: [], bookings, expenses: data.expenses, testInquiryIds, testBookingIds: new Set() })
    const content = kind === 'expenses' ? buildLuxorExpenseExport(expenses, data.receipts) : buildLuxorExpensePaymentExport(expenses)
    return new NextResponse(content, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="luxor-expense-${kind}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    return NextResponse.json({ error: result.status === 500 ? 'Export could not be verified. Please try again.' : result.message }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  }
}
