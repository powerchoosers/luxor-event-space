import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRest, supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { getLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { isLuxorBookingReceivableEligible } from '@/lib/luxorPaymentDashboardModel'
import { syncLuxorPaymentInstallments } from '@/lib/luxorPaymentInstallmentsServer'

class PaymentScheduleUnavailableError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message)
    this.name = 'PaymentScheduleUnavailableError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

type ReschedulePaymentInstallmentResult = {
  installment?: LuxorPaymentInstallment
  changed?: boolean
  http_status?: number
  error?: string
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function financeSession() {
  const session = await getLuxorPortalSession()
  if (!session) return { response: NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'finances')) {
    return { response: NextResponse.json({ error: 'Active finance access is required to change payment schedules.' }, { status: 403 }) }
  }
  return { session }
}

async function loadBookingSchedule(bookingId: string) {
  const path = `luxor_payment_installments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&status=neq.void&order=installment_order.asc,id.asc`
  const expected = await supabaseRestCount(path)
  if (expected > 24) throw new PaymentScheduleUnavailableError(409, 'This schedule has more entries than the approved plan supports. Reconcile it before editing.')
  const rows: LuxorPaymentInstallment[] = []
  for (let offset = 0; offset < expected; offset += 500) {
    const page = await supabaseRestStrict<LuxorPaymentInstallment[]>(`${path}&limit=500&offset=${offset}`)
    rows.push(...page)
    if (page.length < Math.min(500, expected - offset)) throw new Error('Payment schedule records could not be fully verified.')
  }
  if (rows.length !== expected || new Set(rows.map((row) => row.id)).size !== expected || await supabaseRestCount(path) !== expected) {
    throw new Error('Payment schedule records changed while loading. Please refresh.')
  }
  return rows
}

async function assertEligibleBooking(bookingId: string) {
  const booking = await getLuxorBooking(bookingId)
  if (!booking) throw new PaymentScheduleUnavailableError(404, 'Booking record not found.')
  if (booking.status !== 'confirmed' || booking.contract_status !== 'signed' || !booking.contract_signed_at) {
    throw new PaymentScheduleUnavailableError(409, 'A confirmed booking with a signed agreement is required to change its payment schedule.')
  }
  const inquiryId = booking.inquiry_id || null
  const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
  if (inquiry?.status === 'closed_lost') throw new PaymentScheduleUnavailableError(409, 'Archived bookings cannot receive schedule changes.')
  if (!booking.invoice_id) throw new PaymentScheduleUnavailableError(409, 'The approved event proposal is unavailable.')
  const invoice = await getInvoice(booking.invoice_id)
  if (!invoice || invoice.invoice_kind !== 'event' || invoice.status === 'draft' || invoice.status === 'cancelled'
    || invoice.offer_status === 'withdrawn' || !invoice.proposal_accepted_at || !isLuxorBookingReceivableEligible(booking)) {
    throw new PaymentScheduleUnavailableError(409, 'The signed booking does not have an eligible accepted event proposal.')
  }
  return { booking, invoice }
}

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const bookingId = request.nextUrl.searchParams.get('bookingId')
  const path = bookingId ? `luxor_payment_installments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=installment_order.asc,id.asc` : 'luxor_payment_installments?select=*&order=due_at.asc,id.asc'
  if (request.nextUrl.searchParams.get('strictMetrics') === '1' && !bookingId) {
    const expected = await supabaseRestCount(path)
    const rows: LuxorPaymentInstallment[] = []
    for (let offset = 0; offset < expected; offset += 500) {
      const page = await supabaseRestStrict<LuxorPaymentInstallment[]>(`${path}&limit=500&offset=${offset}`)
      rows.push(...page)
      if (page.length < Math.min(500, expected - offset)) throw new Error('Payment schedule records could not be fully verified.')
    }
    if (rows.length !== expected || new Set(rows.map((item) => item.id)).size !== expected || await supabaseRestCount(path) !== expected) throw new Error('Payment schedule records changed while loading. Please refresh.')
    return NextResponse.json(rows)
  }
  return NextResponse.json(await supabaseRest<LuxorPaymentInstallment[]>(path))
}

/** Rebuild only from the accepted, signed payment plan; caller fields never set schedule amounts. */
export async function POST(request: NextRequest) {
  try {
    const access = await financeSession()
    if (access.response) return access.response
    const parsed = await request.json().catch(() => ({})) as unknown
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as { bookingId?: unknown } : {}
    if (Object.keys(body).some((key) => key !== 'bookingId')) {
      return NextResponse.json({ error: 'The schedule is rebuilt from the accepted signed payment plan.' }, { status: 400 })
    }
    if (typeof body.bookingId !== 'string' || !UUID.test(body.bookingId)) {
      return NextResponse.json({ error: 'A valid bookingId is required.' }, { status: 400 })
    }
    const { booking, invoice } = await assertEligibleBooking(body.bookingId)
    const installments = await syncLuxorPaymentInstallments({ booking, invoice })
    if (!installments.length) {
      return NextResponse.json({ error: 'The accepted payment plan cannot produce a verified schedule. Review its dates and contract terms.' }, { status: 409 })
    }
    return NextResponse.json({ installments })
  } catch (error) {
    if (error instanceof PaymentScheduleUnavailableError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment schedule could not be synchronized.' }, { status: 500 })
  }
}

/** Only an owner-authorized future due date can change; payment amounts and history are immutable here. */
export async function PATCH(request: NextRequest) {
  try {
    const access = await financeSession()
    if (access.response) return access.response
    const parsed = await request.json().catch(() => ({})) as unknown
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as { id?: unknown; expectedUpdatedAt?: unknown; due_at?: unknown }
      : {}
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return NextResponse.json({ error: 'A valid installment id is required.' }, { status: 400 })
    if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
      return NextResponse.json({ error: 'Refresh the schedule before editing its due date.' }, { status: 400 })
    }
    if (!validCalendarDate(body.due_at)) {
      return NextResponse.json({ error: 'Choose a valid due date.' }, { status: 400 })
    }
    const keys = Object.keys(body)
    if (keys.some((key) => !['id', 'expectedUpdatedAt', 'due_at'].includes(key))) {
      return NextResponse.json({ error: 'Only a due date can be changed here. Contractual amount changes require a verified signed amendment.' }, { status: 409 })
    }

    const result = await supabaseRestStrict<ReschedulePaymentInstallmentResult>(
      'rpc/luxor_reschedule_payment_installment',
      {
        method: 'POST',
        body: JSON.stringify({
          p_installment_id: body.id,
          p_expected_updated_at: body.expectedUpdatedAt,
          p_due_date: body.due_at,
          p_actor_email: access.session!.email,
        }),
      },
    )
    if (result.error) {
      const status = [400, 404, 409].includes(Number(result.http_status)) ? Number(result.http_status) : 409
      return NextResponse.json({ error: result.error }, { status })
    }
    if (!result.installment || typeof result.changed !== 'boolean') {
      throw new Error('The payment schedule update returned an incomplete result.')
    }
    return NextResponse.json({ installment: result.installment, changed: result.changed })
  } catch (error) {
    if (error instanceof PaymentScheduleUnavailableError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment schedule could not be updated.' }, { status: 500 })
  }
}
