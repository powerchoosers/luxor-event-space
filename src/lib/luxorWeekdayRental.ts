import { validCalendarDate } from './luxorProposalTerms'

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
  time_increment_minutes: 60,
  reset_window_policy: 'allowed',
  booking_policy: 'one_per_date',
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
  hourly_rate: number
  minimum_hours: number
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

export type LuxorWeekdayCustomRentalSnapshot = {
  version: 1 | 2
  event_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  duration_hours: number
  hourly_rate: number
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
  if (number(policy.hourly_rate) !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.hourly_rate) errors.push('Weekday custom rental pricing must use the approved $400 hourly rate.')
  const minimum = number(policy.minimum_hours)
  const minimumMinutes = minimum === null ? null : weekdayRentalMinutesFromHours(minimum)
  if (minimum === null || minimum <= 0 || minimum > 19 || minimumMinutes === null) errors.push('Set the weekday minimum rental duration in whole minutes, up to 19 hours.')
  else if (!options.historicalSnapshot && minimum !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.minimum_hours) errors.push('New weekday custom proposals require the approved 3-hour minimum.')
  const increment = number(policy.time_increment_minutes)
  if (increment === null || !Number.isInteger(increment) || increment <= 0 || increment > 19 * 60) errors.push('Confirm the weekday time increment in whole minutes.')
  else if (!options.historicalSnapshot && increment !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.time_increment_minutes) errors.push('New weekday custom proposals require full-hour time increments.')
  if (policy.reset_window_policy !== 'blocked' && policy.reset_window_policy !== 'allowed') errors.push('Set the weekday reset-window rule.')
  else if (!options.historicalSnapshot && policy.reset_window_policy !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.reset_window_policy) errors.push('New weekday custom proposals may use the 3:00–5:00 PM reset window.')
  if (minimum !== null && minimum > 0 && increment !== null && Number.isInteger(increment) && increment > 0 && (policy.reset_window_policy === 'blocked' || policy.reset_window_policy === 'allowed')) {
    const windows = policy.reset_window_policy === 'blocked' ? [[6 * 60, 15 * 60], [17 * 60, 25 * 60]] : [[6 * 60, 25 * 60]]
    const maximum = Math.max(...windows.map(([start, end]) => Math.floor(end / increment) * increment - Math.ceil(start / increment) * increment))
    if (minimumMinutes !== null && minimumMinutes > maximum) errors.push('The weekday minimum and time increment must permit a rental within the approved access windows.')
  }
  if (policy.booking_policy !== 'one_per_date' && policy.booking_policy !== 'multiple_per_date') errors.push('Set the weekday event-capacity rule.')
  else if (!options.historicalSnapshot && policy.booking_policy !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.booking_policy) errors.push('New weekday custom proposals are limited to one event per date.')
  const buffer = number(policy.cleanup_buffer_minutes)
  if (buffer === null || !Number.isInteger(buffer) || buffer < 0 || buffer > 19 * 60) errors.push('Confirm the weekday cleanup buffer in whole minutes, including zero if none is required.')
  if (options.historicalSnapshot) {
    if (policy.security_hours_policy !== 'rental_duration' && policy.security_hours_policy !== 'owner_entered' && policy.security_hours_policy !== 'arrival_to_end') errors.push('The saved historical security-hour policy is invalid.')
  } else if (policy.security_hours_policy !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.security_hours_policy) {
    errors.push('New weekday security pricing must use guest arrival through event end, with the existing four-hour minimum.')
  }
  if (policy.selection_surface !== 'portal_only' && policy.selection_surface !== 'public_and_portal') errors.push('Set where weekday custom rental times may be selected.')
  else if (!options.historicalSnapshot && policy.selection_surface !== APPROVED_WEEKDAY_CUSTOM_RENTAL_SCHEDULE.selection_surface) errors.push('New weekday custom proposals may select times in the owner portal only.')
  return errors
}

/** Only a complete, saved owner policy may enable the custom calculation. */
export function getWeekdayCustomRentalPolicy(config: unknown, options: { historicalSnapshot?: boolean } = {}): LuxorWeekdayCustomRentalPolicy | null {
  const policy = policyRecord(config)
  if (policy?.enabled !== true || validateWeekdayCustomRentalPolicy(config, options).length) return null
  return {
    enabled: true,
    hourly_rate: number(policy.hourly_rate)!,
    minimum_hours: number(policy.minimum_hours)!,
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
  if (durationMinutes < weekdayRentalMinutesFromHours(policy.minimum_hours)!) return fail(`Custom weekday rentals require at least ${policy.minimum_hours} hours.`)
  return { valid: true, arrival, end: finishTime, durationMinutes, durationHours: durationMinutes / 60, additionalHours: 0 }
}

/** Price integer minutes in cents once; never stack the fixed-period extension. */
export function weekdayCustomRentalSnapshot(eventDate: string, timing: LuxorWeekdayCustomRentalTiming, policy: LuxorWeekdayCustomRentalPolicy, options: { historicalSnapshot?: boolean } = {}): LuxorWeekdayCustomRentalSnapshot {
  const verified = validateWeekdayCustomRentalTiming(eventDate, timing.arrival, timing.end, policy, options)
  if (!timing.valid || !verified.valid || verified.durationMinutes !== timing.durationMinutes || verified.durationHours !== timing.durationHours) throw new Error('A valid weekday custom rental duration is required.')
  return {
    version: options.historicalSnapshot ? 1 : 2,
    event_date: eventDate,
    start_time: timing.arrival,
    end_time: timing.end,
    duration_minutes: timing.durationMinutes,
    duration_hours: timing.durationHours,
    hourly_rate: policy.hourly_rate,
    rental_total: Math.round(timing.durationMinutes * Math.round(policy.hourly_rate * 100) / 60) / 100,
    minimum_hours: policy.minimum_hours,
    time_increment_minutes: policy.time_increment_minutes,
    reset_window_policy: policy.reset_window_policy,
    booking_policy: policy.booking_policy,
    cleanup_buffer_minutes: policy.cleanup_buffer_minutes,
    security_hours_policy: policy.security_hours_policy,
    selection_surface: policy.selection_surface,
    time_zone: 'America/Chicago',
  }
}

/** Read frozen terms without consulting or adopting a subsequently edited catalog. */
export function getWeekdayCustomRentalSnapshot(value: unknown): LuxorWeekdayCustomRentalSnapshot | null {
  const snapshot = record(value)
  if (!snapshot || (snapshot.version !== 1 && snapshot.version !== 2) || snapshot.time_zone !== 'America/Chicago' || typeof snapshot.event_date !== 'string' || typeof snapshot.start_time !== 'string' || typeof snapshot.end_time !== 'string') return null
  const historicalSnapshot = snapshot.version === 1
  const policy = getWeekdayCustomRentalPolicy({ weekday_custom_rental: { ...snapshot, enabled: true } }, { historicalSnapshot })
  if (!policy) return null
  const timing = validateWeekdayCustomRentalTiming(snapshot.event_date, snapshot.start_time, snapshot.end_time, policy, { historicalSnapshot })
  if (!timing.valid) return null
  const verified = weekdayCustomRentalSnapshot(snapshot.event_date, timing, policy, { historicalSnapshot })
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
