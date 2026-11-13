import { NextResponse } from 'next/server'
import { annotateTestBookings, listLuxorBookings } from '@/lib/luxorBookingsServer'
import { buildLuxorAvailabilityCalendar } from '@/lib/luxorAvailability'
import { annotateLuxorReviewAvailability } from '@/lib/luxorAvailabilityReviewServer'

export async function GET() {
  try {
    const bookings = await annotateLuxorReviewAvailability(await annotateTestBookings(await listLuxorBookings(1000, true)))
    return NextResponse.json(
      { availability: buildLuxorAvailabilityCalendar(bookings) },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event availability could not be loaded.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
