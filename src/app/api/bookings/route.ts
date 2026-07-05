import { NextRequest, NextResponse } from 'next/server'
import { createLuxorBooking, listLuxorBookingsByInquiry, listLuxorBookingsWithPayments, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

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

    const bookings = await listLuxorBookingsWithPayments(150)
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

    const booking = await createLuxorBooking(body)
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

    const booking = await updateLuxorBooking(id, updates)
    return NextResponse.json(booking)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update booking.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
