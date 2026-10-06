import type { LuxorProposalPromotionSnapshot } from './luxorInquiryTypes'

export const RENTAL_WINDOWS = {
  morning: { start: '09:00', end: '15:00' },
  evening: { start: '17:00', end: '23:00' },
  full_day: { start: '09:00', end: '23:00' },
} as const

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
