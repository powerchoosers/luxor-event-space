import 'server-only'

import {
  formatTourSlotTime,
  isLuxorTourDay,
  isLuxorTourSlotAtLeast24HoursAway,
  isLuxorTourTime,
  LUXOR_TOUR_TIMES,
  LuxorTourSlot,
  PublicLuxorTourSlot,
  toPublicTourSlot,
} from './luxorTourSlots'
import { supabaseRest } from './supabaseRestServer'

const TOUR_SLOT_SELECT = 'id,created_at,updated_at,slot_date,start_time,end_time,status,capacity,booked_count,title,notes'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export async function listAvailableLuxorTourSlots(limit = 500): Promise<PublicLuxorTourSlot[]> {
  const slots = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&status=eq.available&slot_date=gte.${todayIsoDate()}&order=slot_date.asc,start_time.asc&limit=${encodeURIComponent(limit)}`,
  )

  return slots
    .filter((slot) => slot.capacity > slot.booked_count && isLuxorTourSlotAtLeast24HoursAway(slot.slot_date, slot.start_time))
    .map(toPublicTourSlot)
}

export async function listUpcomingLuxorTourSlots(limit = 1000): Promise<LuxorTourSlot[]> {
  return supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&slot_date=gte.${todayIsoDate()}&order=slot_date.asc,start_time.asc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function getLuxorTourSlot(id: string) {
  const [slot] = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`,
  )

  return slot ?? null
}

export function assertTourSlotCanBeBooked(slot: LuxorTourSlot | null) {
  if (!slot) {
    throw new Error('That tour slot is no longer available.')
  }

  if (slot.status !== 'available' || slot.booked_count >= slot.capacity) {
    throw new Error('That tour slot is already full. Please pick another available time.')
  }

  if (!isLuxorTourSlotAtLeast24HoursAway(slot.slot_date, slot.start_time)) {
    throw new Error('Tours must be booked at least 24 hours in advance. Please choose a later time.')
  }
}

export async function reserveLuxorTourSlot(slot: LuxorTourSlot) {
  assertTourSlotCanBeBooked(slot)

  const [updated] = await supabaseRest<LuxorTourSlot[]>(
    'rpc/reserve_luxor_tour_slot',
    {
      method: 'POST',
      body: JSON.stringify({ p_slot_id: slot.id }),
    },
  )

  if (!updated) {
    throw new Error('That tour time was just taken. Please choose another available time.')
  }

  return updated
}

export async function releaseLuxorTourSlot(slotId: string) {
  const [updated] = await supabaseRest<LuxorTourSlot[]>('rpc/release_luxor_tour_slot', {
    method: 'POST',
    body: JSON.stringify({ p_slot_id: slotId }),
  })
  return updated ?? null
}

export async function createLuxorTourSlot(input: {
  slotDate: string
  startTime: string
  endTime?: string | null
  capacity?: number
  title?: string | null
  notes?: string | null
}) {
  if (!isLuxorTourDay(input.slotDate)) throw new Error('Tours are available on Tuesdays and Wednesdays only.')
  if (!isLuxorTourTime(input.startTime)) throw new Error('Choose one of Luxor’s published tour times.')
  const [created] = await supabaseRest<LuxorTourSlot[]>('luxor_tour_slots?select=' + TOUR_SLOT_SELECT, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      slot_date: input.slotDate,
      start_time: input.startTime,
      end_time: input.endTime || null,
      status: 'available',
      capacity: 1,
      booked_count: 0,
      title: input.title?.trim() || 'Private venue tour',
      notes: input.notes?.trim() || null,
    }),
  })

  return created
}

export async function publishLuxorTourDays(dates: string[]) {
  const cleanDates = [...new Set(dates)].filter(isLuxorTourDay).sort()
  if (cleanDates.length !== dates.length) throw new Error('Choose future Tuesdays or Wednesdays only.')

  const rows = cleanDates.flatMap((slotDate) => LUXOR_TOUR_TIMES.map((time) => ({
    slot_date: slotDate,
    start_time: time.startTime,
    end_time: time.endTime,
    status: 'available',
    capacity: 1,
    booked_count: 0,
    title: 'Private venue tour',
  })))

  if (rows.length) {
    await supabaseRest<LuxorTourSlot[]>('luxor_tour_slots?on_conflict=slot_date,start_time', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    })

    await Promise.all(cleanDates.map((slotDate) => supabaseRest<LuxorTourSlot[]>(
      `luxor_tour_slots?slot_date=eq.${slotDate}&status=eq.unavailable&booked_count=eq.0`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'available', updated_at: new Date().toISOString() }),
      },
    )))
  }

  return listUpcomingLuxorTourSlots()
}

export async function unpublishLuxorTourDays(dates: string[]) {
  const cleanDates = [...new Set(dates)].filter(isLuxorTourDay).sort()
  if (cleanDates.length !== dates.length) throw new Error('Choose Tuesdays or Wednesdays only.')

  await Promise.all(cleanDates.map((slotDate) => supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?slot_date=eq.${slotDate}&status=eq.available&booked_count=eq.0`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'unavailable', updated_at: new Date().toISOString() }),
    },
  )))

  return listUpcomingLuxorTourSlots()
}

export async function updateLuxorTourSlotStatus(id: string, status: LuxorTourSlot['status']) {
  const [updated] = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    },
  )

  return updated ?? null
}

export async function deleteLuxorTourSlot(id: string) {
  const slot = await getLuxorTourSlot(id)
  if (!slot) return false
  if (slot.booked_count > 0) {
    throw new Error('This time already has a reservation. Mark it unavailable instead of deleting it.')
  }

  await supabaseRest<null>(`luxor_tour_slots?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  return true
}

export function applyTourSlotToInquiry(
  row: { preferred_tour_date: string | null; preferred_tour_time: string | null },
  slot: LuxorTourSlot,
) {
  row.preferred_tour_date = slot.slot_date
  row.preferred_tour_time = formatTourSlotTime(slot.start_time)
}
