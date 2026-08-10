import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorLeadEventForInquiry, getLuxorLeadEventPreference, saveLuxorLeadEventPreference } from '@/lib/luxorLeadEventsServer'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const inquiryId = new URL(request.url).searchParams.get('inquiryId')
    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })
    return NextResponse.json({ lead_event_id: await getLuxorLeadEventPreference(session.email, inquiryId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch event preference.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json()
    const inquiryId = String(body.inquiry_id || body.inquiryId || '').trim()
    const leadEventId = String(body.lead_event_id || body.leadEventId || '').trim()
    if (!inquiryId || !leadEventId) return NextResponse.json({ error: 'inquiry_id and lead_event_id are required.' }, { status: 400 })
    if (!await getLuxorLeadEventForInquiry(leadEventId, inquiryId)) return NextResponse.json({ error: 'Event not found for this lead.' }, { status: 404 })
    return NextResponse.json({ lead_event_id: await saveLuxorLeadEventPreference(session.email, inquiryId, leadEventId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save event preference.' }, { status: 500 })
  }
}
