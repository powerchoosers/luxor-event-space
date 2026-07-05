import { NextResponse } from 'next/server'
import { listLuxorBookingsWithPayments } from '@/lib/luxorBookingsServer'
import { listLuxorTourRequests } from '@/lib/luxorInquiriesServer'
import { listUpcomingLuxorTourSlots } from '@/lib/luxorTourSlotsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const [tours, slots, bookings] = await Promise.all([
      listLuxorTourRequests(150),
      listUpcomingLuxorTourSlots(150),
      listLuxorBookingsWithPayments(150).catch(() => []),
    ])

    return NextResponse.json({ tours, slots, bookings })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load calendar data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
