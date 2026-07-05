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

export async function listUpcomingLuxorTourSlots(limit = 100): Promise<LuxorTourSlot[]> {
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

  const nextBookedCount = slot.booked_count + 1
  const nextStatus = nextBookedCount >= slot.capacity ? 'booked' : 'available'

  const [updated] = await supabaseRest<LuxorTourSlot[]>(
    `luxor_tour_slots?select=${TOUR_SLOT_SELECT}&id=eq.${encodeURIComponent(slot.id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booked_count: nextBookedCount,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }),
    },
  )

  return updated ?? null
}

export function applyTourSlotToInquiry(
  row: { preferred_tour_date: string | null; preferred_tour_time: string | null },
  slot: LuxorTourSlot,
) {
  row.preferred_tour_date = slot.slot_date
  row.preferred_tour_time = formatTourSlotTime(slot.start_time)
}
