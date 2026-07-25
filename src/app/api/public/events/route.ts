import { NextRequest, NextResponse } from 'next/server'
import { getPublicRequestIp, hashPublicRequestIp, recordLuxorPublicEvent } from '@/lib/luxorPublicEventsServer'

const ALLOWED_EVENTS = new Set([
  'page_view',
  'tour_cta_click',
  'call_cta_click',
  'package_cta_click',
  'gallery_open',
  'form_started',
  'form_step_completed',
  'concierge_opened',
])

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      eventName?: string
      sessionId?: string
      pagePath?: string
      source?: string
      metadata?: Record<string, unknown>
    }

    if (!payload.eventName || !ALLOWED_EVENTS.has(payload.eventName)) {
      return NextResponse.json({ accepted: false }, { status: 400 })
    }

    await recordLuxorPublicEvent({
      eventName: payload.eventName,
      sessionId: payload.sessionId,
      pagePath: payload.pagePath,
      source: payload.source,
      ipHash: hashPublicRequestIp(getPublicRequestIp(request.headers)),
      metadata: payload.metadata,
    })

    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch {
    return NextResponse.json({ accepted: false }, { status: 202 })
  }
}
