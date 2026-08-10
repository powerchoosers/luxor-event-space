import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken } from '@/lib/luxorInvoicesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createLuxorSignatureRequest, getActiveLuxorSignatureRequestByBooking } from '@/lib/luxorSignaturesServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { createNote } from '@/lib/luxorNotesServer'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invoice = await getInvoiceByPublicToken(token)
  if (!invoice || invoice.status === 'cancelled') return NextResponse.json({ error: 'This estimate is no longer available.' }, { status: 404 })
  if (isLuxorOfferExpired(invoice)) return NextResponse.json({ error: 'This estimate has expired. Please contact Luxor for an updated estimate.' }, { status: 410 })
  const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : (invoice.inquiry_id ? (await listLuxorBookingsByInquiry(invoice.inquiry_id)).find((item) => item.invoice_id === invoice.id) : null)
  if (!booking) return NextResponse.json({ error: 'Luxor needs to prepare the booking details before an agreement can be issued.' }, { status: 409 })
  if (booking.contract_status === 'signed') return NextResponse.json({ signingUrl: null, alreadySigned: true })
  let signature = await getActiveLuxorSignatureRequestByBooking(booking.id)
  signature ||= await createLuxorSignatureRequest(booking)
  const now = new Date().toISOString()
  await updateLuxorBooking(booking.id, { contract_status: signature.status === 'viewed' ? 'viewed' : 'sent', metadata: { ...booking.metadata, estimate_accepted_at: now, reservation_state: 'awaiting_signature', latest_signature_request_id: signature.id } })
  if (invoice.inquiry_id) {
    const inquiry = await getLuxorInquiry(invoice.inquiry_id)
    if (inquiry) await updateLuxorInquiry(inquiry.id, { status: 'booked', pipeline_stage: 'contract', metadata: { ...inquiry.metadata, estimate_accepted_at: now, latest_signature_request_id: signature.id } })
    await createNote(invoice.inquiry_id, 'Client accepted the estimate and was sent to the booking agreement.', 'status_change', 'Client Portal')
  }
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '')
  return NextResponse.json({ signingUrl: `${origin}/secure-portal/sign/${signature.token}` })
}
