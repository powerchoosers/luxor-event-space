import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken } from '@/lib/luxorInvoicesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { createNote } from '@/lib/luxorNotesServer'

const methods = ['card', 'cash', 'zelle', 'check'] as const
const amounts = ['deposit', 'full'] as const

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice) return NextResponse.json({ error: 'Payment request not found.' }, { status: 404 })
  const body = await request.json().catch(() => ({})) as { method?: string; amount?: string }
  if (!methods.includes(body.method as typeof methods[number]) || !amounts.includes(body.amount as typeof amounts[number])) return NextResponse.json({ error: 'Choose a payment method and amount.' }, { status: 400 })
  const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : (invoice.inquiry_id ? (await listLuxorBookingsByInquiry(invoice.inquiry_id)).find((item) => item.invoice_id === invoice.id) : null)
  if (!booking || booking.contract_status !== 'signed') return NextResponse.json({ error: 'Your signed agreement is required before choosing payment.' }, { status: 409 })
  await updateLuxorBooking(booking.id, { metadata: { ...booking.metadata, client_payment_preference: { method: body.method, amount: body.amount, selectedAt: new Date().toISOString() } } })
  if (invoice.inquiry_id) await createNote(invoice.inquiry_id, `Client selected ${body.method === 'zelle' ? 'Zelle' : body.method} for ${body.amount === 'deposit' ? 'the reservation deposit' : 'the full event payment'}.`, 'status_change', 'Client Payment Portal')
  return NextResponse.json({ ok: true, checkoutUrl: body.method === 'card' ? `/api/public/proposals/${encodeURIComponent(token)}/checkout?pay=${body.amount}` : null })
}
