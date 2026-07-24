import { NextRequest, NextResponse } from 'next/server'
import { createLuxorBooking, findLuxorBookingConflicts, getLuxorBooking, listLuxorBookingsByInquiry, listLuxorBookingsWithPayments, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { listPaidPaymentsByInvoice } from '@/lib/luxorInvoicesServer'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { buildEventEmail, lifecycleAutomationKey } from '@/lib/luxorLifecycleEmailsServer'
import { queueBookingTextJobs } from '@/lib/luxorTextCampaignsServer'

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
    if (!body.client_name) {
      return NextResponse.json({ error: 'client_name is required.' }, { status: 400 })
    }

    if (body.event_date && (body.status === 'tentative' || body.status === 'confirmed')) {
      const conflicts = await findLuxorBookingConflicts(body.event_date)
      if (conflicts.length > 0) {
        return NextResponse.json({ error: `That date already has an active booking for ${conflicts[0].client_name}. Review the calendar before continuing.`, conflicts }, { status: 409 })
      }
    }

    let booking = await createLuxorBooking(body)
    if (booking.invoice_id && Number(booking.deposit_required || 0) > 0) {
      const paidPayments = await listPaidPaymentsByInvoice(booking.invoice_id)
      const paidTotal = paidPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      if (paidTotal + 0.005 >= Number(booking.deposit_required)) {
        booking = await updateLuxorBooking(booking.id, {
          security_deposit_status: 'collected',
          metadata: { ...booking.metadata, deposit_paid_before_booking: true },
        }) || booking
      }
    }
    if (booking?.inquiry_id) {
      const inquiry = await getLuxorInquiry(booking.inquiry_id)
      if (inquiry && inquiry.status !== 'closed_lost') {
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
        await cancelQueuedLuxorEmailJobs(inquiry.id, ['proposal_view_reminder', 'proposal_payment_reminder'])
        try {
          await queueBookingTextJobs(booking, inquiry)
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

    const nextDate = updates.event_date === undefined ? existing.event_date : updates.event_date
    const nextStatus = updates.status === undefined ? existing.status : updates.status
    if (nextDate && (nextStatus === 'tentative' || nextStatus === 'confirmed')) {
      const conflicts = await findLuxorBookingConflicts(nextDate, id)
      if (conflicts.length > 0) {
        return NextResponse.json({ error: `That date already has an active booking for ${conflicts[0].client_name}. Review the calendar before continuing.`, conflicts }, { status: 409 })
      }
    }

    const booking = await updateLuxorBooking(id, updates)
    if (booking?.inquiry_id) {
      const inquiry = await getLuxorInquiry(booking.inquiry_id)
      if (inquiry && inquiry.status !== 'closed_lost') {
        await updateLuxorInquiry(inquiry.id, {
          status: 'booked',
          pipeline_stage: pipelineStageForBooking(booking),
        })
        try {
          await syncBookingEmailAutomations({ inquiry, booking, previous: existing })
        } catch (automationError) {
          console.error('Booking advanced, but its reminder automation could not be updated:', automationError)
        }
        try {
          await queueBookingTextJobs(booking, inquiry)
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
  if (metadata.closeout_completed_at || booking.status === 'completed') return 'closing'
  if (metadata.event_completed_at) return 'closing'
  if (metadata.final_payment_recorded_manually_at || metadata.final_payment_paid_at) return 'event'
  if (metadata.planning_completed_at || booking.status === 'confirmed') return 'final_payment'
  if (booking.contract_status === 'signed' && booking.security_deposit_status === 'collected') return 'planning'
  if (booking.contract_status === 'signed') return 'deposit'
  return 'contract'
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
