import { LUXOR_TIME_DROPDOWN_OPTIONS } from './luxorTimeOptions'

export type LuxorTourSlotStatus = 'available' | 'held' | 'booked' | 'unavailable'
export type LuxorTourScheduleMode = 'weekly' | 'flexible'

export type LuxorTourScheduleSettings = {
  id: string
  mode: LuxorTourScheduleMode
  weeks_ahead: number
  reminder_enabled: boolean
  reminder_day: number
  reminder_time: string
  updated_at?: string
}

export const WEEKS_AHEAD_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 12] as const

export const DEFAULT_TOUR_SCHEDULE_SETTINGS: LuxorTourScheduleSettings = {
  id: 'default',
  mode: 'weekly',
  weeks_ahead: 6,
  reminder_enabled: false,
  reminder_day: 1, // Monday
  reminder_time: '09:00',
}

export type LuxorTourAvailability = {
  weekday: number
  is_open: boolean
  start_time: string
  end_time: string
  times?: string[]
  updated_at?: string
}

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
export const LUXOR_WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function addMinutesToClockTime(value: string, minutesToAdd: number) {
  const [hours, minutes] = value.split(':').map(Number)
  const total = ((hours * 60) + minutes + minutesToAdd) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const LUXOR_TOUR_TIMES = LUXOR_TIME_DROPDOWN_OPTIONS.map(({ value }) => ({
  startTime: `${value}:00`,
  endTime: `${addMinutesToClockTime(value, 30)}:00`,
}))

export const LUXOR_TOUR_TIME_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const minutes = 8 * 60 + index * 30 // 8:00 AM (08:00) to 7:30 PM (19:30)
  const hours = Math.floor(minutes / 60)
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return { value: clock, label: formatTourSlotTime(`${clock}:00`) }
})

export function weekdayForTourDate(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

export function normalizeTourTime(time: string): string {
  const clean = time.trim()
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(clean)) {
    const [h, m, s] = clean.split(':')
    return `${h.padStart(2, '0')}:${m}:${s}`
  }
  if (/^\d{1,2}:\d{2}$/.test(clean)) {
    const [h, m] = clean.split(':')
    return `${h.padStart(2, '0')}:${m}:00`
  }
  return clean
}

export function tourTimesForAvailability(availability: Pick<LuxorTourAvailability, 'start_time' | 'end_time'> & { times?: string[] }) {
  if (Array.isArray(availability.times) && availability.times.length > 0) {
    const sorted = [...new Set(availability.times.map(normalizeTourTime))].sort((a, b) =>
      luxorTourTimeDisplayOrder(a) - luxorTourTimeDisplayOrder(b),
    )
    return sorted.map((startTime) => {
      const short = startTime.slice(0, 5)
      const endTime = `${addMinutesToClockTime(short, 30)}:00`
      return { startTime, endTime }
    })
  }

  const start = availability.start_time.slice(0, 5)
  const end = availability.end_time.slice(0, 5)
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3))
  const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3))
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return []
  return Array.from({ length: Math.floor((endMinutes - startMinutes) / 30) }, (_, index) => {
    const minutes = startMinutes + index * 30
    const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    return { startTime: `${value}:00`, endTime: `${String(Math.floor((minutes + 30) / 60)).padStart(2, '0')}:${String((minutes + 30) % 60).padStart(2, '0')}:00` }
  })
}

export const LUXOR_TOUR_EARLIEST_START_TIME = LUXOR_TOUR_TIMES.reduce(
  (earliest, slot) => (slot.startTime < earliest ? slot.startTime : earliest),
  '23:59:59',
)

export function getWeeksAheadCutoffDate(weeksAhead: number, fromDate = new Date()): string {
  const target = new Date(fromDate)
  target.setDate(target.getDate() + weeksAhead * 7)
  return target.toISOString().slice(0, 10)
}

export function luxorTourTimeDisplayOrder(time: string) {
  const [hours = '0', minutes = '0'] = time.split(':')
  const totalMinutes = Number(hours) * 60 + Number(minutes)
  if (!Number.isFinite(totalMinutes)) return Number.MAX_SAFE_INTEGER

  // Keep after-midnight times at the end of the displayed business day.
  return totalMinutes < 8 * 60 ? totalMinutes + 24 * 60 : totalMinutes
}

export function isLuxorTourDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day >= 0 && day <= 6
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
