import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  createLuxorTourSlot,
  deleteLuxorTourSlot,
  listAvailableLuxorTourSlots,
  updateLuxorTourSlotStatus,
} from '@/lib/luxorTourSlotsServer'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET() {
  try {
    const slots = await listAvailableLuxorTourSlots()
    return NextResponse.json({ slots })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load tour availability.'
    return NextResponse.json({ error: message, slots: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const body = await request.json() as Record<string, unknown>
    const slotDate = String(body.slotDate || '')
    const startTime = String(body.startTime || '')
    const endTime = body.endTime ? String(body.endTime) : null
    const capacity = Number(body.capacity || 1)

    if (!DATE_PATTERN.test(slotDate) || slotDate < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'Choose today or a future date.' }, { status: 400 })
    }
    if (!TIME_PATTERN.test(startTime) || (endTime && !TIME_PATTERN.test(endTime))) {
      return NextResponse.json({ error: 'Choose a valid start and end time.' }, { status: 400 })
    }
    if (endTime && endTime <= startTime) {
      return NextResponse.json({ error: 'The end time must be after the start time.' }, { status: 400 })
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) {
      return NextResponse.json({ error: 'Capacity must be between 1 and 10.' }, { status: 400 })
    }

    const slot = await createLuxorTourSlot({
      slotDate,
      startTime,
      endTime,
      capacity,
      title: body.title ? String(body.title).slice(0, 120) : null,
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
    })
    return NextResponse.json({ slot }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish this tour time.'
    const duplicate = message.toLowerCase().includes('duplicate') || message.includes('luxor_tour_slots_slot_date_start_time_key')
    return NextResponse.json({ error: duplicate ? 'That date and start time is already published.' : message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const body = await request.json() as Record<string, unknown>
    const id = String(body.id || '')
    const status = String(body.status || '')
    if (!ID_PATTERN.test(id) || !['available', 'unavailable'].includes(status)) {
      return NextResponse.json({ error: 'Invalid tour-time update.' }, { status: 400 })
    }
    const slot = await updateLuxorTourSlotStatus(id, status as 'available' | 'unavailable')
    return NextResponse.json({ slot })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update this tour time.' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const id = new URL(request.url).searchParams.get('id') || ''
    if (!ID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid tour time.' }, { status: 400 })
    await deleteLuxorTourSlot(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete this tour time.' }, { status: 400 })
  }
}
