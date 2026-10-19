import type { LuxorProposalPromotionSnapshot } from './luxorInquiryTypes'

export const RENTAL_WINDOWS = {
  morning: { start: '09:00', end: '15:00' },
  evening: { start: '17:00', end: '23:00' },
  full_day: { start: '09:00', end: '23:00' },
} as const

export const LUXOR_EVENT_TIME_ZONE = 'America/Chicago'

const luxorLocalDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: LUXOR_EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

type LocalClockParts = { date: string; time: string }

function localClockParts(instant: number): LocalClockParts {
  const parts = Object.fromEntries(luxorLocalDateTimeFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function utcMilliseconds(year: number, month: number, day: number, hour: number, minute: number) {
  const value = new Date(0)
  value.setUTCFullYear(year, month - 1, day)
  value.setUTCHours(hour, minute, 0, 0)
  return value.getTime()
}

function luxorOffsetMinutesAt(instant: number) {
  const parts = Object.fromEntries(luxorLocalDateTimeFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
  const localAsUtc = utcMilliseconds(Number(parts.year), Number(parts.month), Number(parts.day), Number(parts.hour), Number(parts.minute))
  return Math.round((localAsUtc - instant) / 60_000)
}

const localInstantCache = new Map<string, number[]>()

/** Resolve a venue-local clock reading without using the host machine's timezone. */
function luxorLocalInstants(date: string, time: string) {
  const cacheKey = `${date}T${time}`
  const cached = localInstantCache.get(cacheKey)
  if (cached) return [...cached]

  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallClockAsUtc = utcMilliseconds(year, month, day, hour, minute)
  const offsets = new Set<number>()
  // Sampling on both sides of the requested local date discovers both offsets
  // during a daylight-saving transition, so repeated and skipped times are explicit.
  for (let hours = -36; hours <= 36; hours += 3) {
    offsets.add(luxorOffsetMinutesAt(wallClockAsUtc + hours * 3_600_000))
  }

  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset * 60_000)
    .filter((instant) => {
      const parts = localClockParts(instant)
      return parts.date === date && parts.time === time
    })
    .sort((left, right) => left - right)

  if (localInstantCache.size > 512) localInstantCache.clear()
  localInstantCache.set(cacheKey, candidates)
  return [...candidates]
}

function nextCalendarDate(date: string) {
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/**
 * Resolve actual elapsed security time between guest arrival and event end.
 * Times are venue-local and end times before arrival belong to the next date.
 * Missing, identical, skipped, and repeated local times are rejected instead
 * of being replaced with a rental-window duration or an assumed minimum.
 */
export function proposalSecurityDuration(eventDate: string, arrivalValue?: string | null, eventEndValue?: string | null) {
  const fail = (error: string) => ({
    valid: false as const,
    error,
    durationMinutes: 0,
    durationHours: 0,
    timeZone: LUXOR_EVENT_TIME_ZONE,
  })
  if (!validCalendarDate(eventDate)) return fail('A valid event date is required to calculate actual security hours.')

  const arrival = typeof arrivalValue === 'string' ? arrivalValue.trim() : ''
  const eventEnd = typeof eventEndValue === 'string' ? eventEndValue.trim() : ''
  if (!arrival) return fail('Enter the guest arrival time to calculate actual security hours.')
  if (!eventEnd) return fail('Enter the event end time to calculate actual security hours.')

  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!timePattern.test(arrival)) return fail('Guest arrival time is invalid.')
  if (!timePattern.test(eventEnd)) return fail('Event end time is invalid.')
  if (arrival === eventEnd) return fail('Guest arrival time must be before event end time.')

  const arrivalMinutes = Number(arrival.slice(0, 2)) * 60 + Number(arrival.slice(3, 5))
  const eventEndMinutes = Number(eventEnd.slice(0, 2)) * 60 + Number(eventEnd.slice(3, 5))
  const arrivalDate = arrivalMinutes < 6 * 60 ? nextCalendarDate(eventDate) : eventDate
  const eventEndDate = eventEndMinutes < arrivalMinutes ? nextCalendarDate(arrivalDate) : arrivalDate
  const arrivalInstants = luxorLocalInstants(arrivalDate, arrival)
  const eventEndInstants = luxorLocalInstants(eventEndDate, eventEnd)

  if (!arrivalInstants.length) return fail('Guest arrival time does not exist on this event date in Luxor local time.')
  if (arrivalInstants.length > 1) return fail('Guest arrival time is ambiguous on this event date in Luxor local time. Choose an unambiguous time.')
  if (!eventEndInstants.length) return fail('Event end time does not exist on this event date in Luxor local time.')
  if (eventEndInstants.length > 1) return fail('Event end time is ambiguous on this event date in Luxor local time. Choose an unambiguous time.')

  const durationMinutes = (eventEndInstants[0] - arrivalInstants[0]) / 60_000
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return fail('Event end time must be after guest arrival in Luxor local time.')

  return {
    valid: true as const,
    durationMinutes,
    durationHours: durationMinutes / 60,
    arrivalAt: new Date(arrivalInstants[0]).toISOString(),
    eventEndAt: new Date(eventEndInstants[0]).toISOString(),
    arrivalLocal: `${arrivalDate}T${arrival}`,
    eventEndLocal: `${eventEndDate}T${eventEnd}`,
    timeZone: LUXOR_EVENT_TIME_ZONE,
  }
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** Shared by the editor and server. Only time outside the standard window is billed. */
export function proposalEventTiming(period: string, arrival?: string | null, end?: string | null) {
  const window = RENTAL_WINDOWS[period as keyof typeof RENTAL_WINDOWS]
  const fail = (error: string) => ({ valid: false, error, additionalHours: 0, arrival: arrival || '', end: end || '' })
  if (!window) return fail('Choose a morning, evening, or full-day rental period.')
  const arrivalTime = arrival || window.start
  const endTime = end || window.end
  const start = minutes(arrivalTime)
  const rawEnd = minutes(endTime)
  if (start === null) return fail('Guest arrival time is invalid.')
  if (rawEnd === null) return fail('Event end time is invalid.')
  const finish = rawEnd < 6 * 60 ? rawEnd + 24 * 60 : rawEnd
  if (start < 6 * 60 || finish > 25 * 60) return fail('Venue access is available from 6:00 AM through 1:00 AM the following day.')
  if (start >= finish) return fail('Guest arrival time must be before event end time.')
  if (period === 'morning' && finish > 15 * 60) return fail('Morning events must end by 3:00 PM. The 3:00–5:00 PM reset period is reserved.')
  if (period === 'evening' && start < 17 * 60) return fail('Evening events must start at or after 5:00 PM. The 3:00–5:00 PM reset period is reserved.')
  const early = Math.max(0, minutes(window.start)! - start)
  const late = Math.max(0, finish - minutes(window.end)!)
  if (early % 60 || late % 60) return fail('Additional rental time is available in whole hours only. Choose a full-hour extension.')
  return { valid: true, error: undefined, additionalHours: (early + late) / 60, arrival: arrivalTime, end: endTime }
}

export function luxorCalendarDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function validCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function proposalValidThrough(createdAt: string, promotion?: Pick<LuxorProposalPromotionSnapshot, 'expires_on'> | null) {
  if (validCalendarDate(promotion?.expires_on)) return promotion.expires_on
  const date = new Date(`${createdAt.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0, 10)
}

/** Inclusive end of the selected date in the venue's timezone, including DST. */
export function proposalExpirationInstant(date: string) {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const probe = new Date(next.getTime() + 6 * 3600_000)
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(probe).find(p => p.type === 'timeZoneName')?.value
  const offset = Number(zone?.replace('GMT', '') || -6)
  return new Date(next.getTime() - offset * 3600_000 - 1000).toISOString()
}
