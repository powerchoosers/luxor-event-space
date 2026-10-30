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
  return isValidCalendarDateKey(value) && value >= today
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
