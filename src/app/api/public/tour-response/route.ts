import { NextRequest, NextResponse } from 'next/server'
import { getLuxorInquiryByTourToken, updateLuxorInquiryIfTourAttendanceStatus } from '@/lib/luxorInquiriesServer'
import { cancelLuxorTourForInquiry } from '@/lib/luxorTourCancellationServer'
import { getLuxorCalendarEvent } from '@/lib/luxorCalendarServer'
import { createNote } from '@/lib/luxorNotesServer'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'

export async function POST(request: NextRequest) {
  try {
    const { token, action, expectedSequence } = await request.json()
    if ((action === 'cancel' || action === 'cancel_preview') && (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(token))) {
      return NextResponse.json({ error: 'Tour response link not found.' }, { status: 404 })
    }
    const inquiry = await getLuxorInquiryByTourToken(String(token || ''))

    if (!inquiry) {
      return NextResponse.json({ error: 'Tour response link not found.' }, { status: 404 })
    }
    if (inquiry.is_test) await assertLuxorProductionSideEffectsAllowed(inquiry.id)

    if (action === 'cancel_preview') {
      const event = await getLuxorCalendarEvent(inquiry.id)
      if (inquiry.tour_attendance_status === 'cancelled') {
        const cancellation = inquiry.metadata?.tourCancellation
        const saved = cancellation && typeof cancellation === 'object' && !Array.isArray(cancellation)
          ? cancellation as Record<string, unknown> : null
        if (event?.status === 'cancelled' && saved?.status === 'cancelled' && String(saved.calendarSequence) === String(event.sequence)) {
          return NextResponse.json({ alreadyCancelled: true }, { headers: { 'Cache-Control': 'no-store' } })
        }
      }
      if (inquiry.status === 'closed_lost' || ['cancelled', 'attended', 'no_show'].includes(inquiry.tour_attendance_status || '')) {
        return NextResponse.json({ error: 'This tour is no longer available. Please contact Luxor Event Space for help.' }, { status: 410 })
      }
      const start = event ? new Date(event.state.startUtc) : null
      if (!event || event.status !== 'confirmed' || !start || !Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'This tour needs staff review. Please contact Luxor Event Space for help.' }, { status: 409 })
      }
      const dateTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }).format(start)
      return NextResponse.json({ dateTime: `${dateTime} Central Time`, sequence: event.sequence }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (action === 'cancel') {
      if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 0) return NextResponse.json({ error: 'Reopen the link and review your tour before cancelling.' }, { status: 400 })
      const result = await cancelLuxorTourForInquiry({ inquiry, token, expectedSequence, requestedBy: 'Client' })
      if (!result.ok) return NextResponse.json({ error: result.errors[0] }, { status: 409 })
      return NextResponse.json({ message: 'Your tour has been cancelled.' })
    }

    // Old links must not revive a final tour or a closed opportunity.
    if (inquiry.status === 'closed_lost' || ['cancelled', 'attended', 'no_show'].includes(inquiry.tour_attendance_status || '')) {
      return NextResponse.json({ error: 'This tour is no longer available. Please contact Luxor Event Space if you need help.' }, { status: 410 })
    }

    if (action === 'confirm') {
      const updated = await updateLuxorInquiryIfTourAttendanceStatus(inquiry.id, inquiry.tour_attendance_status, {
        status: 'tour_confirmed',
        pipeline_stage: 'tour',
        tour_attendance_status: 'pending',
        tour_confirmed_at: new Date().toISOString(),
      })
      if (!updated) return NextResponse.json({ error: 'This tour changed. Please contact Luxor Event Space for help.' }, { status: 409 })
      await createNote(inquiry.id, 'Client confirmed their tour from email link.', 'status_change', 'Client')
      return NextResponse.json({ inquiry: updated, message: 'Tour confirmed.' })
    }

    if (action === 'reschedule') {
      const updated = await updateLuxorInquiryIfTourAttendanceStatus(inquiry.id, inquiry.tour_attendance_status, {
        status: 'tour_requested',
        pipeline_stage: 'tour',
        tour_attendance_status: 'rescheduled',
      })
      if (!updated) return NextResponse.json({ error: 'This tour changed. Please contact Luxor Event Space for help.' }, { status: 409 })
      await createNote(inquiry.id, 'Client requested to reschedule from email link.', 'status_change', 'Client')
      return NextResponse.json({ inquiry: updated, message: 'Reschedule request received.' })
    }

    return NextResponse.json({ error: 'Unsupported response action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to record tour response.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
