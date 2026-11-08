import { NextRequest, NextResponse } from 'next/server'
import { GET as getFinanceSources } from '@/app/api/portal/finance-overview-ledgers/route'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getVerifiedTestInquiryIds } from '@/lib/luxorBookingsServer'
import { getLuxorBusinessFinanceRows } from '@/lib/luxorFinanceReporting'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { accountantExportPeriod, buildLuxorClientPaymentExport, buildLuxorClientRefundExport } from '@/lib/luxorAccountantExport'
import type { LuxorBooking, LuxorInvoice, LuxorPayment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401 })
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) return NextResponse.json({ error: 'Finance access required.' }, { status: 403 })
  const kind = request.nextUrl.searchParams.get('file')
  if (kind !== 'payments' && kind !== 'refunds') return NextResponse.json({ error: 'Choose an export.' }, { status: 400 })
  let period
  try { period = accountantExportPeriod(request.nextUrl.searchParams.get('from'), request.nextUrl.searchParams.get('to')) }
  catch { return NextResponse.json({ error: 'Choose a valid start and end date.' }, { status: 400 }) }
  try {
    const response = await getFinanceSources(request)
    if (!response.ok) throw new Error('Source unavailable')
    const source = await response.json() as { invoices: LuxorInvoice[]; bookings: LuxorBooking[]; payments: LuxorPayment[]; refunds: LuxorPaymentRefundView[] }
    if (![source.invoices, source.bookings, source.payments, source.refunds].every(Array.isArray)) throw new Error('Invalid source')
    const bookings = new Set(source.bookings.map((row) => row.id.toLowerCase()))
    const invoices = new Set(source.invoices.map((row) => row.id.toLowerCase()))
    const paymentIds = new Set(source.payments.map((row) => row.id.toLowerCase()))
    // Do not guess whether an orphaned link belongs to a test or business record.
    if ([...source.payments, ...source.refunds, ...source.invoices].some((row) => row.booking_id && !bookings.has(row.booking_id.toLowerCase()))
      || [...source.payments, ...source.refunds].some((row) => row.invoice_id && !invoices.has(row.invoice_id.toLowerCase()))
      || source.invoices.some((row) => row.parent_invoice_id && !invoices.has(row.parent_invoice_id.toLowerCase()))
      || source.refunds.some((row) => !row.source_payment_id || !paymentIds.has(row.source_payment_id.toLowerCase()))) throw new Error('Linked source unavailable')
    const testInquiryIds = await getVerifiedTestInquiryIds([...source.invoices, ...source.bookings, ...source.payments, ...source.refunds].map((row) => row.inquiry_id).filter((id): id is string => Boolean(id)))
    testInquiryIds.add(LUXOR_PERMANENT_TEST_LEAD_ID)
    const business = getLuxorBusinessFinanceRows({ invoices: source.invoices, bookings: source.bookings, expenses: [], testInquiryIds, testBookingIds: new Set() })
    const excluded = (id: string | null | undefined, ids: ReadonlySet<string>) => Boolean(id && ids.has(id.toLowerCase()))
    const isBusiness = (row: { metadata?: Record<string, unknown> | null; booking_id: string | null; invoice_id: string | null; inquiry_id: string | null }) => row.metadata?.is_test_record !== true
      && !excluded(row.booking_id, business.testBookingIds) && !excluded(row.invoice_id, business.testInvoiceIds) && !excluded(row.inquiry_id, business.testInquiryIds)
    const payments = source.payments.filter(isBusiness)
    const businessPaymentIds = new Set(payments.map((row) => row.id.toLowerCase()))
    const refunds = source.refunds.filter((row) => isBusiness(row) && businessPaymentIds.has(row.source_payment_id.toLowerCase()))
    const content = kind === 'payments' ? buildLuxorClientPaymentExport(payments, period) : buildLuxorClientRefundExport(refunds, period)
    return new NextResponse(content, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="luxor-client-${kind}.csv"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch {
    return NextResponse.json({ error: 'Export could not be verified. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
