export type LuxorTourSlotStatus = 'available' | 'held' | 'booked' | 'unavailable'

export type LuxorTourSlot = {
  id: string
  created_at: string
  updated_at: string
  slot_date: string
  start_time: string
  end_time: string | null
  status: LuxorTourSlotStatus
  capacity: number
  booked_count: number
  title: string | null
  notes: string | null
}

export type PublicLuxorTourSlot = {
  id: string
  date: string
  time: string
  label: string
  dateLabel: string
  availableSpots: number
}

export function formatTourSlotDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

export function formatTourSlotTime(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  const date = new Date()
  date.setHours(Number(hours), Number(minutes), 0, 0)

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function toPublicTourSlot(slot: LuxorTourSlot): PublicLuxorTourSlot {
  const availableSpots = Math.max(0, slot.capacity - slot.booked_count)
  const dateLabel = formatTourSlotDate(slot.slot_date)
  const time = formatTourSlotTime(slot.start_time)

  return {
    id: slot.id,
    date: slot.slot_date,
    time,
    label: `${dateLabel}, ${time}`,
    dateLabel,
    availableSpots,
  }
}
