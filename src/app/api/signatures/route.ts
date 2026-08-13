import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { cancelQueuedLuxorEmailJobs } from '@/lib/luxorEmailJobsServer'
import { queueLuxorAcceptedProposalAgreement } from '@/lib/luxorAgreementQueueServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import type { LuxorInvoice } from '@/lib/luxorInquiryTypes'
import {
  createLuxorSignatureRequest,
  getLatestLuxorSignatureRequestByBooking,
  listLuxorSignatureRequests,
  recordLuxorSignatureEvent,
  updateLuxorSignatureRequest,
} from '@/lib/luxorSignaturesServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '100', 10)
    const bookingId = request.nextUrl.searchParams.get('bookingId')
    if (bookingId) {
      const signature = await getLatestLuxorSignatureRequestByBooking(bookingId)
      if (!signature) return NextResponse.json({ error: 'No contract was found for this booking.' }, { status: 404 })
      return NextResponse.json({
        signature: {
          id: signature.id,
          status: signature.status,
          contract_title: signature.contract_title,
          signed_at: signature.signed_at,
        },
        signingUrl: `/secure-portal/sign/${encodeURIComponent(signature.token)}`,
      })
    }
    const signatures = await listLuxorSignatureRequests(Number.isFinite(requestedLimit) ? requestedLimit : 100)
    return NextResponse.json(signatures.map((signature) => ({
      id: signature.id,
      inquiry_id: signature.inquiry_id,
      booking_id: signature.booking_id,
      client_name: signature.client_name,
      status: signature.status,
      contract_title: signature.contract_title,
      created_at: signature.created_at,
      updated_at: signature.updated_at,
      signed_at: signature.signed_at,
    })))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch signature requests.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function isAcceptedFinalProposal(proposal: LuxorInvoice | null): proposal is LuxorInvoice {
  return Boolean(
    proposal &&
    proposal.invoice_kind === 'event' &&
    proposal.status === 'sent' &&
    proposal.price_locked_at &&
    proposal.proposal_accepted_at &&
    proposal.offer_status !== 'withdrawn',
  )
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json() as { bookingId?: string; sendEmail?: boolean; signingMode?: 'email' | 'in_person' }
    if (!body.bookingId) return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 })

    const booking = await getLuxorBooking(body.bookingId)
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    const inquiry = booking.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null
    if (!inquiry || booking.status === 'cancelled' || inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This deal is closed lost or its booking is cancelled. A new Event Agreement cannot be created.' }, { status: 409 })
    }
    const proposal = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
    if (!isAcceptedFinalProposal(proposal)) {
      return NextResponse.json({ error: 'A sent, price-locked final proposal must be accepted before an Event Agreement can be created.' }, { status: 409 })
    }

    const sendEmail = body.sendEmail !== false && body.signingMode !== 'in_person'
    if (!sendEmail) {
      const signature = await createLuxorSignatureRequest(booking, { status: 'draft', signingMode: 'in_person' })
      await updateLuxorBooking(booking.id, {
        status: 'tentative',
        metadata: {
          ...booking.metadata,
          contractDraftHoldExpiresAt: new Date(Date.now() + 72 * 60 * 60_000).toISOString(),
          contractSigningMode: 'in_person',
        },
      })
      return NextResponse.json({
        signature,
        signingUrl: `/secure-portal/sign/${encodeURIComponent(signature.token)}`,
        sentEmail: false,
        signingMode: 'in_person',
      }, { status: 201 })
    }

    const result = await queueLuxorAcceptedProposalAgreement({
      invoice: proposal,
      inquiry,
      requestedBy: session.email,
    })
    return NextResponse.json({
      signature: result.signature,
      job: result.job,
      sentEmail: false,
      delivery: result.delivery,
      message: result.message,
    }, { status: result.delivery === 'preparing' ? 202 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create signature request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const { bookingId, action } = await request.json() as { bookingId?: string; action?: 'cancel' | 'resend' }
    if (!bookingId || !['cancel', 'resend'].includes(action || '')) {
      return NextResponse.json({ error: 'bookingId and a valid action are required.' }, { status: 400 })
    }
    const booking = await getLuxorBooking(bookingId)
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    const inquiry = booking.inquiry_id ? await getLuxorInquiry(booking.inquiry_id) : null
    if (!inquiry || booking.status === 'cancelled' || inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This deal is closed lost or its booking is cancelled.' }, { status: 409 })
    }
    const signature = await getLatestLuxorSignatureRequestByBooking(bookingId)
    if (!signature) return NextResponse.json({ error: 'No contract was found for this booking.' }, { status: 404 })

    if (action === 'cancel') {
      const cancelledAt = new Date().toISOString()
      const updated = await updateLuxorSignatureRequest(signature.id, {
        status: 'void',
        metadata: { ...signature.metadata, cancelledAt, cancelledBy: session.email },
      })
      await updateLuxorBooking(bookingId, { contract_status: 'void' })
      if (signature.inquiry_id) {
        await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_signature', 'contract_view_reminder', 'contract_signature_reminder'])
      }
      await recordLuxorSignatureEvent({
        signatureRequestId: signature.id,
        eventType: 'voided',
        metadata: { cancelledBy: session.email },
      })
      return NextResponse.json({ signature: updated, action: 'cancelled' })
    }

    const proposal = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
    if (!isAcceptedFinalProposal(proposal)) {
      return NextResponse.json({ error: 'A client-accepted, price-locked final proposal is required before an Event Agreement can be resent.' }, { status: 409 })
    }
    const result = await queueLuxorAcceptedProposalAgreement({
      invoice: proposal,
      inquiry,
      requestedBy: session.email,
      forceResend: true,
    })
    await recordLuxorSignatureEvent({
      signatureRequestId: result.signature.id,
      eventType: 'resent',
      metadata: { resentBy: session.email, delivery: 'queued' },
    })
    return NextResponse.json({
      signature: result.signature,
      job: result.job,
      action: 'queued_for_resend',
      delivery: result.delivery,
      message: result.message,
    }, { status: result.delivery === 'preparing' ? 202 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update the contract request.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
