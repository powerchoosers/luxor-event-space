import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorLeadEventForInquiry } from '@/lib/luxorLeadEventsServer'
import { getPlannerBooking } from '@/lib/luxorPlannerServer'
import { normalizePlannerEventLayout } from '@/lib/luxorPlannerLayout'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'planner')) {
      return NextResponse.json({ error: 'Planner access is not enabled for this portal account.' }, { status: 403 })
    }

    const bookingId = new URL(request.url).searchParams.get('bookingId') || ''
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return NextResponse.json({ error: 'Choose an event to import from.' }, { status: 400 })
    const booking = await getPlannerBooking(bookingId)
    if (!booking || !['confirmed', 'completed'].includes(String(booking.status))) {
      return NextResponse.json({ error: 'Confirmed event not found.' }, { status: 404 })
    }
    if (!booking.inquiry_id || !booking.lead_event_id) {
      return NextResponse.json({ error: 'This booking has no exact linked lead-event floor plan to import.' }, { status: 404 })
    }

    // Resolve only the event explicitly linked to this booking. Never infer a
    // primary/first lead event, and return no inquiry notes or contact details.
    const source = await getLuxorLeadEventForInquiry(booking.lead_event_id, booking.inquiry_id)
    const metadata = source?.metadata && typeof source.metadata === 'object' ? source.metadata as Record<string, unknown> : {}
    const layout = normalizePlannerEventLayout(metadata.event_layout)
    if (!source || !layout) return NextResponse.json({ error: 'The linked lead event has no compatible floor plan to import.' }, { status: 404 })

    return NextResponse.json({
      source: {
        leadEventId: source.id,
        eventType: source.event_type,
        eventDate: source.target_date,
        layout,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Planner floor-plan source request failed:', error)
    return NextResponse.json({ error: 'The linked floor plan could not be loaded.' }, { status: 500 })
  }
}
