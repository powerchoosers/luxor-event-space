import 'server-only'

import {
  formatTourSlotTime,
  isLuxorTourDay,
  isLuxorTourSlotAtLeast24HoursAway,
  isLuxorTourTime,
  luxorTourTimeDisplayOrder,
  LuxorTourSlot,
  PublicLuxorTourSlot,
  toPublicTourSlot,
  LuxorTourAvailability,
  weekdayForTourDate,
  tourTimesForAvailability,
} from './luxorTourSlots'
import { supabaseRest } from './supabaseRestServer'

const TOUR_SLOT_SELECT = 'id,created_at,updated_at,slot_date,start_time,end_time,status,capacity,booked_count,title,notes'
const TOUR_AVAILABILITY_SELECT = 'weekday,is_open,start_time,end_time,updated_at'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function sortLuxorTourSlotsForDisplay<T extends Pick<LuxorTourSlot, 'slot_date' | 'start_time'>>(slots: T[]) {
  return [...slots].sort((left, right) => (
    left.slot_date.localeCompare(right.slot_date)
    || luxorTourTimeDisplayOrder(left.start_time) - luxorTourTimeDisplayOrder(right.start_time)
  ))
}

export async function listAvailableLuxorTourSlots(limit = 500): Promise<PublicLuxorTourSlot[]> {
  const slots = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&status=eq.available&slot_date=gte.${todayIsoDate()}&order=slot_date.asc,start_time.asc&limit=${encodeURIComponent(limit)}`,
  )

  return sortLuxorTourSlotsForDisplay(
    slots.filter((slot) => slot.capacity > slot.booked_count && isLuxorTourSlotAtLeast24HoursAway(slot.slot_date, slot.start_time)),
  )
    .map(toPublicTourSlot)
}

export async function listLuxorTourAvailability(): Promise<LuxorTourAvailability[]> {
  const rows = await supabaseRest<LuxorTourAvailability[]>(`luxor_tour_availability?select=${TOUR_AVAILABILITY_SELECT}&order=weekday.asc`)
  return rows
}

async function availabilityMap() {
  const rows = await listLuxorTourAvailability()
  return new Map(rows.map((row) => [row.weekday, row]))
}

export async function listUpcomingLuxorTourSlots(limit = 1000): Promise<LuxorTourSlot[]> {
  const slots = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&slot_date=gte.${todayIsoDate()}&order=slot_date.asc,start_time.asc&limit=${encodeURIComponent(limit)}`,
  )
  return sortLuxorTourSlotsForDisplay(slots)
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
  if (!isLuxorTourDay(input.slotDate)) throw new Error('Choose a valid tour date.')
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
  if (cleanDates.length !== dates.length) throw new Error('Choose future weekdays only.')
  const schedules = await availabilityMap()
  const rows = cleanDates.flatMap((slotDate) => {
    const schedule = schedules.get(weekdayForTourDate(slotDate))
    if (!schedule?.is_open) return []
    const times = tourTimesForAvailability(schedule)
    if (!times.length || !isLuxorTourSlotAtLeast24HoursAway(slotDate, times[0].startTime)) return []
    return times.map((time) => ({
    slot_date: slotDate,
    start_time: time.startTime,
    end_time: time.endTime,
    status: 'available',
    capacity: 1,
    booked_count: 0,
    title: 'Private venue tour',
    }))
  })

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

export async function saveLuxorTourAvailability(rows: LuxorTourAvailability[]) {
  const cleanRows = rows.map((row) => ({ weekday: Number(row.weekday), is_open: Boolean(row.is_open), start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5) }))
  if (cleanRows.length !== 7 || new Set(cleanRows.map((row) => row.weekday)).size !== 7 || cleanRows.some((row) => row.weekday < 0 || row.weekday > 6 || row.end_time <= row.start_time)) {
    throw new Error('Save one valid schedule for each day of the week.')
  }
  await supabaseRest<LuxorTourAvailability[]>('luxor_tour_availability?on_conflict=weekday', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(cleanRows.map((row) => ({ ...row, updated_at: new Date().toISOString() }))),
  })

  const current = await listUpcomingLuxorTourSlots()
  const dated = [...new Set(current.map((slot) => slot.slot_date))]
  const byWeekday = new Map(cleanRows.map((row) => [row.weekday, row]))
  await Promise.all(current.filter((slot) => slot.booked_count === 0).map((slot) => supabaseRest<null>(`luxor_tour_slots?id=eq.${encodeURIComponent(slot.id)}`, { method: 'DELETE' })))
  const regenerated = dated.flatMap((slotDate) => {
    const schedule = byWeekday.get(weekdayForTourDate(slotDate))
    return schedule?.is_open ? tourTimesForAvailability(schedule).map((time) => ({ slot_date: slotDate, start_time: time.startTime, end_time: time.endTime, status: 'available', capacity: 1, booked_count: 0, title: 'Private venue tour' })) : []
  })
  if (regenerated.length) await supabaseRest<LuxorTourSlot[]>('luxor_tour_slots?on_conflict=slot_date,start_time', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(regenerated) })
  return listLuxorTourAvailability()
}

export async function unpublishLuxorTourDays(dates: string[]) {
  const cleanDates = [...new Set(dates)].filter(isLuxorTourDay).sort()
  if (cleanDates.length !== dates.length) throw new Error('Choose weekdays only.')

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
