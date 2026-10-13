import { validCalendarDate } from './luxorProposalTerms'

export const LUXOR_CUSTOM_TIME_V4_GATE = 'LUXOR_CUSTOM_TIME_V4_READY'
export const LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_GATE = 'LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY'

export type LuxorCustomTimeDayGroup = 'monday_thursday' | 'friday' | 'saturday' | 'sunday'
export type LuxorCustomTimeRentalPolicyV4 = {
  enabled: true
  minimum_hours: number
  minimum_price: number
  additional_hour_rate: number
  time_increment_minutes: 60
  reset_window_policy: 'allowed'
  booking_policy: 'one_per_date'
  cleanup_buffer_minutes: 0
  security_hours_policy: 'arrival_to_end'
  selection_surface: 'portal_only' | 'public_and_portal'
}
export type LuxorCustomTimeRentalSnapshotV4 = LuxorCustomTimeRentalPolicyV4 & {
  version: 4
  day_group: LuxorCustomTimeDayGroup
  event_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  duration_hours: number
  hourly_rate: number
  rental_total: number
  rental_start_at: string
  rental_end_at: string
  guest_arrival_at: string
  event_end_at: string
  security_hours: number
  time_zone: 'America/Chicago'
}

export type LuxorCustomTimeScheduleV4 = {
  valid: boolean
  error?: string
  rentalStartAt: string
  rentalEndAt: string
  guestArrivalAt: string
  eventEndAt: string
  durationMinutes: number
  securityHours: number
}

const DAY_GROUPS: LuxorCustomTimeDayGroup[] = ['monday_thursday', 'friday', 'saturday', 'sunday']

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function luxorCustomTimeDayGroup(value: unknown): LuxorCustomTimeDayGroup | null {
  if (!validCalendarDate(value)) return null
  const day = new Date(`${value}T12:00:00Z`).getUTCDay()
  if (day === 5) return 'friday'
  if (day === 6) return 'saturday'
  if (day === 0) return 'sunday'
  if (day >= 1 && day <= 4) return 'monday_thursday'
  return null
}

export function validateLuxorCustomTimeRentalV4Config(config: unknown): string[] {
  const root = record(config)
  const costs = record(root?.luxor_costs) || root
  const days = record(costs?.custom_time_rental_v4)
  if (!days) return []
  const errors: string[] = []
  for (const day of DAY_GROUPS) {
    const policy = record(days[day])
    if (!policy || policy.enabled === false) continue
    if (policy.enabled !== true) {
      errors.push(`Choose whether Custom Time is enabled for ${day.replace('_', ' ')}.`)
      continue
    }
    const minimumHours = numeric(policy.minimum_hours)
    const minimumPrice = numeric(policy.minimum_price)
    const additionalRate = numeric(policy.additional_hour_rate)
    if (minimumHours === null || !Number.isInteger(minimumHours) || minimumHours < 1 || minimumHours > 19) errors.push(`Set the ${day.replace('_', ' ')} Custom Time minimum as a whole number from 1 to 19 hours.`)
    if (minimumPrice === null || minimumPrice <= 0) errors.push(`Set a positive ${day.replace('_', ' ')} Custom Time minimum price.`)
    if (additionalRate === null || additionalRate < 0) errors.push(`Set the ${day.replace('_', ' ')} Custom Time rate for every additional hour.`)
    if (policy.time_increment_minutes !== 60) errors.push(`Set ${day.replace('_', ' ')} Custom Time in 60-minute increments.`)
    if (policy.reset_window_policy !== 'allowed') errors.push(`Confirm the ${day.replace('_', ' ')} Custom Time reset-window rule.`)
    if (policy.booking_policy !== 'one_per_date') errors.push(`Confirm one ${day.replace('_', ' ')} custom rental per calendar date.`)
    if (policy.cleanup_buffer_minutes !== 0) errors.push(`Set the ${day.replace('_', ' ')} Custom Time cleanup buffer to zero.`)
    if (policy.security_hours_policy !== 'arrival_to_end') errors.push(`Set ${day.replace('_', ' ')} security hours from guest arrival through event end.`)
    if (policy.selection_surface !== undefined && !['portal_only', 'public_and_portal'].includes(String(policy.selection_surface))) errors.push(`Choose where ${day.replace('_', ' ')} Custom Time may be selected.`)
    if (policy.show_publicly !== undefined && typeof policy.show_publicly !== 'boolean') errors.push(`Choose whether the ${day.replace('_', ' ')} Custom Time starting price is shown publicly.`)
  }
  return errors
}

export function getLuxorCustomTimeRentalPolicyV4(config: unknown, eventDate: unknown): LuxorCustomTimeRentalPolicyV4 | null {
  const day = luxorCustomTimeDayGroup(eventDate)
  if (!day) return null
  const root = record(config)
  const costs = record(root?.luxor_costs) || root
  const policy = record(record(costs?.custom_time_rental_v4)?.[day])
  if (!policy || policy.enabled !== true || validateLuxorCustomTimeRentalV4Config({ custom_time_rental_v4: { [day]: policy } }).length) return null
  return {
    enabled: true,
    minimum_hours: numeric(policy.minimum_hours)!,
    minimum_price: numeric(policy.minimum_price)!,
    additional_hour_rate: numeric(policy.additional_hour_rate)!,
    time_increment_minutes: 60,
    reset_window_policy: 'allowed',
    booking_policy: 'one_per_date',
    cleanup_buffer_minutes: 0,
    security_hours_policy: 'arrival_to_end',
    selection_surface: (policy.selection_surface === 'public_and_portal' ? 'public_and_portal' : 'portal_only') as LuxorCustomTimeRentalPolicyV4['selection_surface'],
  }
}

function clockMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function nextDate(date: string) {
  const current = new Date(`${date}T12:00:00Z`)
  current.setUTCDate(current.getUTCDate() + 1)
  return current.toISOString().slice(0, 10)
}

/** Local venue date-time without an implicit server/browser timezone. */
function venueDateTime(eventDate: string, clock: string) {
  const value = clockMinutes(clock)
  if (value === null) return null
  const date = value < 6 * 60 ? nextDate(eventDate) : eventDate
  return `${date}T${clock}:00`
}

export function validateLuxorCustomTimeScheduleV4(
  eventDate: string,
  rentalStartValue: string,
  rentalEndValue: string,
  guestArrivalValue: string,
  eventEndValue: string,
  policy: LuxorCustomTimeRentalPolicyV4 | null,
): LuxorCustomTimeScheduleV4 {
  const fail = (error: string): LuxorCustomTimeScheduleV4 => ({ valid: false, error, rentalStartAt: '', rentalEndAt: '', guestArrivalAt: '', eventEndAt: '', durationMinutes: 0, securityHours: 0 })
  if (!validCalendarDate(eventDate) || !luxorCustomTimeDayGroup(eventDate)) return fail('A valid event date is required for Custom Time.')
  if (!policy) return fail('Custom Time is disabled until an owner configures the rental rules for this day.')
  const startClock = clockMinutes(rentalStartValue)
  const endClock = clockMinutes(rentalEndValue)
  const guestClock = clockMinutes(guestArrivalValue)
  const eventEndClock = clockMinutes(eventEndValue)
  if (startClock === null || endClock === null || guestClock === null || eventEndClock === null) return fail('Choose valid rental start, rental end, guest arrival, and event end times.')
  const start = startClock < 360 ? startClock + 1440 : startClock
  const end = endClock < 360 ? endClock + 1440 : endClock
  const guest = guestClock < 360 ? guestClock + 1440 : guestClock
  const eventEnd = eventEndClock < 360 ? eventEndClock + 1440 : eventEndClock
  if (start < 360 || start >= 1440 || end > 1500) return fail('Venue access can start from 6:00 AM and end by 1:00 AM the following day.')
  if (end <= start) return fail('Rental end must be after rental start on the actual calendar date.')
  if (start % 60 || end % 60) return fail('Custom rental boundaries must use whole-hour increments.')
  if (guest < start || guest > end) return fail('Guest arrival must fall within the rental access period.')
  if (eventEnd < guest) return fail('Event end must be after guest arrival on the actual calendar date.')
  if (eventEnd > end) return fail('Event end must be at or before rental end.')
  const durationMinutes = end - start
  if (durationMinutes > 19 * 60) return fail('Custom rentals cannot exceed 19 hours.')
  const securityHours = Math.max(4, (eventEnd - guest) / 60)
  return {
    valid: true,
    rentalStartAt: venueDateTime(eventDate, rentalStartValue)!,
    rentalEndAt: venueDateTime(eventDate, rentalEndValue)!,
    guestArrivalAt: venueDateTime(eventDate, guestArrivalValue)!,
    eventEndAt: venueDateTime(eventDate, eventEndValue)!,
    durationMinutes,
    securityHours,
  }
}

export function luxorCustomTimeRentalSnapshotV4(
  eventDate: string,
  rentalStart: string,
  rentalEnd: string,
  guestArrival: string,
  eventEnd: string,
  policy: LuxorCustomTimeRentalPolicyV4,
): LuxorCustomTimeRentalSnapshotV4 {
  const schedule = validateLuxorCustomTimeScheduleV4(eventDate, rentalStart, rentalEnd, guestArrival, eventEnd, policy)
  if (!schedule.valid) throw new Error(schedule.error || 'Valid custom rental timing is required.')
  const dayGroup = luxorCustomTimeDayGroup(eventDate)!
  const durationHours = schedule.durationMinutes / 60
  const rentalTotal = Math.round((policy.minimum_price + Math.max(0, durationHours - policy.minimum_hours) * policy.additional_hour_rate) * 100) / 100
  return {
    enabled: true,
    version: 4,
    day_group: dayGroup,
    event_date: eventDate,
    start_time: rentalStart,
    end_time: rentalEnd,
    duration_minutes: schedule.durationMinutes,
    duration_hours: durationHours,
    hourly_rate: policy.minimum_price / policy.minimum_hours,
    minimum_hours: policy.minimum_hours,
    minimum_price: policy.minimum_price,
    additional_hour_rate: policy.additional_hour_rate,
    rental_total: rentalTotal,
    rental_start_at: schedule.rentalStartAt,
    rental_end_at: schedule.rentalEndAt,
    guest_arrival_at: schedule.guestArrivalAt,
    event_end_at: schedule.eventEndAt,
    security_hours: schedule.securityHours,
    time_increment_minutes: 60,
    reset_window_policy: 'allowed',
    booking_policy: 'one_per_date',
    cleanup_buffer_minutes: 0,
    security_hours_policy: 'arrival_to_end',
    selection_surface: policy.selection_surface,
    time_zone: 'America/Chicago',
  }
}

/** Validate frozen V4 arithmetic and actual local dates without reading live catalog values. */
export function getLuxorCustomTimeRentalSnapshotV4(value: unknown): LuxorCustomTimeRentalSnapshotV4 | null {
  const snapshot = record(value)
  if (!snapshot || snapshot.version !== 4 || !validCalendarDate(snapshot.event_date)) return null
  const additionalHourRate = numeric(snapshot.additional_hour_rate)
  if (additionalHourRate === null || additionalHourRate < 0) return null
  const policy = {
    enabled: true as const,
    minimum_hours: numeric(snapshot.minimum_hours) || 0,
    minimum_price: numeric(snapshot.minimum_price) || 0,
    additional_hour_rate: additionalHourRate,
    time_increment_minutes: 60 as const,
    reset_window_policy: 'allowed' as const,
    booking_policy: 'one_per_date' as const,
    cleanup_buffer_minutes: 0 as const,
    security_hours_policy: 'arrival_to_end' as const,
    selection_surface: snapshot.selection_surface as LuxorCustomTimeRentalPolicyV4['selection_surface'],
  }
  if (!['portal_only', 'public_and_portal'].includes(policy.selection_surface)) return null
  try {
    const computed = luxorCustomTimeRentalSnapshotV4(String(snapshot.event_date), String(snapshot.start_time), String(snapshot.end_time), String(snapshot.guest_arrival_at).slice(11, 16), String(snapshot.event_end_at).slice(11, 16), policy)
    for (const key of Object.keys(computed) as Array<keyof LuxorCustomTimeRentalSnapshotV4>) {
      if (snapshot[key] !== computed[key]) return null
    }
    return computed
  } catch {
    return null
  }
}

export function luxorCustomTimeRentalPolicyMatchesV4(policy: LuxorCustomTimeRentalPolicyV4, snapshot: LuxorCustomTimeRentalSnapshotV4) {
  return policy.minimum_hours === snapshot.minimum_hours && policy.minimum_price === snapshot.minimum_price &&
    policy.additional_hour_rate === snapshot.additional_hour_rate && policy.time_increment_minutes === snapshot.time_increment_minutes &&
    policy.reset_window_policy === snapshot.reset_window_policy && policy.booking_policy === snapshot.booking_policy &&
    policy.cleanup_buffer_minutes === snapshot.cleanup_buffer_minutes && policy.security_hours_policy === snapshot.security_hours_policy &&
    policy.selection_surface === snapshot.selection_surface
}

export function formatLuxorCustomTimeRentalPriceBreakdownV4(snapshot: LuxorCustomTimeRentalSnapshotV4) {
  const money = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const extras = Math.max(0, snapshot.duration_hours - snapshot.minimum_hours)
  return `${money(snapshot.minimum_price)} minimum (first ${snapshot.minimum_hours} billed hours)${extras ? ` + ${extras} additional hour${extras === 1 ? '' : 's'} at ${money(snapshot.additional_hour_rate)} each` : ''} = ${money(snapshot.rental_total)}`
}
