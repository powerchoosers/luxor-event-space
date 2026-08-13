import { NextRequest, NextResponse } from 'next/server'
import { queueLuxorAcceptedProposalAgreement } from '@/lib/luxorAgreementQueueServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice, listInvoicesByInquiry } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

function isAcceptedFinalProposal(invoice: {
  invoice_kind?: string
  status: string
  price_locked_at?: string | null
  proposal_accepted_at?: string | null
  offer_status?: string | null
}) {
  return Boolean(
    invoice.invoice_kind === 'event' &&
    invoice.status === 'sent' &&
    invoice.price_locked_at &&
    invoice.proposal_accepted_at &&
    invoice.offer_status !== 'withdrawn',
  )
}

/**
 * Owner-only recovery for a proposal the client already accepted. It creates
 * or resumes the exact booking/signing record and queues one agreement email;
 * it never delivers mail during this request.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { id } = await params
    const inquiry = await getLuxorInquiry(id)
    if (!inquiry) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    if (inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This deal is closed lost, so no Event Agreement can be sent.' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({})) as { invoiceId?: unknown; resend?: unknown }
    const requestedInvoice = typeof body.invoiceId === 'string' && body.invoiceId.trim()
      ? await getInvoice(body.invoiceId.trim())
      : null
    if (requestedInvoice && requestedInvoice.inquiry_id !== inquiry.id) {
      return NextResponse.json({ error: 'That final proposal does not belong to this lead.' }, { status: 404 })
    }

    const invoice = requestedInvoice || (await listInvoicesByInquiry(inquiry.id))
      .find((candidate) => isAcceptedFinalProposal(candidate)) || null
    if (!invoice || !isAcceptedFinalProposal(invoice)) {
      return NextResponse.json({
        error: 'A client-accepted, price-locked final proposal is required before an Event Agreement can be queued.',
      }, { status: 409 })
    }

    const result = await queueLuxorAcceptedProposalAgreement({
      invoice,
      inquiry,
      requestedBy: session.email,
      forceResend: body.resend === true,
    })
    const delivery = result.delivery === 'already_signed' ? 'already_sent' : result.delivery
    return NextResponse.json({
      invoiceId: invoice.id,
      bookingId: result.booking.id,
      signatureId: result.signature.id,
      jobId: result.job?.id || null,
      delivery,
      message: result.message,
    }, { status: delivery === 'preparing' ? 202 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue the Event Agreement.'
    console.error('[send-agreement] failed', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
