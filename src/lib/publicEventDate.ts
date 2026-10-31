/** A date-only value in YYYY-MM-DD form, without UTC or time-of-day semantics. */
export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** The Luxor server-side cutoff is based on the venue's local calendar day. */
export function getLuxorTodayDateKey(now = new Date()) {
  return getDateKeyInTimeZone(now, 'America/Chicago')
}

export const LUXOR_BOOKING_DATE_MAX_MONTHS = 36

/** Add calendar months to a date-only key, clamping at the target month's end. */
export function addCalendarMonthsDateKey(value: string, months: number) {
  if (!isValidCalendarDateKey(value) || !Number.isInteger(months)) return null
  const [year, month, day] = value.split('-').map(Number)
  const absoluteMonth = year * 12 + month - 1 + months
  const targetYear = Math.floor(absoluteMonth / 12)
  const targetMonth = absoluteMonth - targetYear * 12
  const lastDay = new Date(0)
  lastDay.setUTCHours(0, 0, 0, 0)
  lastDay.setUTCFullYear(targetYear, targetMonth + 1, 0)
  const targetDay = Math.min(day, lastDay.getUTCDate())
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
}

export function getLuxorBookingDateMaxKey(today = getLuxorTodayDateKey()) {
  return addCalendarMonthsDateKey(today, LUXOR_BOOKING_DATE_MAX_MONTHS)
}

export function getDateKeyInTimeZone(now = new Date(), timeZone = 'America/Chicago') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isLuxorDateSelectable(value: unknown, today = getLuxorTodayDateKey()) {
  const maxDate = getLuxorBookingDateMaxKey(today)
  return isValidCalendarDateKey(value) && Boolean(maxDate) && value >= today && value <= maxDate!
}

/** Portal date edits retain historical access while blocking new bookings beyond 36 months. */
export function isLuxorBookingDateWithinLimit(value: unknown, today = getLuxorTodayDateKey()) {
  const maxDate = getLuxorBookingDateMaxKey(today)
  return isValidCalendarDateKey(value) && Boolean(maxDate) && value <= maxDate!
}

/** Recompute the current day on the server for a validated browser IANA timezone. */
export function isPublicEventDateSelectable(value: unknown, timeZone: unknown, now = new Date()) {
  let today = getLuxorTodayDateKey(now)
  if (typeof timeZone === 'string' && timeZone.length <= 80) {
    try {
      today = getDateKeyInTimeZone(now, timeZone)
    } catch {
      // Invalid or unsupported time zones use the venue's authoritative day.
    }
  }
  return isLuxorDateSelectable(value, today)
}
