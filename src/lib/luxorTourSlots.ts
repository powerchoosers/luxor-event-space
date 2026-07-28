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

export const LUXOR_TOUR_TIME_ZONE = 'America/Chicago'
export const LUXOR_TOUR_MIN_NOTICE_HOURS = 24
export const LUXOR_TOUR_TIMES = [
  { startTime: '11:00:00', endTime: '11:30:00' },
  { startTime: '11:30:00', endTime: '12:00:00' },
  { startTime: '12:00:00', endTime: '12:30:00' },
  { startTime: '12:30:00', endTime: '13:00:00' },
  { startTime: '13:00:00', endTime: '13:30:00' },
  { startTime: '13:30:00', endTime: '14:00:00' },
  { startTime: '17:00:00', endTime: '17:30:00' },
  { startTime: '17:30:00', endTime: '18:00:00' },
  { startTime: '18:00:00', endTime: '18:30:00' },
  { startTime: '18:30:00', endTime: '19:00:00' },
  { startTime: '19:00:00', endTime: '19:30:00' },
] as const

export function isLuxorTourDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 2 || day === 3
}

export function isLuxorTourTime(time: string) {
  const normalized = time.length === 5 ? `${time}:00` : time
  return LUXOR_TOUR_TIMES.some((slot) => slot.startTime === normalized)
}

export function zonedTourDateTimeToUtc(dateValue: string, timeValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hours, minutes] = timeValue.split(':').map(Number)
  const wantedUtc = Date.UTC(year, month - 1, day, hours, minutes)
  let result = new Date(wantedUtc)

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LUXOR_TOUR_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(result)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute))
    result = new Date(result.getTime() + (wantedUtc - representedUtc))
  }

  return result
}

export function isLuxorTourSlotAtLeast24HoursAway(date: string, time: string, now = new Date()) {
  return zonedTourDateTimeToUtc(date, time).getTime() >= now.getTime() + LUXOR_TOUR_MIN_NOTICE_HOURS * 60 * 60 * 1000
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
