import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import {
  createLuxorLeadEvent,
  getLuxorLeadEventForInquiry,
  listLuxorLeadEventsByInquiry,
  updateLuxorLeadEvent,
} from '@/lib/luxorLeadEventsServer'
import { LUXOR_GUEST_CAPACITY_MESSAGE, LUXOR_MAX_GUESTS, normalizeLuxorEventType, type LuxorInquiryStatus, type LuxorPipelineStage } from '@/lib/luxorInquiryTypes'

const statuses = new Set<LuxorInquiryStatus>(['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost'])
const pipelineStages = new Set<LuxorPipelineStage>(['newsletter', 'inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'])

function normalizeGuestCount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(count) && count >= 0 ? count : Number.NaN
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
    let eventType = ''
    try {
      eventType = normalizeLuxorEventType(body.event_type ?? body.eventType)
    } catch (eventTypeError) {
      return NextResponse.json({ error: eventTypeError instanceof Error ? eventTypeError.message : 'Please shorten the event type.' }, { status: 400 })
    }
    if (!inquiryId || !eventType) return NextResponse.json({ error: 'inquiry_id and event_type are required.' }, { status: 400 })
    if (!await getLuxorInquiry(inquiryId)) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })

    const submittedGuestCount = body.guest_count ?? body.guestCount
    const guestCount = normalizeGuestCount(submittedGuestCount)
    if (Number.isNaN(guestCount)) return NextResponse.json({ error: 'Enter a whole guest count.' }, { status: 400 })
    if (typeof guestCount === 'number' && guestCount > LUXOR_MAX_GUESTS) {
      return NextResponse.json({ error: LUXOR_GUEST_CAPACITY_MESSAGE }, { status: 400 })
    }
    const event = await createLuxorLeadEvent({
      inquiry_id: inquiryId,
      event_type: eventType,
      target_date: body.target_date || body.targetDate || null,
      guest_count: guestCount,
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
    if (body.event_type !== undefined) {
      try {
        updates.event_type = normalizeLuxorEventType(body.event_type) || existing.event_type
      } catch (eventTypeError) {
        return NextResponse.json({ error: eventTypeError instanceof Error ? eventTypeError.message : 'Please shorten the event type.' }, { status: 400 })
      }
    }
    if (body.target_date !== undefined) updates.target_date = body.target_date || null
    if (body.guest_count !== undefined) {
      const nextGuestCount = normalizeGuestCount(body.guest_count)
      if (Number.isNaN(nextGuestCount)) return NextResponse.json({ error: 'Enter a whole guest count.' }, { status: 400 })
      if (typeof nextGuestCount === 'number' && nextGuestCount > LUXOR_MAX_GUESTS && nextGuestCount !== existing.guest_count) {
        return NextResponse.json({ error: LUXOR_GUEST_CAPACITY_MESSAGE }, { status: 400 })
      }
      updates.guest_count = nextGuestCount
    }
    if (body.package_interest !== undefined) updates.package_interest = body.package_interest || null
    if (body.notes !== undefined) updates.notes = body.notes || null
    if (body.metadata !== undefined && body.metadata && typeof body.metadata === 'object') updates.metadata = body.metadata
    if (body.status === 'closed_lost' || body.pipeline_stage === 'closed_lost') {
      return NextResponse.json({
        error: 'Use Archive Lead from the lead profile to move this record to Archived Leads without changing its business status.',
        action: `/api/leads/${encodeURIComponent(existing.inquiry_id)}/archive`,
      }, { status: 409 })
    }
    if (body.status !== undefined && statuses.has(body.status)) updates.status = body.status
    if (body.pipeline_stage !== undefined && pipelineStages.has(body.pipeline_stage)) updates.pipeline_stage = body.pipeline_stage
    if (body.is_primary !== undefined) updates.is_primary = Boolean(body.is_primary)

    return NextResponse.json(await updateLuxorLeadEvent(id, updates))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update event.' }, { status: 500 })
  }
}
