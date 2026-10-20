import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorBookings } from '@/lib/luxorBookingsServer'
import { buildLuxorAvailabilityCalendar } from '@/lib/luxorAvailability'

export async function GET() {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const bookings = await listLuxorBookings(1000)
    return NextResponse.json({ availability: buildLuxorAvailabilityCalendar(bookings) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load event availability.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
