import { NextRequest, NextResponse } from 'next/server'
import { queueLuxorAcceptedProposalAgreement } from '@/lib/luxorAgreementQueueServer'
import { updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { claimLuxorProposalAcceptance, getInvoice } from '@/lib/luxorInvoicesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id: inquiryId } = await params
    const { invoiceId } = await request.json().catch(() => ({})) as { invoiceId?: string }
    const inquiry = await getLuxorInquiry(inquiryId)
    if (!inquiry || inquiry.status === 'closed_lost') return NextResponse.json({ error: 'This lead is not available for an in-person close.' }, { status: 409 })
    const invoice = invoiceId ? await getInvoice(invoiceId) : null
    if (!invoice || invoice.inquiry_id !== inquiry.id || invoice.invoice_kind !== 'event' || invoice.status !== 'sent' || !invoice.price_locked_at || invoice.offer_status === 'withdrawn') {
      return NextResponse.json({ error: 'A published, price-locked final proposal is required before recording an in-person acceptance.' }, { status: 409 })
    }

    const acceptedAt = new Date().toISOString()
    const claimed = invoice.proposal_accepted_at
      ? invoice
      : await claimLuxorProposalAcceptance(invoice.id, { acceptedAt, userAgent: 'Luxor owner portal — in-person verbal acceptance' })
    const acceptedInvoice = claimed || await getInvoice(invoice.id)
    if (!acceptedInvoice?.proposal_accepted_at) return NextResponse.json({ error: 'The proposal acceptance could not be recorded.' }, { status: 409 })

    const result = await queueLuxorAcceptedProposalAgreement({ invoice: acceptedInvoice, inquiry, requestedBy: session.email })
    const signingUrl = `/secure-portal/sign/${encodeURIComponent(result.signature.token)}`
    await Promise.all([
      updateLuxorBooking(result.booking.id, {
        metadata: {
          ...result.booking.metadata,
          in_person_close_started_at: acceptedAt,
          in_person_close_started_by: session.email,
          proposal_acceptance_channel: 'in_person_verbal',
        },
      }),
      updateLuxorSignatureRequest(result.signature.id, {
        metadata: {
          ...result.signature.metadata,
          signingMode: 'in_person',
          inPersonCloseStartedAt: acceptedAt,
          inPersonCloseStartedBy: session.email,
        },
      }),
      createNote(inquiry.id, `Client verbally accepted the locked final proposal in person. In-person agreement handoff started by ${session.email}.`, 'status_change', 'Owner Portal'),
    ])

    return NextResponse.json({ bookingId: result.booking.id, signatureId: result.signature.id, signingUrl, alreadyAccepted: Boolean(invoice.proposal_accepted_at) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start the in-person close.' }, { status: 500 })
  }
}
