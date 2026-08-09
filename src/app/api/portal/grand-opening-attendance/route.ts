import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { buildGrandOpeningAttendeeCsv, createLuxorGrandOpeningAttendee, listLuxorGrandOpeningAttendees } from '@/lib/luxorGrandOpeningAttendanceServer'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const query = request.nextUrl.searchParams.get('q') || ''
    const attendeeType = request.nextUrl.searchParams.get('type') || ''
    const attendees = await listLuxorGrandOpeningAttendees({ query, attendeeType })

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      return new NextResponse(buildGrandOpeningAttendeeCsv(attendees), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="luxor-grand-opening-attendance.csv"',
        },
      })
    }

    return NextResponse.json({ attendees })
  } catch (error) {
    console.error('Failed to load Grand Opening attendance:', error)
    return NextResponse.json({ error: 'Grand Opening attendance could not be loaded.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json() as { fullName?: string; phone?: string; attendeeType?: string; checkedInAt?: string; notes?: string }
    const fullName = String(body.fullName || '').trim()
    const attendeeType = body.attendeeType === 'guest' ? 'guest' : body.attendeeType === 'rsvp' ? 'rsvp' : ''
    if (fullName.length < 2) return NextResponse.json({ error: 'Enter the attendee name.' }, { status: 400 })
    if (!attendeeType) return NextResponse.json({ error: 'Choose RSVP or guest.' }, { status: 400 })
    const attendee = await createLuxorGrandOpeningAttendee({ fullName, phone: body.phone, attendeeType, checkedInAt: body.checkedInAt, notes: body.notes })
    return NextResponse.json({ attendee }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Attendance could not be saved.' }, { status: 500 })
  }
}
