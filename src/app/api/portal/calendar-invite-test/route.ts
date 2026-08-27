import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  buildLuxorCalendarInvite,
  luxorCalendarInviteConfig,
  luxorZonedDateTimeToUtc,
  sendLuxorCalendarInvite,
} from '@/lib/luxorCalendarInviteServer'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  return NextResponse.json(luxorCalendarInviteConfig())
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const mode = body.mode === 'download' ? 'download' : 'send'
    const date = String(body.date || '')
    const startTime = String(body.startTime || '')
    const durationMinutes = Math.min(Math.max(Math.trunc(Number(body.durationMinutes) || 30), 15), 240)
    const start = luxorZonedDateTimeToUtc(date, startTime)
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    if (start.getTime() <= Date.now()) throw new Error('Choose a future date and time for the test invitation.')

    const rawUid = String(body.uid || '').trim()
    const uid = /^[A-Za-z0-9._-]{8,180}@luxoratlaspalmas\.com$/.test(rawUid)
      ? rawUid
      : `settings-test-${randomUUID()}@luxoratlaspalmas.com`
    const invite = {
      attendeeEmail: String(body.attendeeEmail || ''),
      attendeeName: String(body.attendeeName || ''),
      title: String(body.title || ''),
      description: String(body.description || ''),
      location: String(body.location || ''),
      start,
      end,
      uid,
      sequence: 0,
    }

    if (mode === 'download') {
      return NextResponse.json({
        calendarContent: buildLuxorCalendarInvite(invite),
        filename: 'luxor-event-space-invitation.ics',
        uid,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      })
    }

    const receipt = await sendLuxorCalendarInvite(invite)
    return NextResponse.json({
      messageId: receipt.messageId,
      accepted: receipt.accepted,
      rejected: receipt.rejected,
      uid,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create the test calendar invitation.' }, { status: 400 })
  }
}
