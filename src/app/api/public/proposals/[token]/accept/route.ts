import { NextResponse } from 'next/server'
import { getInvoiceByPublicToken, updateInvoice } from '@/lib/luxorInvoicesServer'
import { createLuxorBooking, getLuxorBooking, listLuxorBookingsByInquiry, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import {
  createLuxorSignatureRequest,
  getActiveLuxorSignatureRequestByBooking,
  getLatestLuxorSignatureRequestByBooking,
  recordLuxorSignatureEvent,
  updateLuxorSignatureRequest,
} from '@/lib/luxorSignaturesServer'
import { isLuxorOfferExpired, roundLuxorMoney } from '@/lib/luxorOffer'
import { createNote } from '@/lib/luxorNotesServer'
import type { LuxorSignatureRequest } from '@/lib/luxorInquiryTypes'
import { buildLuxorProposalContractEmail } from '@/lib/luxorProposalEmailServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { downloadLuxorDocument, downloadLuxorPrivatePdf, getLuxorDocumentByInvoice, saveLuxorProposalPdf } from '@/lib/luxorDocumentsServer'
import { createLuxorEmailJob, listLuxorEmailJobsForInquiry, updateLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'

export const dynamic = 'force-dynamic'

function publicOrigin(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '')
}

function requestIp(request: Request) {
  return (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '').slice(0, 128) || null
}

function requestUserAgent(request: Request) {
  return (request.headers.get('user-agent') || '').slice(0, 1_000) || null
}

function paymentTerms(invoiceTotal: number, context: Record<string, unknown>) {
  const plan = context.payment_plan && typeof context.payment_plan === 'object'
    ? context.payment_plan as Record<string, unknown>
    : null
  if (!plan) return null
  const mode = plan.mode === 'pay_in_full' || plan.mode === 'deposit_and_balance'
    ? plan.mode
    : null
  const percentage = Number(plan.booking_payment_percent)
  const finalPaymentDays = Number(plan.final_payment_due_days_before_event)
  if (!mode || !Number.isFinite(percentage) || percentage < 0 || percentage > 100 ||
    !Number.isInteger(finalPaymentDays) || finalPaymentDays < 0 ||
    (mode === 'deposit_and_balance' && percentage <= 0)) {
    return null
  }
  const reservationPayment = mode === 'pay_in_full'
    ? invoiceTotal
    : roundLuxorMoney(invoiceTotal * (percentage / 100))
  return {
    mode,
    percentage,
    finalPaymentDays,
    reservationPayment: Math.min(invoiceTotal, reservationPayment),
  }
}

function finalPaymentDueDate(eventDate: string, daysBeforeEvent: number) {
  const event = new Date(`${eventDate}T12:00:00`)
  event.setDate(event.getDate() - daysBeforeEvent)
  return event.toISOString().slice(0, 10)
}

/**
 * A prospect's decision has a deliberately separate audit event from contract
 * signature. This route locks the published proposal, creates the matching
 * booking if necessary, and emails the agreement. It never creates a payment
 * link: Stripe is only prepared by the post-signature workflow.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const invoice = await getInvoiceByPublicToken(token)
    if (!invoice || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn') {
      return NextResponse.json({ error: 'This proposal is no longer available.' }, { status: 404 })
    }
    if (!invoice.price_locked_at || invoice.status !== 'sent') {
      return NextResponse.json({ error: 'Luxor must publish the final proposal before it can be accepted.' }, { status: 409 })
    }
    if (isLuxorOfferExpired(invoice)) {
      return NextResponse.json({ error: 'This proposal has expired. Please contact Luxor for a refreshed proposal.' }, { status: 410 })
    }
    if (!invoice.inquiry_id) return NextResponse.json({ error: 'This proposal is missing its client record.' }, { status: 409 })

    const inquiry = await getLuxorInquiry(invoice.inquiry_id)
    if (!inquiry?.email) return NextResponse.json({ error: 'Luxor needs a client email before an agreement can be issued.' }, { status: 409 })

    const context = (invoice.proposal_context && typeof invoice.proposal_context === 'object'
      ? invoice.proposal_context
      : {}) as Record<string, unknown>
    const eventDate = typeof context.event_date === 'string' ? context.event_date : inquiry.target_date
    const guestCount = Number(context.expected_guest_count ?? inquiry.guest_count)
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 200) {
      return NextResponse.json({ error: 'The final proposal is missing valid event date or expected guest-count details. Luxor must revise it before acceptance.' }, { status: 409 })
    }

    const terms = paymentTerms(Number(invoice.total || 0), context)
    const refundableSecurityDeposit = Number(context.refundable_security_deposit)
    if (!terms || !Number.isFinite(refundableSecurityDeposit) || refundableSecurityDeposit !== 750) {
      return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
    }
    const bookings = await listLuxorBookingsByInquiry(inquiry.id)
    let booking = invoice.booking_id
      ? await getLuxorBooking(invoice.booking_id)
      : bookings.find((item) => item.invoice_id === invoice.id) || null

    if (!booking) {
      booking = await createLuxorBooking({
        inquiry_id: inquiry.id,
        invoice_id: invoice.id,
        lead_event_id: invoice.lead_event_id || null,
        client_name: invoice.client_name || inquiry.full_name,
        email: inquiry.email,
        phone: inquiry.phone,
        event_type: typeof context.event_type === 'string' ? context.event_type : invoice.event_type || inquiry.event_type,
        event_date: eventDate,
        start_time: typeof context.start_time === 'string' ? context.start_time : null,
        end_time: typeof context.end_time === 'string' ? context.end_time : null,
        guest_count: guestCount,
        package_name: typeof context.package_name === 'string' ? context.package_name : inquiry.package_interest,
        status: 'tentative',
        contract_total: Number(invoice.total || 0),
        deposit_required: terms.reservationPayment,
        security_deposit_amount: roundLuxorMoney(refundableSecurityDeposit),
        security_deposit_status: 'due',
        final_payment_due_date: finalPaymentDueDate(eventDate, terms.finalPaymentDays),
        contract_status: 'not_sent',
        notes: invoice.notes,
        metadata: {
          proposal_invoice_id: invoice.id,
          proposal_version: invoice.proposal_version || 1,
          final_proposal_context: context,
          reservation_payment_mode: terms.mode,
          reservation_payment_percent: terms.percentage,
          reservation_state: 'proposal_accepted_awaiting_contract',
        },
      })
      await updateInvoice(invoice.id, { booking_id: booking.id })
    } else if (booking.contract_status === 'signed') {
      return NextResponse.json({ accepted: true, alreadySigned: true })
    } else {
      // The locked proposal remains the authority. Re-align an old draft booking
      // before creating the agreement rather than allowing a stale total through.
      booking = await updateLuxorBooking(booking.id, {
        invoice_id: invoice.id,
        lead_event_id: invoice.lead_event_id || booking.lead_event_id || null,
        client_name: invoice.client_name || inquiry.full_name,
        email: inquiry.email,
        phone: inquiry.phone,
        event_type: typeof context.event_type === 'string' ? context.event_type : invoice.event_type || inquiry.event_type,
        event_date: eventDate,
        start_time: typeof context.start_time === 'string' ? context.start_time : booking.start_time,
        end_time: typeof context.end_time === 'string' ? context.end_time : booking.end_time,
        guest_count: guestCount,
        package_name: typeof context.package_name === 'string' ? context.package_name : booking.package_name,
        contract_total: Number(invoice.total || 0),
        deposit_required: terms.reservationPayment,
        security_deposit_amount: roundLuxorMoney(refundableSecurityDeposit),
        security_deposit_status: booking.security_deposit_status || 'due',
        final_payment_due_date: finalPaymentDueDate(eventDate, terms.finalPaymentDays),
        metadata: {
          ...booking.metadata,
          proposal_invoice_id: invoice.id,
          proposal_version: invoice.proposal_version || 1,
          final_proposal_context: context,
          reservation_payment_mode: terms.mode,
          reservation_payment_percent: terms.percentage,
          reservation_state: ['sent', 'viewed'].includes(booking.contract_status || '')
            ? booking.metadata?.reservation_state || 'awaiting_signature'
            : 'proposal_accepted_awaiting_contract',
        },
      }) || booking
      if (!invoice.booking_id) await updateInvoice(invoice.id, { booking_id: booking.id })
    }

    const now = new Date().toISOString()
    const acceptedAlready = Boolean(invoice.proposal_accepted_at)
    const acceptedInvoice = acceptedAlready
      ? invoice
      : await updateInvoice(invoice.id, {
          proposal_accepted_at: now,
          proposal_accepted_ip: requestIp(request),
          proposal_accepted_user_agent: requestUserAgent(request),
          offer_status: 'active',
        }) || invoice

    // A previous attempt may have created the agreement but failed before the
    // email or booking transition completed. Reuse that exact agreement on a
    // retry; its sent email job is the delivery receipt.
    let signature: LuxorSignatureRequest | null = await getActiveLuxorSignatureRequestByBooking(booking.id)
    if (!signature) {
      const latestSignature = await getLatestLuxorSignatureRequestByBooking(booking.id)
      signature = latestSignature?.status === 'draft' ? latestSignature : null
    }
    const agreementJobs = await listLuxorEmailJobsForInquiry(inquiry.id, 200)
    const existingSignatureId = signature?.id || null
    let agreementJob = existingSignatureId
      ? agreementJobs.find((job) => job.signature_request_id === existingSignatureId && job.job_type === 'contract_signature') || null
      : null
    const agreementDeliveryRecorded = Boolean(signature && (
      agreementJob?.status === 'sent' ||
      signature.status === 'viewed' ||
      (booking.metadata?.latest_signature_request_id === signature.id && booking.metadata?.reservation_state === 'awaiting_signature')
    ))
    const agreementLifecycleComplete = Boolean(signature && agreementDeliveryRecorded &&
      ['sent', 'viewed'].includes(booking.contract_status || '') &&
      inquiry.status === 'booked' && inquiry.pipeline_stage === 'contract')
    if (agreementLifecycleComplete && signature) {
      return NextResponse.json({
        accepted: true,
        alreadyAccepted: true,
        signingUrl: `${publicOrigin(request)}/secure-portal/sign/${signature.token}`,
      })
    }

    let activatedDraftSignature = false
    if (!signature) {
      // Keep a newly created agreement inactive until this route has prepared
      // it. This avoids marking the booking as sent before delivery succeeds.
      signature = await createLuxorSignatureRequest(booking, { status: 'draft' })
      agreementJob = null
    }
    if (signature.status === 'draft') {
      const activated = await updateLuxorSignatureRequest(signature.id, { status: 'sent' })
      if (!activated) throw new Error('The agreement could not be activated for signing.')
      signature = activated
      activatedDraftSignature = true
    }
    const signingUrl = `${publicOrigin(request)}/secure-portal/sign/${signature.token}`

    if (!agreementDeliveryRecorded) {
      // The proposal PDF was frozen at publish time. A fallback exists only for
      // legacy sent proposals that predate the document record.
      const proposalDocument = await getLuxorDocumentByInvoice(acceptedInvoice.id, 'proposal')
      const proposalPdf = proposalDocument
        ? await downloadLuxorDocument(proposalDocument)
        : await buildLuxorInvoicePdf(acceptedInvoice, inquiry)
      if (!proposalDocument) {
        await saveLuxorProposalPdf({ invoice: acceptedInvoice, inquiryId: inquiry.id, pdf: proposalPdf, createdBy: 'Proposal Acceptance Recovery' })
      }
      const [contractPdf, guidePdf] = await Promise.all([
        downloadLuxorPrivatePdf(signature.contract_document_path || ''),
        downloadLuxorPrivatePdf(signature.guest_guide_path || ''),
      ])
      const email = await buildLuxorProposalContractEmail({ invoice: acceptedInvoice, inquiry, booking, signingUrl })
      agreementJob ||= await createLuxorEmailJob({
        inquiryId: inquiry.id,
        bookingId: booking.id,
        signatureRequestId: signature.id,
        jobType: 'contract_signature',
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: `Your final Luxor proposal was accepted. Review and sign your event agreement: ${signingUrl}`,
        scheduledFor: now,
        metadata: {
          automated: true,
          flow_stage: 'proposal_accepted_contract_sent',
          invoice_id: acceptedInvoice.id,
          proposal_version: acceptedInvoice.proposal_version || 1,
          includes_proposal_pdf: true,
          includes_contract_pdf: true,
          includes_guest_guide: true,
        },
      })
      try {
        await sendLuxorZohoEmail({
          to: inquiry.email,
          subject: email.subject,
          content: email.html,
          from: 'booking@luxoratlaspalmas.com',
          fromName: 'Luxor Event Space',
          attachments: [
            { filename: `Luxor-Final-Proposal-${acceptedInvoice.id.slice(0, 8)}.pdf`, content: proposalPdf, contentType: 'application/pdf' },
            { filename: 'Luxor-Event-Agreement.pdf', content: contractPdf, contentType: 'application/pdf' },
            { filename: 'Luxor-Guest-Guide.pdf', content: guidePdf, contentType: 'application/pdf' },
          ],
        })
        await updateLuxorEmailJob(agreementJob.id, { status: 'sent', sent_at: now, last_error: null })
      } catch (error) {
        await updateLuxorEmailJob(agreementJob.id, { status: 'failed', last_error: error instanceof Error ? error.message : 'Agreement email failed.' })
        throw error
      }
    }

    if (activatedDraftSignature) {
      await recordLuxorSignatureEvent({ signatureRequestId: signature.id, eventType: 'sent', metadata: { delivery: 'proposal_acceptance' } }).catch(() => null)
    }

    await updateLuxorBooking(booking.id, {
      contract_status: 'sent',
      contract_sent_at: now,
      metadata: { ...booking.metadata, proposal_accepted_at: now, latest_signature_request_id: signature.id, reservation_state: 'awaiting_signature' },
    })
    await updateLuxorInquiry(inquiry.id, {
      status: 'booked',
      pipeline_stage: 'contract',
      metadata: { ...inquiry.metadata, proposal_accepted_at: now, latest_proposal_invoice_id: acceptedInvoice.id, latest_signature_request_id: signature.id },
    })
    await createNote(inquiry.id, 'Client selected and accepted the final proposal. The event agreement was emailed for signature; Stripe will be sent only after signature.', 'status_change', 'Client Proposal Portal').catch(() => null)

    return NextResponse.json({ accepted: true, signingUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'We could not record your proposal selection.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
