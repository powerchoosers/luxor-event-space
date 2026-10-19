import { proposalSecurityDuration, validCalendarDate } from './luxorProposalTerms'

export const INACTIVE_WEEKDAY_CUSTOM_RENTAL_POLICY = {
  enabled: false,
  hourly_rate: 400,
  minimum_hours: null,
  time_increment_minutes: null,
  reset_window_policy: null,
  booking_policy: null,
  cleanup_buffer_minutes: null,
  security_hours_policy: null,
  selection_surface: null,
} as const

/** Fixed schedule rules explicitly approved for new Monday–Thursday proposals. */
export const APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE = {
  hourly_rate: 400,
  minimum_hours: 3,
  minimum_price: 1200,
  additional_hour_rate: 200,
  time_increment_minutes: 60,
  reset_window_policy: 'allowed',
  booking_policy: 'one_per_date',
  cleanup_buffer_minutes: 0,
  security_hours_policy: 'arrival_to_end',
  selection_surface: 'portal_only',
} as const

/** Malformed custom markers must never fall through to legacy pricing or booking paths. */
export function isWeekdayCustomRentalContext(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const context = value as Record<string, unknown>
  return context.weekday_custom_rental !== undefined ||
    (typeof context.rental_period === 'string' && context.rental_period.toLowerCase().replace(/[^a-z]/g, '') === 'custom')
}

export type LuxorWeekdayCustomRentalPolicy = {
  enabled: true
  pricing_version: 2 | 3
  hourly_rate: number
  minimum_hours: number
  minimum_price: number
  additional_hour_rate: number
  time_increment_minutes: number
  reset_window_policy: 'blocked' | 'allowed'
  booking_policy: 'one_per_date' | 'multiple_per_date'
  cleanup_buffer_minutes: number
  security_hours_policy: 'arrival_to_end' | 'rental_duration' | 'owner_entered'
  selection_surface: 'portal_only' | 'public_and_portal'
}

export type LuxorWeekdayCustomRentalTiming = {
  valid: boolean
  error?: string
  arrival: string
  end: string
  durationMinutes: number
  durationHours: number
  additionalHours: 0
}

export type LuxorWeekdayCustomRentalSchedule = {
  valid: boolean
  error?: string
  rentalStart: string
  rentalEnd: string
  guestArrival: string
  eventEnd: string
  durationMinutes: number
  durationHours: number
  securityHours: number
}

export type LuxorWeekdayCustomRentalSnapshot = {
  version: 1 | 2 | 3
  event_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  duration_hours: number
  hourly_rate: number
  minimum_price?: number
  additional_hour_rate?: number
  rental_total: number
  minimum_hours: number
  time_increment_minutes: number
  reset_window_policy: LuxorWeekdayCustomRentalPolicy['reset_window_policy']
  booking_policy: LuxorWeekdayCustomRentalPolicy['booking_policy']
  cleanup_buffer_minutes: number
  security_hours_policy: LuxorWeekdayCustomRentalPolicy['security_hours_policy']
  selection_surface: LuxorWeekdayCustomRentalPolicy['selection_surface']
  time_zone: 'America/Chicago'
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function policyRecord(config: unknown) {
  const root = record(config)
  return record((record(root?.luxor_costs) || root)?.weekday_custom_rental)
}

/** Decimal hours may represent exact minutes despite floating-point residue. */
export function weekdayRentalMinutesFromHours(hours: number): number | null {
  const minutes = hours * 60
  if (!Number.isFinite(minutes)) return null
  const rounded = Math.round(minutes)
  return Math.abs(minutes - rounded) <= 1e-9 ? rounded : null
}

/** Missing or disabled policy leaves every established rental rule intact. */
export function validateWeekdayCustomRentalPolicy(config: unknown, options: { historicalSnapshot?: boolean } = {}): string[] {
  const policy = policyRecord(config)
  if (!policy) return []
  if (policy.enabled !== true) return policy.enabled === false ? [] : ['Choose whether weekday custom rentals are enabled.']
  const errors: string[] = []
  const hourlyRate = number(policy.hourly_rate)
  if (hourlyRate === null || hourlyRate <= 0) errors.push('Set a valid weekday custom base hourly rate.')
  const minimum = number(policy.minimum_hours)
  const minimumMinutes = minimum === null ? null : weekdayRentalMinutesFromHours(minimum)
  if (minimum === null || minimum <= 0 || minimum > 19 || minimumMinutes === null || (!options.historicalSnapshot && minimum % 1 !== 0)) errors.push('Set the weekday minimum billed hours as a whole number, up to 19 hours.')
  const hasNewPricingFields = policy.minimum_price !== undefined || policy.additional_hour_rate !== undefined
  if (!options.historicalSnapshot && hasNewPricingFields) {
    const minimumPrice = number(policy.minimum_price)
    const additionalHourRate = number(policy.additional_hour_rate)
    if (minimumPrice === null || minimumPrice <= 0) errors.push('Set a valid weekday custom minimum price.')
    if (additionalHourRate === null || additionalHourRate < 0) errors.push('Set a valid weekday custom additional-hour rate.')
  }
  const increment = number(policy.time_increment_minutes)
  if (increment === null || !Number.isInteger(increment) || increment <= 0 || increment > 19 * 60) errors.push('Confirm the weekday time increment in whole minutes.')
  else if (!options.historicalSnapshot && increment !== 60) errors.push('New weekday custom proposals require full-hour time increments.')
  if (policy.reset_window_policy !== 'blocked' && policy.reset_window_policy !== 'allowed') errors.push('Set the weekday reset-window rule.')
  else if (!options.historicalSnapshot && policy.reset_window_policy !== 'allowed') errors.push('New weekday custom proposals may use the 3:00–5:00 PM reset window.')
  if (minimum !== null && minimum > 0 && increment !== null && Number.isInteger(increment) && increment > 0 && (policy.reset_window_policy === 'blocked' || policy.reset_window_policy === 'allowed')) {
    const windows = policy.reset_window_policy === 'blocked' ? [[6 * 60, 15 * 60], [17 * 60, 25 * 60]] : [[6 * 60, 25 * 60]]
    const maximum = Math.max(...windows.map(([start, end]) => Math.floor(end / increment) * increment - Math.ceil(start / increment) * increment))
    if (minimumMinutes !== null && minimumMinutes > maximum) errors.push('The weekday minimum and time increment must permit a rental within the approved access windows.')
  }
  if (policy.booking_policy !== 'one_per_date' && policy.booking_policy !== 'multiple_per_date') errors.push('Set the weekday event-capacity rule.')
  else if (!options.historicalSnapshot && policy.booking_policy !== 'one_per_date') errors.push('New weekday custom proposals are limited to one event per date.')
  const buffer = number(policy.cleanup_buffer_minutes)
  if (buffer === null || !Number.isInteger(buffer) || buffer < 0 || buffer > 19 * 60) errors.push('Confirm the weekday cleanup buffer in whole minutes, including zero if none is required.')
  else if (!options.historicalSnapshot && buffer !== 0) errors.push('New weekday custom rentals require a zero-minute additional cleanup buffer.')
  if (policy.security_hours_policy !== 'rental_duration' && policy.security_hours_policy !== 'owner_entered' && policy.security_hours_policy !== 'arrival_to_end') {
    errors.push('Choose a valid security-hour policy for the saved rental settings.')
  }
  if (policy.selection_surface !== 'portal_only' && policy.selection_surface !== 'public_and_portal') errors.push('Set where weekday custom rental times may be selected.')
  else if (!options.historicalSnapshot && policy.selection_surface !== 'portal_only') errors.push('New weekday custom proposals may select times in the owner portal only.')
  return errors
}

/** Only a complete, saved owner policy may enable the custom calculation. */
export function getWeekdayCustomRentalPolicy(config: unknown, options: { historicalSnapshot?: boolean } = {}): LuxorWeekdayCustomRentalPolicy | null {
  const policy = policyRecord(config)
  if (policy?.enabled !== true || validateWeekdayCustomRentalPolicy(config, options).length) return null
  return {
    enabled: true,
    pricing_version: policy.minimum_price !== undefined || policy.additional_hour_rate !== undefined ? 3 : 2,
    hourly_rate: number(policy.hourly_rate)!,
    minimum_hours: number(policy.minimum_hours)!,
    minimum_price: number(policy.minimum_price) ?? number(policy.hourly_rate)! * number(policy.minimum_hours)!,
    additional_hour_rate: number(policy.additional_hour_rate) ?? 0,
    time_increment_minutes: number(policy.time_increment_minutes)!,
    reset_window_policy: policy.reset_window_policy as LuxorWeekdayCustomRentalPolicy['reset_window_policy'],
    booking_policy: policy.booking_policy as LuxorWeekdayCustomRentalPolicy['booking_policy'],
    cleanup_buffer_minutes: number(policy.cleanup_buffer_minutes)!,
    security_hours_policy: policy.security_hours_policy as LuxorWeekdayCustomRentalPolicy['security_hours_policy'],
    selection_surface: policy.selection_surface as LuxorWeekdayCustomRentalPolicy['selection_surface'],
  }
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function isWeekdayCustomRentalDate(value: unknown): value is string {
  if (!validCalendarDate(value)) return false
  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay()
  return weekday >= 1 && weekday <= 4
}

export function validateWeekdayCustomRentalTiming(eventDate: string, start?: string | null, end?: string | null, policy?: LuxorWeekdayCustomRentalPolicy | null, options: { historicalSnapshot?: boolean } = {}): LuxorWeekdayCustomRentalTiming {
  const arrival = typeof start === 'string' ? start.trim() : ''
  const finishTime = typeof end === 'string' ? end.trim() : ''
  const fail = (error: string): LuxorWeekdayCustomRentalTiming => ({ valid: false, error, arrival, end: finishTime, durationMinutes: 0, durationHours: 0, additionalHours: 0 })
  if (!policy || validateWeekdayCustomRentalPolicy({ weekday_custom_rental: policy }, options).length) return fail('Weekday custom rentals require a complete approved scheduling policy before use.')
  if (!validCalendarDate(eventDate)) return fail('A valid event date is required.')
  if (!isWeekdayCustomRentalDate(eventDate)) return fail('Custom hourly rentals are available Monday through Thursday only.')
  const first = minutes(arrival)
  const rawLast = minutes(finishTime)
  if (first === null) return fail('Choose a valid custom rental start time.')
  if (rawLast === null) return fail('Choose a valid custom rental end time.')
  const last = rawLast < 6 * 60 ? rawLast + 24 * 60 : rawLast
  if (first < 6 * 60 || last > 25 * 60) return fail('Venue access is available from 6:00 AM through 1:00 AM the following day.')
  if (first >= last) return fail('Custom rental start time must be before its end time.')
  if (first % policy.time_increment_minutes || last % policy.time_increment_minutes) return fail(`Choose custom rental times in ${policy.time_increment_minutes}-minute increments.`)
  if (policy.reset_window_policy === 'blocked' && first < 17 * 60 && last > 15 * 60) return fail('The 3:00-5:00 PM reset period is reserved.')
  const durationMinutes = last - first
  if ((options.historicalSnapshot || policy.pricing_version === 2) && durationMinutes < weekdayRentalMinutesFromHours(policy.minimum_hours)!) return fail(`Custom weekday rentals require at least ${policy.minimum_hours} hours.`)
  return { valid: true, arrival, end: finishTime, durationMinutes, durationHours: durationMinutes / 60, additionalHours: 0 }
}

/** Validate independent rental and event boundaries on actual calendar days. */
export function validateWeekdayCustomRentalSchedule(
  eventDate: string,
  rentalStartValue?: string | null,
  rentalEndValue?: string | null,
  guestArrivalValue?: string | null,
  eventEndValue?: string | null,
  policy?: LuxorWeekdayCustomRentalPolicy | null,
): LuxorWeekdayCustomRentalSchedule {
  const rentalStart = typeof rentalStartValue === 'string' ? rentalStartValue.trim() : ''
  const rentalEnd = typeof rentalEndValue === 'string' ? rentalEndValue.trim() : ''
  const guestArrival = typeof guestArrivalValue === 'string' ? guestArrivalValue.trim() : ''
  const eventEnd = typeof eventEndValue === 'string' ? eventEndValue.trim() : ''
  const fail = (error: string): LuxorWeekdayCustomRentalSchedule => ({ valid: false, error, rentalStart, rentalEnd, guestArrival, eventEnd, durationMinutes: 0, durationHours: 0, securityHours: 0 })
  if (!policy || validateWeekdayCustomRentalPolicy({ weekday_custom_rental: policy }).length) return fail('Weekday custom rentals require a complete approved pricing and scheduling policy.')
  if (!validCalendarDate(eventDate) || !isWeekdayCustomRentalDate(eventDate)) return fail('Custom rentals are currently available Monday through Thursday only.')
  const start = minutes(rentalStart)
  const rawEnd = minutes(rentalEnd)
  const arrival = minutes(guestArrival)
  const rawEventEnd = minutes(eventEnd)
  if (start === null) return fail('Choose a valid rental start time.')
  if (rawEnd === null) return fail('Choose a valid rental end time.')
  if (arrival === null) return fail('Choose a valid guest arrival time.')
  if (rawEventEnd === null) return fail('Choose a valid event end time.')
  const onEventDate = (clock: number) => clock < 6 * 60 ? clock + 24 * 60 : clock
  const end = onEventDate(rawEnd)
  const guest = onEventDate(arrival)
  const finish = onEventDate(rawEventEnd)
  const increment = policy.time_increment_minutes
  if (start < 360 || end > 1500) return fail('Venue access is available from 6:00 AM through 1:00 AM the following day.')
  if (start % increment || end % increment) return fail(`Choose rental times in ${increment}-minute increments.`)
  if (end <= start) return fail('Rental start time must be before rental end time.')
  if (policy.reset_window_policy === 'blocked' && start < 17 * 60 && end > 15 * 60) return fail('The 3:00–5:00 PM reset period is reserved.')
  if (guest < start || guest > end) return fail('Guest arrival time must be within the rental period.')
  if (finish <= guest) return fail('Event end time must be after guest arrival time.')
  if (finish > end) return fail('Your event end time must be at or before your rental end time. Please adjust your event schedule or extend your rental period.')
  const securityDuration = proposalSecurityDuration(eventDate, guestArrival, eventEnd)
  if (!securityDuration.valid) return fail(securityDuration.error)
  const durationMinutes = end - start
  return { valid: true, rentalStart, rentalEnd, guestArrival, eventEnd, durationMinutes, durationHours: durationMinutes / 60, securityHours: securityDuration.durationHours }
}

/** Price integer minutes in cents once; never stack the fixed-period extension. */
export function weekdayCustomRentalSnapshot(eventDate: string, timing: LuxorWeekdayCustomRentalTiming, policy: LuxorWeekdayCustomRentalPolicy, options: { historicalSnapshot?: boolean; legacyVersion?: 1 | 2 } = {}): LuxorWeekdayCustomRentalSnapshot {
  const verified = validateWeekdayCustomRentalTiming(eventDate, timing.arrival, timing.end, policy, options)
  if (!timing.valid || !verified.valid || verified.durationMinutes !== timing.durationMinutes || verified.durationHours !== timing.durationHours) throw new Error('A valid weekday custom rental duration is required.')
  const historical = options.historicalSnapshot === true
  const legacyPricing = historical || policy.pricing_version === 2
  const legacyTotal = Math.round(verified.durationMinutes * Math.round(policy.hourly_rate * 100) / 60)
  const baseCents = Math.round(policy.minimum_price * 100)
  const extraCents = Math.round(policy.additional_hour_rate * 100)
  const rentalCents = legacyPricing
    ? legacyTotal
    : baseCents + Math.max(0, Math.round(verified.durationHours - policy.minimum_hours)) * extraCents
  return {
    version: historical ? (options.legacyVersion || 1) : policy.pricing_version,
    event_date: eventDate,
    start_time: timing.arrival,
    end_time: timing.end,
    duration_minutes: timing.durationMinutes,
    duration_hours: timing.durationHours,
    hourly_rate: policy.hourly_rate,
    ...(policy.pricing_version === 3 && !historical ? { minimum_price: policy.minimum_price, additional_hour_rate: policy.additional_hour_rate } : {}),
    rental_total: rentalCents / 100,
    minimum_hours: policy.minimum_hours,
    time_increment_minutes: policy.time_increment_minutes,
    reset_window_policy: policy.reset_window_policy,
    booking_policy: policy.booking_policy,
    cleanup_buffer_minutes: policy.cleanup_buffer_minutes,
    security_hours_policy: historical ? policy.security_hours_policy : 'arrival_to_end',
    selection_surface: policy.selection_surface,
    time_zone: 'America/Chicago',
  }
}

/** Read frozen terms without consulting or adopting a subsequently edited catalog. */
export function getWeekdayCustomRentalSnapshot(value: unknown): LuxorWeekdayCustomRentalSnapshot | null {
  const snapshot = record(value)
  if (!snapshot || (snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3) || snapshot.time_zone !== 'America/Chicago' || typeof snapshot.event_date !== 'string' || typeof snapshot.start_time !== 'string' || typeof snapshot.end_time !== 'string') return null
  const historicalSnapshot = snapshot.version !== 3
  const policy = getWeekdayCustomRentalPolicy({ weekday_custom_rental: { ...snapshot, enabled: true } }, { historicalSnapshot })
  if (!policy) return null
  const timing = validateWeekdayCustomRentalTiming(snapshot.event_date, snapshot.start_time, snapshot.end_time, policy, { historicalSnapshot })
  if (!timing.valid) return null
  const verified = weekdayCustomRentalSnapshot(snapshot.event_date, timing, policy, { historicalSnapshot, ...(historicalSnapshot ? { legacyVersion: snapshot.version as 1 | 2 } : {}) })
  for (const key of Object.keys(verified) as Array<keyof LuxorWeekdayCustomRentalSnapshot>) {
    if (snapshot[key] !== verified[key]) return null
  }
  return verified
}

/** Keep the displayed duration exact even when its hours are a repeating fraction. */
export function formatWeekdayCustomRentalDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  return [hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '', minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ')
}

/** Explain the frozen rental formula, including V2's historical hourly terms. */
export function formatWeekdayCustomRentalPriceBreakdown(snapshot: LuxorWeekdayCustomRentalSnapshot) {
  const money = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  if (snapshot.version === 3 && snapshot.minimum_price !== undefined && snapshot.additional_hour_rate !== undefined) {
    const extraHours = Math.max(0, snapshot.duration_hours - snapshot.minimum_hours)
    const minimum = `${money(snapshot.minimum_price)} minimum (first ${snapshot.minimum_hours} billed hours)`
    const extras = extraHours > 0
      ? ` + ${extraHours} additional hour${extraHours === 1 ? '' : 's'} at ${money(snapshot.additional_hour_rate)} each`
      : ''
    return `${minimum}${extras} = ${money(snapshot.rental_total)}`
  }
  return `${formatWeekdayCustomRentalDuration(snapshot.duration_minutes)} at ${money(snapshot.hourly_rate)} per hour = ${money(snapshot.rental_total)}`
}
