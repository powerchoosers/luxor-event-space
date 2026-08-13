import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorBooking, listLuxorBookingsByInquiry } from '@/lib/luxorBookingsServer'
import { getLatestLuxorSignatureRequestByBooking } from '@/lib/luxorSignaturesServer'
import { buildLuxorProposalEmail, buildLuxorProposalContractEmail } from '@/lib/luxorProposalEmailServer'

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Published proposals retain the actual rendered client email. That matters
 * when a lead name or address is corrected later: the delivery preview must
 * show what was sent, not a freshly personalized approximation.
 */
function proposalEmailDeliverySnapshot(invoice: Awaited<ReturnType<typeof getInvoice>>) {
  const context = record(invoice?.proposal_context)
  const delivery = record(context?.delivery_snapshot ?? context?.deliverySnapshot ?? context?.proposal_delivery)
  const email = record(delivery?.proposal_email ?? delivery?.proposalEmail ?? delivery?.email)
  if (!email) return null
  return {
    recipient: text(email.recipient_email ?? email.recipientEmail ?? email.to),
    recipientName: text(email.recipient_name ?? email.recipientName ?? email.client_name ?? email.clientName),
    subject: text(email.subject),
    html: text(email.html),
    attachmentFileName: text(email.attachment_filename ?? email.attachmentFileName),
    deliveryState: text(email.delivery_state ?? email.deliveryState),
    deliverySentAt: text(email.delivery_sent_at ?? email.deliverySentAt),
  }
}

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
    const snapshot = invoice.status === 'sent'
      ? (invoice.price_locked_at ? 'frozen' : 'published')
      : 'draft'
    const attachmentFileName = invoice.invoice_kind === 'event'
      ? `Luxor-Final-Proposal-${invoice.id.slice(0, 8)}.pdf`
      : `Luxor-Invoice-${invoice.id.slice(0, 8)}.pdf`
    if (mode === 'proposal') {
      const reviewUrl = `${origin}/proposal/${invoice.public_token || `preview-${invoice.id}`}`
      const delivery = proposalEmailDeliverySnapshot(invoice)
      const previewInquiry = {
        ...inquiry,
        email: delivery?.recipient || inquiry.email,
        full_name: delivery?.recipientName || inquiry.full_name,
      }
      // This is the same template invoked by the final-proposal send route.
      // A draft may use a non-live preview URL until publishing gives it a
      // private token; the visible email and its attached-PDF data are real.
      return NextResponse.json({
        mode,
        recipient: delivery?.recipient || inquiry.email,
        attachmentFileName: delivery?.attachmentFileName || attachmentFileName,
        snapshot,
        exact: delivery?.deliveryState === 'delivered' && Boolean(delivery?.subject && delivery.html),
        deliveryState: delivery?.deliveryState || null,
        deliverySentAt: delivery?.deliverySentAt || null,
        ...(delivery?.subject && delivery.html
          ? { subject: delivery.subject, html: delivery.html }
          : buildLuxorProposalEmail({ invoice, inquiry: previewInquiry, reviewUrl })),
      })
    }
    const bookings = invoice.inquiry_id ? await listLuxorBookingsByInquiry(invoice.inquiry_id) : []
    const booking = invoice.booking_id ? await getLuxorBooking(invoice.booking_id) : bookings.find((item) => item.invoice_id === invoice.id) || null
    if (!booking) return NextResponse.json({ error: 'Create the booking record before previewing the agreement email.' }, { status: 409 })
    const signature = await getLatestLuxorSignatureRequestByBooking(booking.id)
    const signingUrl = `${origin}/secure-portal/sign/${signature?.token || `preview-${booking.id}`}`
    return NextResponse.json({
      mode,
      recipient: inquiry.email,
      attachmentFileName,
      snapshot,
      ...await buildLuxorProposalContractEmail({ invoice, inquiry, booking, signingUrl }),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to prepare the email preview.' }, { status: 500 })
  }
}
