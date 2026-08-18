import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { createNote } from '@/lib/luxorNotesServer'

const methods = ['card', 'cash', 'zelle', 'check'] as const
const amounts = ['deposit', 'full'] as const

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice) return NextResponse.json({ error: 'Payment request not found.' }, { status: 404 })
  const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
  if (invoice.status === 'cancelled' || inquiry?.status === 'closed_lost') {
    return NextResponse.json({ error: 'This proposal is no longer available.' }, { status: 410 })
  }
  const body = await request.json().catch(() => ({})) as { method?: string; amount?: string; handoffComplete?: boolean }
  if (!methods.includes(body.method as typeof methods[number]) || !amounts.includes(body.amount as typeof amounts[number])) return NextResponse.json({ error: 'Choose a payment method and amount.' }, { status: 400 })
  if (body.method === 'card' && body.amount === 'full') return NextResponse.json({ error: 'Secure card checkout is currently available for the initial booking payment. Luxor can arrange a larger card payment after booking.' }, { status: 400 })
  const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : (invoice.inquiry_id ? (await listLuxorBookingsByInquiry(invoice.inquiry_id)).find((item) => item.invoice_id === invoice.id) : null)
  if (!booking || booking.contract_status !== 'signed') return NextResponse.json({ error: 'Your signed agreement is required before choosing payment.' }, { status: 409 })
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
  return NextResponse.json({ ok: true, checkoutUrl: body.method === 'card' ? `/api/public/proposals/${encodeURIComponent(token)}/checkout?pay=${body.amount}` : null })
}
