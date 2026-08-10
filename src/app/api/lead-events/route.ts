import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import {
  createLuxorLeadEvent,
  getLuxorLeadEventForInquiry,
  listLuxorLeadEventsByInquiry,
  updateLuxorLeadEvent,
} from '@/lib/luxorLeadEventsServer'
import type { LuxorInquiryStatus, LuxorPipelineStage } from '@/lib/luxorInquiryTypes'

const statuses = new Set<LuxorInquiryStatus>(['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost'])
const pipelineStages = new Set<LuxorPipelineStage>(['inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'])

function normalizeGuestCount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const count = Number(value)
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : null
}

export async function GET(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const inquiryId = new URL(request.url).searchParams.get('inquiryId')
    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })
    return NextResponse.json(await listLuxorLeadEventsByInquiry(inquiryId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch lead events.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json()
    const inquiryId = String(body.inquiry_id || body.inquiryId || '').trim()
    const eventType = String(body.event_type || body.eventType || '').trim()
    if (!inquiryId || !eventType) return NextResponse.json({ error: 'inquiry_id and event_type are required.' }, { status: 400 })
    if (!await getLuxorInquiry(inquiryId)) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const event = await createLuxorLeadEvent({
      inquiry_id: inquiryId,
      event_type: eventType,
      target_date: body.target_date || body.targetDate || null,
      guest_count: normalizeGuestCount(body.guest_count ?? body.guestCount),
      package_interest: body.package_interest || body.packageInterest || null,
      notes: body.notes || null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      status: 'new',
      pipeline_stage: 'inquiry',
    })
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create event.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json()
    const id = String(body.id || '').trim()
    const inquiryId = String(body.inquiry_id || body.inquiryId || '').trim()
    if (!id) return NextResponse.json({ error: 'Event id is required.' }, { status: 400 })
    const existing = inquiryId ? await getLuxorLeadEventForInquiry(id, inquiryId) : null
    if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

    const updates: Record<string, unknown> = {}
    if (body.event_type !== undefined) updates.event_type = String(body.event_type || '').trim() || existing.event_type
    if (body.target_date !== undefined) updates.target_date = body.target_date || null
    if (body.guest_count !== undefined) updates.guest_count = normalizeGuestCount(body.guest_count)
    if (body.package_interest !== undefined) updates.package_interest = body.package_interest || null
    if (body.notes !== undefined) updates.notes = body.notes || null
    if (body.metadata !== undefined && body.metadata && typeof body.metadata === 'object') updates.metadata = body.metadata
    if (body.status !== undefined && statuses.has(body.status)) updates.status = body.status
    if (body.pipeline_stage !== undefined && pipelineStages.has(body.pipeline_stage)) updates.pipeline_stage = body.pipeline_stage
    if (body.is_primary !== undefined) updates.is_primary = Boolean(body.is_primary)

    return NextResponse.json(await updateLuxorLeadEvent(id, updates))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update event.' }, { status: 500 })
  }
}
