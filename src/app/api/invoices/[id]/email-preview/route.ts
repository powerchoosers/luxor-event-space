import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { getLatestLuxorSignatureRequestByBooking } from '@/lib/luxorSignaturesServer'
import { buildLuxorProposalEmail, buildLuxorProposalContractEmail } from '@/lib/luxorProposalEmailServer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry) return NextResponse.json({ error: 'Lead record not found.' }, { status: 404 })
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    const mode = request.nextUrl.searchParams.get('mode') === 'proposal_contract' ? 'proposal_contract' : 'proposal'
    if (mode === 'proposal') {
      const reviewUrl = `${origin}/proposal/${invoice.public_token || `preview-${invoice.id}`}`
      return NextResponse.json({ mode, ...buildLuxorProposalEmail({ invoice, inquiry, reviewUrl }) })
    }
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : bookings.find((item) => item.invoice_id === invoice.id) || null
    if (!booking) return NextResponse.json({ error: 'Create the booking record before previewing the agreement email.' }, { status: 409 })
    const signature = await getLatestLuxorSignatureRequestByBooking(booking.id)
    const signingUrl = `${origin}/secure-portal/sign/${signature?.token || `preview-${booking.id}`}`
    return NextResponse.json({ mode, ...await buildLuxorProposalContractEmail({ invoice, inquiry, booking, signingUrl }) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare the email preview.' }, { status: 500 })
  }
}
