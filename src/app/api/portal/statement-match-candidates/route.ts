import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { isLuxorTestAvailabilityBooking } from '@/lib/luxorAvailability'
import { isAccountingSetupId } from '@/lib/luxorAccountingSetup'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { StatementReviewRow } from '@/lib/luxorStatementReview'
import type { LuxorBooking } from '@/lib/luxorInquiryTypes'
import type { ExpenseMatchCandidate } from '@/lib/luxorStatementMatchReview'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
type Payment = { id: string; expense_id: string; amount: number | string; transaction_type: 'payment' | 'refund'; payment_date: string; payment_method: string | null; reference_number: string | null }
type Expense = { id: string; booking_id: string | null; metadata: Record<string, unknown> | null; vendor_name: string | null }

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401, headers: noStore })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403, headers: noStore })
  const statementId = request.nextUrl.searchParams.get('statement_id'), rowText = request.nextUrl.searchParams.get('row')
  if (!isAccountingSetupId(statementId) || !rowText || !/^[1-9]\d{0,4}$/.test(rowText)) return NextResponse.json({ error: 'Choose a valid imported statement row.' }, { status: 400, headers: noStore })
  try {
    const statements = await supabaseRestStrict<Array<{ rows: StatementReviewRow[] }>>(`luxor_statement_imports?select=rows&id=eq.${encodeURIComponent(statementId)}&limit=1`)
    if (!statements[0]) return NextResponse.json({ error: 'Statement not found.' }, { status: 404, headers: noStore })
    if (!Array.isArray(statements[0].rows)) throw new Error('Invalid statement')
    const matches = statements[0].rows.filter((item) => item.rowNumber === Number(rowText))
    const row = matches[0]
    if (matches.length !== 1 || !row || !Array.isArray(row.issues) || row.issues.length || !row.date || !validDate(row.date) || !Number.isSafeInteger(row.amountCents) || (row.amountCents as number) <= 0 || (row.amountCents as number) > 999999999999 || row.currency !== 'USD' || !['inflow', 'outflow'].includes(row.direction || '')) return NextResponse.json({ error: 'This row needs attention before candidates can be reviewed.' }, { status: 409, headers: noStore })
    const kind = row.direction === 'outflow' ? 'payment' : 'refund'
    const path = `luxor_expense_payments?select=id,expense_id,amount,transaction_type,payment_date,payment_method,reference_number&payment_date=eq.${row.date}&amount=eq.${((row.amountCents as number) / 100).toFixed(2)}&transaction_type=eq.${kind}&order=id.asc`
    const count = await supabaseRestCount(path)
    if (count > 100) return NextResponse.json({ error: 'Too many possible sources to review safely. Narrow the records with your accountant.' }, { status: 409, headers: noStore })
    const payments = await supabaseRestStrict<Payment[]>(`${path}&limit=100`)
    if (payments.length !== count || payments.some((item) => !isAccountingSetupId(item.id) || !isAccountingSetupId(item.expense_id)) || new Set(payments.map((item) => item.id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Payment source changed')
    if (!payments.length) return NextResponse.json({ candidates: [] }, { headers: noStore })
    const expenseIds = [...new Set(payments.map((item) => item.expense_id))]
    const expenses = await supabaseRestStrict<Expense[]>(`luxor_booking_expenses?select=id,booking_id,metadata,vendor_name&id=in.(${expenseIds.join(',')})`)
    if (expenses.length !== expenseIds.length || new Set(expenses.map((item) => item.id)).size !== expenseIds.length) throw new Error('Expense sources unavailable')
    const bookingIds = [...new Set(expenses.map((item) => item.booking_id).filter((id): id is string => Boolean(id)))]
    if (bookingIds.some((id) => !isAccountingSetupId(id))) throw new Error('Invalid booking')
    const bookings = bookingIds.length ? await supabaseRestStrict<LuxorBooking[]>(`luxor_bookings?select=*&id=in.(${bookingIds.join(',')})`) : []
    if (bookings.length !== bookingIds.length || new Set(bookings.map((item) => item.id)).size !== bookingIds.length) throw new Error('Booking sources unavailable')
    const inquiryIds = [...new Set(bookings.map((item) => item.inquiry_id).filter((id): id is string => Boolean(id)))]
    if (inquiryIds.some((id) => !isAccountingSetupId(id))) throw new Error('Invalid inquiry')
    const inquiries = inquiryIds.length ? await supabaseRestStrict<Array<{ id: string }>>(`luxor_inquiries?select=id&id=in.(${inquiryIds.join(',')})`) : []
    if (inquiries.length !== inquiryIds.length || new Set(inquiries.map((item) => item.id)).size !== inquiryIds.length) throw new Error('Inquiry sources unavailable')
    const testInquiries = await getVerifiedTestInquiryIds(inquiryIds)
    const testBookings = new Set(bookings.filter((booking) => isLuxorTestAvailabilityBooking(booking) || Boolean(booking.inquiry_id && testInquiries.has(booking.inquiry_id))).map((booking) => booking.id))
    const byExpense = new Map(expenses.map((expense) => [expense.id, expense]))
    const candidates: ExpenseMatchCandidate[] = payments.flatMap((payment) => {
      const expense = byExpense.get(payment.expense_id)
      if (!expense || expense.metadata?.is_test_record === true || Boolean(expense.booking_id && testBookings.has(expense.booking_id))) return []
      return [{ id: payment.id, expenseId: payment.expense_id, date: payment.payment_date, amountCents: Math.round(Number(payment.amount) * 100), direction: kind === 'payment' ? 'outflow' : 'inflow', vendor: expense.vendor_name, method: payment.payment_method, reference: payment.reference_number }]
    })
    return NextResponse.json({ candidates }, { headers: noStore })
  } catch { return NextResponse.json({ error: 'Candidates could not be verified. No match was recorded.' }, { status: 503, headers: noStore }) }
}
