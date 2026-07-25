import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  checkInGrandOpeningGuest,
  checkInGrandOpeningRsvp,
  drawGrandOpeningWinner,
  listGrandOpeningAttendees,
  searchGrandOpeningRsvps,
  skipGrandOpeningWinner,
} from '@/lib/luxorGrandOpeningRaffleServer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const query = new URL(request.url).searchParams.get('q') || ''
    const [attendees, matches] = await Promise.all([
      listGrandOpeningAttendees(),
      query.trim().length >= 2 ? searchGrandOpeningRsvps(query, 20) : Promise.resolve([]),
    ])
    return NextResponse.json({ attendees, matches })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load raffle data.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const body = await request.json()
    switch (body?.action) {
      case 'check_in_rsvp':
        return NextResponse.json({ attendee: await checkInGrandOpeningRsvp({
          inquiryId: String(body.inquiryId || ''),
          phone: String(body.phone || ''),
          marketingOptIn: Boolean(body.marketingOptIn),
          checkedInBy: 'staff',
        }) })
      case 'check_in_guest':
        return NextResponse.json({ attendee: await checkInGrandOpeningGuest({
          fullName: String(body.fullName || ''),
          phone: String(body.phone || ''),
          invitedByInquiryId: String(body.invitedByInquiryId || ''),
          marketingOptIn: Boolean(body.marketingOptIn),
          checkedInBy: 'staff',
        }) })
      case 'draw':
        return NextResponse.json({ winner: await drawGrandOpeningWinner(String(body.prizeLabel || '')) })
      case 'skip':
        return NextResponse.json({ attendee: await skipGrandOpeningWinner(String(body.attendeeId || '')) })
      default:
        return NextResponse.json({ error: 'Unknown raffle action.' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update the raffle.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
