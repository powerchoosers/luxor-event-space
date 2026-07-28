import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  createLuxorTourSlot,
  deleteLuxorTourSlot,
  listAvailableLuxorTourSlots,
  listUpcomingLuxorTourSlots,
  publishLuxorTourDays,
  unpublishLuxorTourDays,
  updateLuxorTourSlotStatus,
} from '@/lib/luxorTourSlotsServer'
import { isLuxorTourDay, isLuxorTourSlotAtLeast24HoursAway, isLuxorTourTime } from '@/lib/luxorTourSlots'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const manage = new URL(request.url).searchParams.get('manage') === '1'
    if (manage) {
      if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
      const slots = await listUpcomingLuxorTourSlots()
      return NextResponse.json({ slots })
    }
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
    if (Array.isArray(body.dates)) {
      const dates = body.dates.map(String)
      if (!dates.length || dates.length > 62 || dates.some((date) => !DATE_PATTERN.test(date) || !isLuxorTourDay(date))) {
        return NextResponse.json({ error: 'Choose 1–62 Tuesdays or Wednesdays.' }, { status: 400 })
      }
      if (dates.some((date) => !isLuxorTourSlotAtLeast24HoursAway(date, '11:00:00'))) {
        return NextResponse.json({ error: 'Published days must be at least 24 hours away.' }, { status: 400 })
      }
      const slots = await publishLuxorTourDays(dates)
      return NextResponse.json({ slots, publishedDays: dates.length }, { status: 201 })
    }
    const slotDate = String(body.slotDate || '')
    const startTime = String(body.startTime || '')
    const endTime = body.endTime ? String(body.endTime) : null
    const capacity = Number(body.capacity || 1)

    if (!DATE_PATTERN.test(slotDate) || !isLuxorTourDay(slotDate) || !isLuxorTourSlotAtLeast24HoursAway(slotDate, startTime)) {
      return NextResponse.json({ error: 'Choose a Tuesday or Wednesday at least 24 hours away.' }, { status: 400 })
    }
    if (!TIME_PATTERN.test(startTime) || (endTime && !TIME_PATTERN.test(endTime))) {
      return NextResponse.json({ error: 'Choose a valid start and end time.' }, { status: 400 })
    }
    if (!isLuxorTourTime(startTime)) return NextResponse.json({ error: 'Choose one of Luxor’s tour times.' }, { status: 400 })
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
    if (Array.isArray(body.dates) && body.action === 'unpublish') {
      const dates = body.dates.map(String)
      if (!dates.length || dates.length > 62 || dates.some((date) => !DATE_PATTERN.test(date) || !isLuxorTourDay(date))) {
        return NextResponse.json({ error: 'Choose 1–62 Tuesdays or Wednesdays.' }, { status: 400 })
      }
      const slots = await unpublishLuxorTourDays(dates)
      return NextResponse.json({ slots, unpublishedDays: dates.length })
    }
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
