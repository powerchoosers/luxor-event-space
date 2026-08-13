import { NextResponse } from 'next/server'
import { queueLuxorAcceptedProposalAgreement } from '@/lib/luxorAgreementQueueServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { claimLuxorProposalAcceptance, getInvoice, getInvoiceByPublicToken } from '@/lib/luxorInvoicesServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'

export const dynamic = 'force-dynamic'

function requestIp(request: Request) {
  return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 128) || null
}

function requestUserAgent(request: Request) {
  return (request.headers.get('user-agent') || '').slice(0, 1_000) || null
}

/**
 * A client acceptance records the exact proposal decision, then queues—not
 * directly sends—the full Event Agreement package. Stripe stays downstream of
 * the signed agreement. A retry safely recovers an earlier partial acceptance.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const invoice = await getInvoiceByPublicToken(token)
    if (!invoice || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn') {
      return NextResponse.json({ error: 'This proposal is no longer available.' }, { status: 404 })
    }
    if (invoice.invoice_kind !== 'event' || !invoice.price_locked_at || invoice.status !== 'sent') {
      return NextResponse.json({ error: 'Luxor must publish the final proposal before it can be accepted.' }, { status: 409 })
    }
    // Once accepted, an expiry must not trap the prospect in a partial
    // acceptance. They may retry solely to recover the queued agreement.
    if (!invoice.proposal_accepted_at && isLuxorOfferExpired(invoice)) {
      return NextResponse.json({ error: 'This proposal has expired. Please contact Luxor for a refreshed proposal.' }, { status: 410 })
    }
    if (!invoice.inquiry_id) return NextResponse.json({ error: 'This proposal is missing its client record.' }, { status: 409 })

    const inquiry = await getLuxorInquiry(invoice.inquiry_id)
    if (!inquiry?.email) return NextResponse.json({ error: 'Luxor needs a client email before an agreement can be issued.' }, { status: 409 })
    if (inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This proposal is no longer available. Please contact Luxor at Las Palmas Events.' }, { status: 410 })
    }

    const now = new Date().toISOString()
    const acceptanceClaim = invoice.proposal_accepted_at
      ? invoice
      : await claimLuxorProposalAcceptance(invoice.id, {
          acceptedAt: now,
          ip: requestIp(request),
          userAgent: requestUserAgent(request),
        })
    const acceptedInvoice = acceptanceClaim || await getInvoice(invoice.id)
    if (!acceptedInvoice?.proposal_accepted_at || acceptedInvoice.status !== 'sent') {
      return NextResponse.json({ error: 'This proposal is no longer available for acceptance.' }, { status: 409 })
    }

    const result = await queueLuxorAcceptedProposalAgreement({
      invoice: acceptedInvoice,
      inquiry,
      requestedBy: 'Client Proposal Portal',
    })
    return NextResponse.json({
      accepted: true,
      alreadyAccepted: !acceptanceClaim || Boolean(invoice.proposal_accepted_at),
      agreementQueued: result.delivery === 'queued',
      agreementPreparing: result.delivery === 'preparing',
      agreementAlreadySent: result.delivery === 'already_sent' || result.delivery === 'already_signed',
    }, { status: result.delivery === 'preparing' || result.delivery === 'queued' ? 202 : 200 })
  } catch (error) {
    // The client never needs to interpret a database or provider implementation
    // error while accepting a proposal. No email is sent from this request.
    console.error('Public proposal acceptance failed:', error)
    return NextResponse.json({
      error: 'We couldn\'t complete your proposal selection just yet. Please try again in a moment, or contact Luxor if the issue continues.',
    }, { status: 500 })
  }
}
