import 'server-only'

import { formatTourSlotTime, LuxorTourSlot, PublicLuxorTourSlot, toPublicTourSlot } from './luxorTourSlots'
import { supabaseRest } from './supabaseRestServer'

const TOUR_SLOT_SELECT = 'id,created_at,updated_at,slot_date,start_time,end_time,status,capacity,booked_count,title,notes'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export async function listAvailableLuxorTourSlots(limit = 24): Promise<PublicLuxorTourSlot[]> {
  const slots = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&status=eq.available&slot_date=gte.${todayIsoDate()}&order=slot_date.asc,start_time.asc&limit=${encodeURIComponent(limit)}`,
  )

  return slots.filter((slot) => slot.capacity > slot.booked_count).map(toPublicTourSlot)
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
  const [created] = await supabaseRest<LuxorTourSlot[]>('luxor_tour_slots?select=' + TOUR_SLOT_SELECT, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      slot_date: input.slotDate,
      start_time: input.startTime,
      end_time: input.endTime || null,
      status: 'available',
      capacity: input.capacity ?? 1,
      booked_count: 0,
      title: input.title?.trim() || 'Private venue tour',
      notes: input.notes?.trim() || null,
    }),
  })

  return created
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
