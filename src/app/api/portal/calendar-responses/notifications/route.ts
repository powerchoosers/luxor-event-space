import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type CalendarResponseRow = {
  id: string
  event_id: string
  attendee_email: string
  partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'
  reply_stamp: string
  disposition: 'applied' | 'pending_review' | 'stale' | 'rejected'
  created_at: string
}

type CalendarEventRow = {
  id: string
  inquiry_id: string
  state: Record<string, unknown> | null
}

export async function GET(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) {
      return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
    }

    const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50
    const responses = await supabaseRest<CalendarResponseRow[]>(
      `luxor_calendar_responses?select=id,event_id,attendee_email,partstat,reply_stamp,disposition,created_at&disposition=in.(applied,pending_review)&order=created_at.desc&limit=${limit}`,
    )
    const eventIds = Array.from(new Set(responses.map((response) => response.event_id).filter(Boolean)))
    const events = eventIds.length
      ? await supabaseRest<CalendarEventRow[]>(
          `luxor_calendar_events?select=id,inquiry_id,state&id=in.(${eventIds.join(',')})`,
        )
      : []
    const eventById = new Map(events.map((event) => [event.id, event]))

    return NextResponse.json({
      responses: responses.map((response) => {
        const event = eventById.get(response.event_id)
        return {
          ...response,
          inquiry_id: event?.inquiry_id || null,
          event_title: String(event?.state?.title || 'Calendar invitation'),
          event_start: typeof event?.state?.startUtc === 'string' ? event.state.startUtc : null,
        }
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to load calendar response notifications.',
    }, { status: 500 })
  }
}
