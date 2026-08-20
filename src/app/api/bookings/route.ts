import { NextRequest, NextResponse } from 'next/server'
import { createLuxorBooking, findLuxorBookingConflicts, getLuxorBooking, listLuxorBookingsByInquiry, listLuxorBookingsWithPayments, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildEventEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { queueBookingTextJobs } from '@/lib/luxorTextCampaignsServer'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT, parseLuxorCurrency } from '@/lib/luxorBookingMoney'
import { luxorCollectionAmounts } from '@/lib/luxorPaymentOwnership'
import { getActiveLuxorSignatureRequestByBooking, getLuxorBookingContractFingerprint, recordLuxorSignatureEvent, updateLuxorSignatureRequest } from '@/lib/luxorSignaturesServer'
import { getLuxorLeadEventForInquiry, updateLuxorLeadEvent } from '@/lib/luxorLeadEventsServer'
import type { LuxorPipelineStage } from '@/lib/luxorInquiryTypes'

function isFinalProposalLocked(proposal: Awaited<ReturnType<typeof getInvoice>> | null) {
  return Boolean(
    proposal
    && proposal.invoice_kind === 'event'
    && (proposal.price_locked_at || proposal.status === 'sent' || proposal.proposal_accepted_at),
  )
}

function changesLockedAgreementTerms(updates: Record<string, unknown>) {
  return [
    'invoice_id',
    'lead_event_id',
    'client_name',
    'email',
    'phone',
    'event_type',
    'event_date',
    'start_time',
    'end_time',
    'guest_count',
    'package_name',
    'contract_total',
    'deposit_required',
    'security_deposit_amount',
    'final_payment_due_date',
    'notes',
    'contract_status',
  ].some((key) => updates[key] !== undefined)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (inquiryId) {
      const bookings = await listLuxorBookingsByInquiry(inquiryId)
      return NextResponse.json(bookings)
    }

    const bookings = await listLuxorBookingsWithPayments(1000)
    return NextResponse.json(bookings)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch bookings.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const proposalId = typeof body.invoice_id === 'string' ? body.invoice_id.trim() : ''
    if (!proposalId) {
      return NextResponse.json({ error: 'Bookings are created automatically after the client accepts a published final proposal. Publish the proposal instead of creating a standalone booking.' }, { status: 409 })
    }

    const proposal = await getInvoice(proposalId)
    if (!proposal || proposal.invoice_kind !== 'event' || proposal.status !== 'sent' || !proposal.price_locked_at || !proposal.proposal_accepted_at || proposal.offer_status === 'withdrawn') {
      return NextResponse.json({ error: 'A client-accepted, price-locked final proposal is required before a booking can be created.' }, { status: 409 })
    }
    if (!proposal.inquiry_id || proposal.inquiry_id !== body.inquiry_id) {
      return NextResponse.json({ error: 'The final proposal must belong to the booking lead.' }, { status: 409 })
    }
    const inquiryBeforeBooking = await getLuxorInquiry(proposal.inquiry_id)
    if (inquiryBeforeBooking?.status === 'closed_lost') {
      return NextResponse.json({ error: 'This lead is marked Deal Lost. A new booking cannot be created from a withdrawn proposal.' }, { status: 409 })
    }

    const existingBooking = (await listLuxorBookingsByInquiry(proposal.inquiry_id)).find((item) => item.invoice_id === proposal.id)
    if (existingBooking) return NextResponse.json(existingBooking)

    const context = proposal.proposal_context && typeof proposal.proposal_context === 'object'
      ? proposal.proposal_context as Record<string, unknown>
      : null
    const eventDate = typeof context?.event_date === 'string' ? context.event_date : null
    const paymentPlan = context?.payment_plan && typeof context.payment_plan === 'object'
      ? context.payment_plan as Record<string, unknown>
      : null
    const paymentMode = paymentPlan?.mode === 'deposit_and_balance' || paymentPlan?.mode === 'pay_in_full'
      ? paymentPlan.mode
      : null
    const bookingPaymentPercent = Number(paymentPlan?.booking_payment_percent)
    const finalPaymentDays = Number(paymentPlan?.final_payment_due_days_before_event)
    if (!context || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !paymentMode || !Number.isFinite(bookingPaymentPercent) || bookingPaymentPercent < 0 || bookingPaymentPercent > 100 || !Number.isInteger(finalPaymentDays) || finalPaymentDays < 0) {
      return NextResponse.json({ error: 'Pricing configuration required — administrator review.' }, { status: 409 })
    }

    const leadEventId = proposal.lead_event_id || (body.lead_event_id ? String(body.lead_event_id) : null)
    if (leadEventId && !await getLuxorLeadEventForInquiry(leadEventId, proposal.inquiry_id)) {
      return NextResponse.json({ error: 'The selected event does not belong to this lead.' }, { status: 400 })
    }
    const conflicts = await findLuxorBookingConflicts(eventDate)
    if (conflicts.length > 0) {
      return NextResponse.json({ error: `That date already has an active booking for ${conflicts[0].client_name}. Review the calendar before continuing.`, conflicts }, { status: 409 })
    }

    const dueDate = new Date(`${eventDate}T12:00:00`)
    dueDate.setDate(dueDate.getDate() - finalPaymentDays)
    const contractTotal = Number(proposal.total || 0)
    const luxorServicesTotal = luxorCollectionAmounts(proposal).luxorServicesTotal
    const reservationPayment = paymentMode === 'pay_in_full'
      ? luxorServicesTotal
      : Math.min(luxorServicesTotal, Math.round(luxorServicesTotal * bookingPaymentPercent) / 100)
    const normalizedBody = {
      ...body,
      inquiry_id: proposal.inquiry_id,
      invoice_id: proposal.id,
      lead_event_id: leadEventId,
      client_name: proposal.client_name || body.client_name,
      event_type: typeof context.event_type === 'string' ? context.event_type : proposal.event_type || body.event_type,
      event_date: eventDate,
      start_time: typeof context.start_time === 'string' ? context.start_time : null,
      end_time: typeof context.end_time === 'string' ? context.end_time : null,
      guest_count: Number(context.expected_guest_count || body.guest_count || 0) || null,
      package_name: typeof context.package_name === 'string' ? context.package_name : body.package_name || null,
      status: 'tentative',
      contract_total: contractTotal,
      deposit_required: reservationPayment,
      security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT,
      security_deposit_status: 'due',
      final_payment_due_date: dueDate.toISOString().slice(0, 10),
      metadata: {
        ...(body.metadata || {}),
        proposal_invoice_id: proposal.id,
        proposal_version: proposal.proposal_version || 1,
        final_proposal_context: context,
        reservation_payment_mode: paymentMode,
        reservation_payment_percent: paymentMode === 'pay_in_full' ? 100 : bookingPaymentPercent,
        payment_collection_scope: proposal.proposal_context?.payment_collection_scope || 'legacy_full_event',
        luxor_services_total: luxorServicesTotal,
        planner_services_total: Math.max(0, contractTotal - luxorServicesTotal),
        reservation_state: 'proposal_accepted_awaiting_contract',
      },
    }
    const booking = await createLuxorBooking(normalizedBody)
    if (booking?.inquiry_id) {
      const inquiry = await getLuxorInquiry(booking.inquiry_id)
      if (inquiry && inquiry.status !== 'closed_lost') {
        if (leadEventId) {
          const event = await getLuxorLeadEventForInquiry(leadEventId, inquiry.id)
          if (event) {
            await updateLuxorLeadEvent(event.id, {
              status: 'booked',
              pipeline_stage: 'contract',
              metadata: {
                ...event.metadata,
                booking_created_at: booking.created_at,
                latest_booking_id: booking.id,
              },
            })
          }
          await createNote(inquiry.id, `${booking.event_type || 'Event'} booking record created. Event advanced to Contract.`, 'status_change', session.email)
        } else {
          await updateLuxorInquiry(inquiry.id, {
            status: 'booked',
            pipeline_stage: 'contract',
            metadata: {
              ...inquiry.metadata,
              booking_created_at: booking.created_at,
              latest_booking_id: booking.id,
            },
          })
          if (inquiry.status !== 'booked') {
            await createNote(inquiry.id, 'Booking record created. Lead advanced to Contract.', 'status_change', session.email)
          }
        }
        await cancelQueuedLuxorEmailJobs(inquiry.id, ['proposal_view_reminder', 'proposal_payment_reminder'])
        try {
          await queueBookingTextJobs({
            ...booking,
            phone: booking.phone || inquiry.phone,
            client_name: booking.client_name || inquiry.full_name,
          })
        } catch (automationError) {
          console.error('Booking created, but its text reminders could not be queued:', automationError)
        }
      }
    }
    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create booking.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { id, ...updates } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'Booking id is required.' }, { status: 400 })
    }

    const existing = await getLuxorBooking(id)
    if (!existing) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    if (existing.inquiry_id) {
      const inquiry = await getLuxorInquiry(existing.inquiry_id)
      if (inquiry?.status === 'closed_lost') {
        return NextResponse.json({ error: 'This lead is marked Deal Lost. Update the close-out record instead of changing this booking.' }, { status: 409 })
      }
    }

    // Signing is recorded only by the signature workflow. That workflow
    // captures the signer audit trail, locks the agreement, and then opens
    // the payment step. A portal PATCH must not be able to skip it.
    if (updates.contract_status === 'signed') {
      return NextResponse.json({ error: 'A contract can be marked signed only by the secure signature workflow.' }, { status: 409 })
    }

    const linkedProposal = existing.invoice_id ? await getInvoice(existing.invoice_id) : null
    if (isFinalProposalLocked(linkedProposal) && changesLockedAgreementTerms(updates)) {
      return NextResponse.json({ error: 'This booking is tied to a locked final proposal. Create a revised proposal before changing agreement or pricing terms.' }, { status: 409 })
    }

    if (updates.invoice_id && updates.invoice_id !== existing.invoice_id) {
      const replacementProposal = await getInvoice(String(updates.invoice_id))
      if (isFinalProposalLocked(replacementProposal)) {
        return NextResponse.json({ error: 'A locked final proposal can only create its booking through client acceptance.' }, { status: 409 })
      }
    }

    const leadEventId = updates.lead_event_id || existing.lead_event_id || null
    if (leadEventId && (!existing.inquiry_id || !await getLuxorLeadEventForInquiry(String(leadEventId), existing.inquiry_id))) {
      return NextResponse.json({ error: 'The selected event does not belong to this lead.' }, { status: 400 })
    }

    const nextDate = updates.event_date === undefined ? existing.event_date : updates.event_date
    const nextStatus = updates.status === undefined ? existing.status : updates.status
    if (nextDate && (nextStatus === 'tentative' || nextStatus === 'confirmed')) {
      const conflicts = await findLuxorBookingConflicts(nextDate, id)
      if (conflicts.length > 0) {
        return NextResponse.json({ error: `That date already has an active booking for ${conflicts[0].client_name}. Review the calendar before continuing.`, conflicts }, { status: 409 })
      }
    }

    const normalizedUpdates = {
      ...updates,
      ...(updates.deposit_required === undefined ? {} : { deposit_required: parseLuxorCurrency(updates.deposit_required) }),
      ...(updates.security_deposit_amount === undefined ? {} : { security_deposit_amount: LUXOR_DEFAULT_SECURITY_DEPOSIT }),
    }
    let booking = await updateLuxorBooking(id, normalizedUpdates)
    if (booking) {
      const activeAgreement = await getActiveLuxorSignatureRequestByBooking(booking.id)
      const currentFingerprint = getLuxorBookingContractFingerprint(booking)
      if (activeAgreement && activeAgreement.metadata?.bookingFingerprint !== currentFingerprint) {
        await updateLuxorSignatureRequest(activeAgreement.id, {
          status: 'void',
          expires_at: new Date().toISOString(),
          metadata: {
            ...(activeAgreement.metadata || {}),
            invalidatedAt: new Date().toISOString(),
            invalidatedReason: 'Booking financial or agreement terms changed before signature.',
          },
        })
        await recordLuxorSignatureEvent({
          signatureRequestId: activeAgreement.id,
          eventType: 'invalidated',
          metadata: { reason: 'Booking financial or agreement terms changed before signature.' },
        })
        booking = await updateLuxorBooking(booking.id, { contract_status: 'void' }) || booking
        if (booking.inquiry_id) {
          await createNote(booking.inquiry_id, 'Unsigned agreement invalidated because booking terms changed. Send a new agreement before the client signs.', 'status_change', session.email)
        }
      }
    }
    if (booking?.inquiry_id) {
      const inquiry = await getLuxorInquiry(booking.inquiry_id)
      if (inquiry && inquiry.status !== 'closed_lost') {
        if (leadEventId) {
          await updateLuxorLeadEvent(leadEventId, {
            status: 'booked',
            pipeline_stage: eventPipelineStageForBooking(booking),
          })
        } else {
          await updateLuxorInquiry(inquiry.id, {
            status: 'booked',
            pipeline_stage: pipelineStageForBooking(booking),
          })
        }
        try {
          await syncBookingEmailAutomations({ inquiry, booking, previous: existing })
        } catch (automationError) {
          console.error('Booking advanced, but its reminder automation could not be updated:', automationError)
        }
        try {
          await queueBookingTextJobs({
            ...booking,
            phone: booking.phone || inquiry.phone,
            client_name: booking.client_name || inquiry.full_name,
          })
        } catch (automationError) {
          console.error('Booking advanced, but its text reminders could not be updated:', automationError)
        }
      }
    }
    return NextResponse.json(booking)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update booking.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function pipelineStageForBooking(booking: NonNullable<Awaited<ReturnType<typeof getLuxorBooking>>>) {
  const metadata = booking.metadata || {}
  if (metadata.lead_completed_at || booking.status === 'completed') return 'complete'
  if (metadata.closeout_completed_at) return 'closing'
  if (metadata.event_completed_at) return 'closing'
  if (booking.contract_status !== 'signed') return 'contract'
  if (!metadata.deposit_paid_at && !metadata.deposit_paid_before_booking && booking.security_deposit_status !== 'held' && booking.security_deposit_status !== 'collected') return 'deposit'
  if (!metadata.planning_completed_at) return 'planning'
  if (!(metadata.final_payment_recorded_manually_at || metadata.final_payment_paid_at)) return 'final_payment'
  return 'event'
}

function eventPipelineStageForBooking(booking: NonNullable<Awaited<ReturnType<typeof getLuxorBooking>>>) {
  const stage = pipelineStageForBooking(booking)
  return (stage === 'complete' ? 'closing' : stage) as LuxorPipelineStage
}

async function syncBookingEmailAutomations(input: {
  inquiry: NonNullable<Awaited<ReturnType<typeof getLuxorInquiry>>>
  booking: NonNullable<Awaited<ReturnType<typeof getLuxorBooking>>>
  previous: NonNullable<Awaited<ReturnType<typeof getLuxorBooking>>>
}) {
  if (!input.inquiry.email) return
  const metadata = input.booking.metadata || {}
  const previousMetadata = input.previous.metadata || {}

  if ((metadata.final_payment_recorded_manually_at || metadata.final_payment_paid_at) &&
      !(previousMetadata.final_payment_recorded_manually_at || previousMetadata.final_payment_paid_at)) {
    await cancelQueuedLuxorEmailJobs(input.inquiry.id, ['final_payment_reminder'])
  }

  if (metadata.planning_completed_at && !previousMetadata.planning_completed_at && input.booking.event_date) {
    const details = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'details' })
    const day = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'day' })
    const eventTime = new Date(`${input.booking.event_date}T12:00:00-05:00`).getTime()
    const reminders = [
      { kind: 'event_details_reminder' as const, offset: 14, email: details },
      { kind: 'event_day_reminder' as const, offset: 2, email: day },
    ]
    for (const reminder of reminders) {
      const scheduledFor = new Date(eventTime - reminder.offset * 24 * 60 * 60_000)
      if (scheduledFor.getTime() <= Date.now()) continue
      await createUniqueLuxorEmailJob({
        inquiryId: input.inquiry.id,
        bookingId: input.booking.id,
        jobType: reminder.kind,
        recipientEmail: input.inquiry.email,
        subject: reminder.email.subject,
        body: reminder.email.body,
        scheduledFor: scheduledFor.toISOString(),
        automationKey: lifecycleAutomationKey(reminder.kind, input.booking.id),
        metadata: { event_date: input.booking.event_date },
      })
    }
  }

  if (metadata.event_completed_at && !previousMetadata.event_completed_at) {
    const thanks = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'thanks' })
    await createUniqueLuxorEmailJob({
      inquiryId: input.inquiry.id,
      bookingId: input.booking.id,
      jobType: 'post_event_follow_up',
      recipientEmail: input.inquiry.email,
      subject: thanks.subject,
      body: thanks.body,
      scheduledFor: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      automationKey: lifecycleAutomationKey('post_event_follow_up', input.booking.id),
    })
  }
}
