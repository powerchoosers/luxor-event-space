import { NextRequest, NextResponse } from 'next/server'
import { createLuxorBooking, findLuxorBookingConflicts, getLuxorBooking, listLuxorBookingsByInquiry, listLuxorBookingsWithPayments, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'

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

    const booking = await createLuxorBooking(body)
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
    return NextResponse.json(booking)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update booking.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
