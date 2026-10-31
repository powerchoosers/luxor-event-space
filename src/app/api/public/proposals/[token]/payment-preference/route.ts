import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { createNote } from '@/lib/luxorNotesServer'
import { sameDayBookingRequiresRevision } from '@/lib/luxorSameDayBooking'
import { SAME_DAY_REVISION_MESSAGE } from '@/lib/luxorSameDayBookingServer'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { getLuxorPaymentSettings } from '@/lib/luxorPaymentSettingsServer'
import { queueLuxorZelleInstructionsEmail } from '@/lib/luxorZelleInstructionsServer'
import { getInvoiceByBookingAndKind } from '@/lib/luxorInvoicesServer'

const methods = ['card', 'cash', 'zelle', 'check'] as const
const amounts = ['deposit', 'full'] as const

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice) return NextResponse.json({ error: 'Payment request not found.' }, { status: 404 })
  if (sameDayBookingRequiresRevision(invoice)) return NextResponse.json({ error: invoice.same_day_booking_status === 'review' ? 'Payment received — owner review required. Please do not pay again.' : SAME_DAY_REVISION_MESSAGE }, { status: 410 })
  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (inquiry?.is_test) await assertLuxorProductionSideEffectsAllowed(inquiry.id)
  if (invoice.status === 'cancelled' || inquiry?.status === 'closed_lost') {
    return NextResponse.json({ error: 'This proposal is no longer available.' }, { status: 410 })
  }
  const body = await request.json().catch(() => ({})) as { method?: string; amount?: string; handoffComplete?: boolean }
  if (!methods.includes(body.method as typeof methods[number]) || !amounts.includes(body.amount as typeof amounts[number])) return NextResponse.json({ error: 'Choose a payment method and amount.' }, { status: 400 })
  if (body.method === 'card' && body.amount === 'full') return NextResponse.json({ error: 'Secure card checkout is currently available for the initial booking payment. Luxor can arrange a larger card payment after booking.' }, { status: 400 })
  const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : (invoice.inquiry_id ? (await listLuxorBookingsByInquiry(invoice.inquiry_id)).find((item) => item.invoice_id === invoice.id) : null)
  if (!booking || booking.contract_status !== 'signed') return NextResponse.json({ error: 'Your signed agreement is required before choosing payment.' }, { status: 409 })
  let zelleRecipient: string | null = null
  let zelleAmount: number | null = null
  if (body.method === 'zelle') {
    try {
      zelleRecipient = (await getLuxorPaymentSettings()).zelle_recipient?.trim() || null
    } catch (error) {
      console.error('Zelle settings are unavailable for payment instructions:', error)
      return NextResponse.json({ error: 'Zelle instructions are not available right now. Please contact Luxor before sending a transfer.' }, { status: 503 })
    }
    if (!zelleRecipient) return NextResponse.json({ error: 'Zelle instructions are not configured yet. Please contact Luxor before sending a transfer.' }, { status: 503 })
    const depositInvoice = await getInvoiceByBookingAndKind(booking.id, 'deposit')
    zelleAmount = body.amount === 'deposit'
      ? Number(depositInvoice?.payment_requested_amount || depositInvoice?.total || invoice.payment_requested_amount || invoice.total || 0)
      : Number(invoice.total || 0)
    if (!Number.isFinite(zelleAmount) || zelleAmount <= 0) return NextResponse.json({ error: 'The selected Zelle amount is unavailable. Please contact Luxor.' }, { status: 409 })
  }
  const selectedAt = new Date().toISOString()
  const manualMethod = body.method === 'cash' || body.method === 'zelle'
  const handoffComplete = manualMethod && body.handoffComplete === true
  await updateLuxorBooking(booking.id, {
    metadata: {
      ...booking.metadata,
      client_payment_preference: {
        method: body.method,
        amount: body.amount,
        selectedAt,
        ...(handoffComplete ? { client_handoff_completed_at: selectedAt } : {}),
        ...(body.method === 'zelle' && handoffComplete ? { client_reported_payment_sent_at: selectedAt } : {}),
      },
    },
  })
  if (invoice.inquiry_id) await createNote(invoice.inquiry_id, `Client selected ${body.method === 'zelle' ? 'Zelle' : body.method} for ${body.amount === 'deposit' ? 'the reservation deposit' : 'the full event payment'}.`, 'status_change', 'Client Payment Portal')
  let zelleEmailStatus: string | null = null
  if (body.method === 'zelle' && zelleRecipient && zelleAmount !== null) {
    const inquiryId = invoice.inquiry_id || booking.inquiry_id || null
    const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
    const emailJob = await queueLuxorZelleInstructionsEmail({
      booking,
      inquiry,
      amount: zelleAmount,
      amountLabel: body.amount === 'deposit' ? 'reservation deposit' : 'full event balance',
      recipient: zelleRecipient,
    })
    zelleEmailStatus = emailJob.status
  }
  return NextResponse.json({
    ok: true,
    checkoutUrl: body.method === 'card' ? `/api/public/proposals/${encodeURIComponent(token)}/checkout?pay=${body.amount}` : null,
    ...(body.method === 'zelle' ? { zelleRecipient, zelleEmailStatus } : {}),
  })
}
