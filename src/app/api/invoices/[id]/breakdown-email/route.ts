import { NextRequest, NextResponse } from 'next/server'
import { beginLuxorProposalSend, claimLuxorProposalPublication, completeLuxorProposalSend, failLuxorProposalSend, finishLuxorProposalPublication, getInvoice, isLuxorProposalHistoryReady, markLuxorProposalSendAttemptSending, reconcileLuxorProposalDeliveryReceipt, updateInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import { assertLuxorWeekdayRentalPublication } from '@/lib/luxorProposalPricingServer'
import { sameDayBookingRequiresRevision } from '@/lib/luxorSameDayBooking'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'
import { getPublicLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { formatCatalogTime } from '@/lib/luxorPricingCatalog'
import { buildLuxorProposalBreakdownEmail, isBreakdownPaymentError, luxorProposalBreakdownHasCompletePrices } from '@/lib/luxorProposalBreakdownEmail'
import { calculateLuxorProposalBreakdownForInvoice } from '@/lib/luxorProposalBreakdownServer'
import { getLuxorActiveProposalDeliveryVariant } from '@/lib/luxorProposalDeliveryReceipt'
import { getLuxorProposalDeliveryReceipt } from '@/lib/luxorProposalDeliveryReceipt'
import { getLuxorProposalDeliverySnapshot } from '@/lib/luxorProposalDeliveryReceipt'
import type { LuxorProposalPackageTierId } from '@/lib/luxorProposalPackages'

const DELIVERY_VARIANT = 'proposal_breakdown_email' as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length <= 254
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
}

function formatClock(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return /^\d{1,2}:\d{2}$/.test(raw) ? formatCatalogTime(raw) : raw
}

function nextDayEventEnd(context: NonNullable<Awaited<ReturnType<typeof updateInvoice>>['proposal_context']>) {
  const eventDate = String(context.event_date || '')
  const endDate = String(context.event_end_at || '').slice(0, 10)
  const endTime = String(context.event_end_time || context.eventEndTime || '')
  return (eventDate && endDate && endDate > eventDate)
    || (context.rental_period === 'custom' && /^\d{1,2}:\d{2}$/.test(endTime) && Number(endTime.slice(0, 2)) < 6)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let invoiceId = 'unknown'
  let publicationAttemptId: string | null = null
  let publicationState = 'failed'
  let proposalSendAttemptId: string | null = null

  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    invoiceId = (await params).id
    let invoice = await getInvoice(invoiceId)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })
    invoice = await reconcileLuxorProposalDeliveryReceipt(invoice)

    if (invoice.invoice_kind !== 'event' || invoice.proposal_context?.proposal_record_type !== 'proposal_breakdown') {
      return NextResponse.json({ error: 'Save this as a Proposal Breakdown before sending its email.' }, { status: 409 })
    }
    if (invoice.proposal_accepted_at || invoice.booking_id || invoice.paid_at || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn') {
      return NextResponse.json({ error: 'This proposal is already accepted, booked, paid, cancelled, or withdrawn.' }, { status: 409 })
    }
    if (invoice.offer_status === 'expired' || isLuxorOfferExpired(invoice)) {
      return NextResponse.json({ error: 'This proposal has expired. Create a new proposal before sending its breakdown.' }, { status: 410 })
    }
    if (invoice.stripe_checkout_session_id) {
      return NextResponse.json({ error: 'This proposal has a legacy payment session attached and needs owner review before it can be published.' }, { status: 409 })
    }
    if (invoice.supersedes_invoice_id) {
      return NextResponse.json({ error: 'Use the final proposal action for revised pricing so the prior offer is replaced only through the established revision flow.' }, { status: 409 })
    }
    assertLuxorWeekdayRentalPublication(invoice)
    if (sameDayBookingRequiresRevision(invoice)) {
      return NextResponse.json({ error: 'This same-day offer needs a revised proposal before publication.' }, { status: 409 })
    }

    const inquiry = invoice.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (!inquiry || inquiry.id !== invoice.inquiry_id) return NextResponse.json({ error: 'The proposal lead could not be verified.' }, { status: 404 })
    if (inquiry.is_test) return NextResponse.json({ error: 'Proposal Breakdown delivery is disabled for isolated Test Leads. Use the synthetic preview only.' }, { status: 409 })
    if (inquiry.status === 'closed_lost') return NextResponse.json({ error: 'This lead is marked Deal Lost. Reopen the opportunity before publishing a proposal.' }, { status: 409 })

    const body = await request.json().catch(() => ({})) as { recipientEmail?: unknown }
    const requestedRecipient = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : ''
    if (!validEmail(requestedRecipient)) return NextResponse.json({ error: 'Enter a valid recipient email address.' }, { status: 400 })

    const context = invoice.proposal_context
    if (!context) return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
    const calculationErrors = Array.isArray(context.calculation_errors) ? context.calculation_errors.filter(Boolean) : []
    const publicationErrors = Array.isArray(context.publication_errors) ? context.publication_errors.filter((error): error is string => typeof error === 'string' && Boolean(error.trim())) : []
    const blockingPublicationError = publicationErrors.find((error) => !isBreakdownPaymentError(error))
    if (blockingPublicationError) return NextResponse.json({ error: blockingPublicationError }, { status: 409 })
    if (calculationErrors.length) return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
    if (Math.abs(Number(context.final_event_price || 0) - Number(invoice.total || 0)) >= 0.005) {
      return NextResponse.json({ error: 'The saved proposal price does not match its pricing snapshot. Create a revised proposal before sending the breakdown.' }, { status: 409 })
    }

    const deliverySnapshot = isRecord(context.delivery_snapshot) ? context.delivery_snapshot : {}
    const storedValue = getLuxorProposalDeliverySnapshot(context, DELIVERY_VARIANT)
    const storedEmail = isRecord(storedValue) ? storedValue : null
    const storedReceipt = getLuxorProposalDeliveryReceipt(context, DELIVERY_VARIANT)
    if (storedReceipt) {
      return NextResponse.json({ invoice, alreadyCompleted: true, reviewUrl: `${publicOrigin()}/proposal/${invoice.public_token}` })
    }
    if (storedEmail && typeof storedEmail.html === 'string' && /Book Now/i.test(storedEmail.html)) {
      return NextResponse.json({ error: 'This earlier breakdown contains a booking link. Review its delivery status and create a new comparison before sending.' }, { status: 409 })
    }
    const hasReusableEmail = Boolean(storedEmail && typeof storedEmail.subject === 'string' && typeof storedEmail.html === 'string'
      && typeof storedEmail.recipient_email === 'string' && typeof storedEmail.review_url === 'string')
    // Validate the saved catalog before reserving a send attempt. A catalog
    // mismatch must not leave a preparing history row that blocks recovery.
    const breakdownPricing = hasReusableEmail ? null : await calculateLuxorProposalBreakdownForInvoice(invoice)
    if (breakdownPricing) {
      const selectedPackage = breakdownPricing.calculation.packages.find((candidate) => candidate.id === breakdownPricing.selection.packageTierId)
      if (!selectedPackage || !breakdownPricing.calculation.packageOptions
        || !luxorProposalBreakdownHasCompletePrices(breakdownPricing.calculation.packageOptions, breakdownPricing.calculation.packages)) {
        return NextResponse.json({ error: 'All four package prices must be available from the saved pricing catalog before sending this breakdown.' }, { status: 409 })
      }
    }
    const priorAttempt = isRecord(context.publication_attempt) ? context.publication_attempt : null
    const activeVariant = getLuxorActiveProposalDeliveryVariant(context)
    if (['preparing', 'sending', 'delivery_unconfirmed'].includes(String(priorAttempt?.state || '')) && activeVariant !== DELIVERY_VARIANT) {
      return NextResponse.json({ error: 'Another email format is still being recovered for this proposal. Retry after its delivery status is resolved.' }, { status: 409 })
    }
    if (['preparing', 'sending'].includes(String(priorAttempt?.state || '')) && Date.now() - Date.parse(String(priorAttempt?.started_at || '')) < 5 * 60_000) {
      return NextResponse.json({ error: 'The Proposal Breakdown email is already being prepared. Wait a moment, then retry to recover its result.' }, { status: 409 })
    }
    if (priorAttempt?.state === 'delivery_unconfirmed' && luxorMailProvider() !== 'resend') {
      return NextResponse.json({ error: 'Email delivery is unconfirmed. Check the mailbox before another send; automatic retry is paused to prevent a duplicate.' }, { status: 409 })
    }

    if (!isLuxorProposalHistoryReady()) {
      return NextResponse.json({ error: 'Proposal send history is unavailable. No email was sent; restore the proposal history service before publishing.' }, { status: 503 })
    }

    let attemptId = activeVariant === DELIVERY_VARIANT && typeof priorAttempt?.id === 'string'
      ? priorAttempt.id
      : crypto.randomUUID()
    const sendReservation = await beginLuxorProposalSend({
      invoiceId: invoice.id,
      attemptId,
      channel: 'email',
      provider: luxorMailProvider(),
      recipientEmail: typeof storedEmail?.recipient_email === 'string' ? storedEmail.recipient_email : requestedRecipient,
      actorEmail: session.email,
    })
    if (isLuxorProposalHistoryReady() && !sendReservation) {
      return NextResponse.json({ error: 'Proposal history is not available. No email was sent.' }, { status: 503 })
    }
    if (sendReservation) {
      if (sendReservation.attempt_id !== attemptId && activeVariant !== DELIVERY_VARIANT) {
        return NextResponse.json({ error: 'Another proposal email is already being recovered. No second message was sent.' }, { status: 409 })
      }
      attemptId = sendReservation.attempt_id
      invoice = { ...invoice, proposal_number: sendReservation.proposal_number }
    }

    const claimed = await claimLuxorProposalPublication(invoice, attemptId, DELIVERY_VARIANT)
    if (!claimed) return NextResponse.json({ error: 'This proposal changed in another request. Retry to recover its current result.' }, { status: 409 })
    invoice = sendReservation ? { ...claimed, proposal_number: sendReservation.proposal_number } : claimed
    if (sendReservation) proposalSendAttemptId = sendReservation.attempt_id
    publicationAttemptId = attemptId
    const now = new Date().toISOString()
    const publicToken = invoice.public_token!
    const reviewUrl = `${publicOrigin()}/proposal/${publicToken}`

    let breakdownEmail: { recipient_email: string; recipient_name: string; subject: string; html: string; review_url: string; rendered_at: string }
    if (storedEmail && typeof storedEmail.subject === 'string' && typeof storedEmail.html === 'string' && typeof storedEmail.recipient_email === 'string' && typeof storedEmail.review_url === 'string') {
      breakdownEmail = {
        recipient_email: storedEmail.recipient_email,
        recipient_name: typeof storedEmail.recipient_name === 'string' ? storedEmail.recipient_name : inquiry.full_name,
        subject: storedEmail.subject,
        html: storedEmail.html,
        review_url: storedEmail.review_url,
        rendered_at: typeof storedEmail.rendered_at === 'string' ? storedEmail.rendered_at : now,
      }
    } else {
      const { selection, calculation } = breakdownPricing!
      const selectedPackage = calculation.packages.find((candidate) => candidate.id === selection.packageTierId)!
      const phoneNumber = await getPublicLuxorPhoneNumber()
      const context = invoice.proposal_context!
      const eventDate = String(context.event_date || '')
      const eventEndRaw = String(context.event_end_time || context.eventEndTime || '')
      const eventEnd = `${formatClock(eventEndRaw)}${nextDayEventEnd(context) ? ' (next day)' : ''}`
      const rentalStartRaw = String(context.rental_start_time || context.start_time || selection.rentalStartTime || selection.rental_start_time || '')
      const rentalEndRaw = String(context.rental_end_time || context.end_time || selection.rentalEndTime || selection.rental_end_time || '')
      const rentalEndsNextDay = context.rental_period === 'custom' && /^\d{1,2}:\d{2}$/.test(rentalEndRaw) && Number(rentalEndRaw.slice(0, 2)) < 6
      const venueAccess = `${formatClock(rentalStartRaw)}–${formatClock(rentalEndRaw)}${rentalEndsNextDay ? ' (next day)' : ''}`
      const html = buildLuxorProposalBreakdownEmail({
        recipientName: inquiry.full_name,
        eventType: String(context.event_type || invoice.event_type || 'Event'),
        eventDate,
        guestCount: Number(context.expected_guest_count || 0),
        venueAccess: venueAccess === '–' ? 'To be confirmed' : venueAccess,
        guestArrival: formatClock(String(context.guest_arrival_time || context.guestArrivalTime || '')),
        eventEnd,
        selectedPackageId: selection.packageTierId as LuxorProposalPackageTierId,
        packageOptions: calculation.packageOptions!,
        packages: calculation.packages,
        selectedPackage,
        addOnQuotes: calculation.addOnQuotes,
        phoneNumber,
        bookingUrl: reviewUrl,
      }).html
      breakdownEmail = {
        recipient_email: requestedRecipient,
        recipient_name: inquiry.full_name,
        subject: `Proposal Breakdown: ${String(context.event_type || invoice.event_type || 'Your Luxor event')}`,
        html,
        review_url: reviewUrl,
        rendered_at: now,
      }
    }

    const proposalBreakdownSnapshot = {
      ...breakdownEmail,
      proposal_send_attempt_id: attemptId,
      delivery_state: 'prepared',
      delivery_sent_at: null,
      provider_message_id: null,
    }
    const preparedDeliverySnapshot = {
      ...deliverySnapshot,
      [DELIVERY_VARIANT]: proposalBreakdownSnapshot,
    }
    const preparedInvoice = await updateInvoice(invoice.id, {
      public_token: publicToken,
      price_locked_at: invoice.price_locked_at || now,
      proposal_version: Math.max(1, Number(invoice.proposal_version || 1)),
      status: invoice.proposal_sent_at ? 'sent' : 'draft',
      proposal_context: {
        ...(invoice.proposal_context || {}),
        version: Number(invoice.proposal_context?.version || 1),
        proposal_record_type: 'proposal_breakdown',
        publication_attempt: { id: attemptId, variant: DELIVERY_VARIANT, state: 'preparing', started_at: String(priorAttempt?.started_at || now) },
        delivery_snapshot: preparedDeliverySnapshot,
      },
    })
    if (!preparedInvoice || preparedInvoice.public_token !== publicToken) {
      throw new Error('The Proposal Breakdown could not be saved. No email was sent; retry to recover the saved proposal.')
    }

    const emailJob = {
      inquiryId: inquiry.id,
      jobType: 'booking_package' as const,
      recipientEmail: breakdownEmail.recipient_email,
      subject: breakdownEmail.subject,
      body: `Your Luxor package comparison is ready. Contact Luxor to discuss your preferred package.`,
      scheduledFor: now,
      metadata: { manual: true, requestedBy: session.email, flow_stage: 'proposal_breakdown', proposal_version: preparedInvoice.proposal_version || 1, price_locked_at: preparedInvoice.price_locked_at, review_url: reviewUrl, proposal_record_type: 'proposal_breakdown' },
    }
    let providerAccepted = false
    try {
      const ownsDelivery = await finishLuxorProposalPublication(preparedInvoice.id, attemptId, 'sending')
      if (!ownsDelivery) throw new Error('This proposal changed before delivery. Retry to recover its current result.')
      if (sendReservation && !await markLuxorProposalSendAttemptSending(sendReservation.attempt_id)) {
        throw new Error('The Proposal Breakdown send attempt changed before delivery. Retry to recover its saved result.')
      }
      publicationState = 'delivery_unconfirmed'
      const receipt = await sendLuxorZohoEmail({
        idempotencyKey: sendReservation?.idempotency_key || `proposal-breakdown/${preparedInvoice.id}/${preparedInvoice.proposal_version || 1}`,
        metadata: sendReservation ? { proposal_send_attempt_id: sendReservation.attempt_id, proposal_number: sendReservation.proposal_number, proposal_record_type: 'proposal_breakdown' } : undefined,
        to: breakdownEmail.recipient_email,
        subject: breakdownEmail.subject,
        content: breakdownEmail.html,
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
      })
      providerAccepted = true
      await createLuxorEmailJob({ ...emailJob, status: 'sent', sentAt: now }).catch((error) => {
        console.error('Proposal Breakdown was delivered, but its email receipt could not be recorded:', error)
      })
      const providerMessageId = 'providerMessageId' in receipt && typeof receipt.providerMessageId === 'string'
        ? receipt.providerMessageId
        : 'messageId' in receipt && typeof receipt.messageId === 'string' ? receipt.messageId : null
      const deliveredSnapshot = {
        ...preparedDeliverySnapshot,
        [DELIVERY_VARIANT]: {
          ...proposalBreakdownSnapshot,
          delivery_state: 'delivered',
          delivery_sent_at: now,
          provider_message_id: providerMessageId,
          proposal_send_attempt_id: sendReservation?.attempt_id || attemptId,
        },
      }
      let updated = await updateInvoice(preparedInvoice.id, {
        status: 'sent',
        proposal_sent_at: now,
        proposal_context: { ...(preparedInvoice.proposal_context || {}), version: Number(preparedInvoice.proposal_context?.version || 1), delivery_snapshot: deliveredSnapshot },
      })
      if (!updated) throw new Error('The Proposal Breakdown email was accepted, but its durable receipt could not be saved. Retry to recover that receipt.')
      if (sendReservation) {
        const completed = await completeLuxorProposalSend(sendReservation.attempt_id, providerMessageId, now)
        if (!completed) throw new Error('The Proposal Breakdown was sent, but its proposal history could not be finalized. Retry to recover the receipt.')
        updated = completed
      }
      publicationState = 'completed'
      return NextResponse.json({ invoice: updated, reviewUrl, mode: 'proposal_breakdown', alreadyCompleted: false })
    } catch (error) {
      if (!providerAccepted) {
        const lastError = error instanceof Error ? error.message : 'Proposal Breakdown email failed.'
        await createLuxorEmailJob({ ...emailJob, status: 'failed', lastError }).catch((ledgerError) => {
          console.error('Proposal Breakdown email failed, but its failure receipt could not be recorded:', ledgerError)
        })
      }
      throw error
    }
  } catch (error) {
    if (proposalSendAttemptId && isLuxorProposalHistoryReady()) {
      await failLuxorProposalSend(
        proposalSendAttemptId,
        error instanceof Error ? error.message : 'Proposal Breakdown email failed.',
        publicationState === 'delivery_unconfirmed',
      ).catch((historyError) => console.error('Proposal Breakdown failed and its attempt history could not be updated:', historyError))
    }
    console.error('[proposal-breakdown-email] failed', { invoiceId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send the Proposal Breakdown.' }, { status: 500 })
  } finally {
    if (publicationAttemptId) await finishLuxorProposalPublication(invoiceId, publicationAttemptId, publicationState).catch((error) => console.error('Proposal Breakdown delivery state needs reconciliation:', error))
  }
}

function publicOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
}
