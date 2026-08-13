type LuxorDateFormatOptions = {
  /** Include the local time for timestamp-based deadlines. */
  includeTime?: boolean
  /** Include the time-zone abbreviation when a time is shown. */
  includeTimeZone?: boolean
  /** Use a shorter weekday label where space is tight. */
  weekday?: 'long' | 'short'
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Formats Luxor's calendar dates without letting a YYYY-MM-DD value drift to
 * the previous or next day in a visitor's time zone. Date-only values retain
 * their exact calendar day; timestamp values are shown in the venue's local
 * time zone.
 */
export function formatLuxorDate(value: string | null | undefined, options: LuxorDateFormatOptions = {}) {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN)
  const date = dateOnlyMatch
    ? new Date(Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])))
    : new Date(trimmed)

  if (Number.isNaN(date.getTime())) return null
  if (dateOnlyMatch && (
    date.getUTCFullYear() !== Number(dateOnlyMatch[1])
    || date.getUTCMonth() !== Number(dateOnlyMatch[2]) - 1
    || date.getUTCDate() !== Number(dateOnlyMatch[3])
  )) return null

  const isDateOnly = Boolean(dateOnlyMatch)
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: options.weekday ?? 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(options.includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    ...(options.includeTime && options.includeTimeZone ? { timeZoneName: 'short' } : {}),
    timeZone: isDateOnly ? 'UTC' : 'America/Chicago',
  })

  return formatter.format(date)
}
