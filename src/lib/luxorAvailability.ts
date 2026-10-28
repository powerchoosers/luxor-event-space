import { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorTestLeadPolicy'
import { RENTAL_WINDOWS } from './luxorProposalTerms'

export type LuxorAvailabilityBooking = {
  id?: string
  inquiry_id?: string | null
  client_name?: string | null
  event_date: string | null
  start_time: string | null
  end_time: string | null
  status: string
  is_test?: boolean
  metadata?: Record<string, unknown> | null
}

export type LuxorAvailabilityBlock = { start: number; end: number }
export type LuxorAvailabilityDay = {
  amBooked: boolean
  pmBooked: boolean
  status: 'available' | 'am-booked' | 'pm-booked' | 'fully-booked'
  blocks: LuxorAvailabilityBlock[]
}
export type LuxorAvailabilityCalendar = Record<string, LuxorAvailabilityDay>

const DAY_MINUTES = 24 * 60
const NEXT_DAY_MINUTES = 25 * 60
const EARLIEST_RENTAL_MINUTES = 6 * 60

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && (
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/.test(value)
    || /^24:00(?::00(?:\.0+)?)?$/.test(value)
  )
}

function clockMinutes(value: string) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
}

const AM_SLOT = { start: clockMinutes(RENTAL_WINDOWS.morning.start), end: clockMinutes(RENTAL_WINDOWS.morning.end) }
const PM_SLOT = { start: clockMinutes(RENTAL_WINDOWS.evening.start), end: clockMinutes(RENTAL_WINDOWS.evening.end) }

/** Converts venue-local HH:mm values into the proposal's 6:00 AM–1:00 AM range. */
export function luxorScheduleMinutes(startTime: unknown, endTime: unknown): LuxorAvailabilityBlock | null {
  if (!isValidTime(startTime) || !isValidTime(endTime)) return null
  let start = clockMinutes(startTime)
  let end = clockMinutes(endTime)

  // Values before 6:00 AM represent the after-midnight part of the event day.
  if (start < EARLIEST_RENTAL_MINUTES) start += DAY_MINUTES
  if (end < EARLIEST_RENTAL_MINUTES) end += DAY_MINUTES
  if (end <= start) end += DAY_MINUTES

  if (start < EARLIEST_RENTAL_MINUTES || start >= NEXT_DAY_MINUTES || end <= start || end > NEXT_DAY_MINUTES) {
    return null
  }

  return { start, end }
}

function bookingRange(booking: LuxorAvailabilityBooking): LuxorAvailabilityBlock {
  const context = booking.metadata?.final_proposal_context
  const savedContext = context && typeof context === 'object' && !Array.isArray(context)
    ? context as Record<string, unknown>
    : null
  const startTime = booking.start_time || savedContext?.rental_start_time || savedContext?.start_time
  const endTime = booking.end_time || savedContext?.rental_end_time || savedContext?.end_time
  const rentalSnapshotValue = savedContext?.weekday_custom_rental
  const rentalSnapshot = rentalSnapshotValue && typeof rentalSnapshotValue === 'object' && !Array.isArray(rentalSnapshotValue)
    ? rentalSnapshotValue as Record<string, unknown>
    : null
  if (rentalSnapshot?.booking_policy === 'one_per_date') return { start: 0, end: DAY_MINUTES }
  // Historical bookings without a reliable period conservatively occupy the whole day.
  const range = luxorScheduleMinutes(startTime, endTime)
  if (!range) return { start: 0, end: DAY_MINUTES }
  const buffer = Number(rentalSnapshot?.cleanup_buffer_minutes)
  if (!Number.isFinite(buffer) || buffer <= 0) return range
  return { start: Math.max(0, range.start - buffer), end: Math.min(NEXT_DAY_MINUTES, range.end + buffer) }
}

export function isLuxorTestAvailabilityBooking(booking: LuxorAvailabilityBooking) {
  const metadata = booking.metadata
  return booking.is_test === true
    || booking.inquiry_id === LUXOR_PERMANENT_TEST_LEAD_ID
    || metadata?.is_test_record === true
}

function isActiveBooking(booking: LuxorAvailabilityBooking) {
  return booking.status === 'tentative' || booking.status === 'confirmed'
}

function isCalendarBooking(booking: LuxorAvailabilityBooking) {
  return isActiveBooking(booking) || booking.status === 'completed'
}

function overlaps(a: LuxorAvailabilityBlock, b: LuxorAvailabilityBlock) {
  return a.start < b.end && a.end > b.start
}

function finalizeDay(blocks: LuxorAvailabilityBlock[]): LuxorAvailabilityDay {
  const amBooked = blocks.some((block) => overlaps(block, AM_SLOT))
  const pmBooked = blocks.some((block) => overlaps(block, PM_SLOT))
  return {
    amBooked,
    pmBooked,
    status: amBooked && pmBooked ? 'fully-booked' : amBooked ? 'am-booked' : pmBooked ? 'pm-booked' : 'available',
    blocks,
  }
}

/** One shared status calculation for the proposal calendar and the owner calendar. */
export function buildLuxorAvailabilityCalendar(bookings: LuxorAvailabilityBooking[]): LuxorAvailabilityCalendar {
  const blocksByDate = new Map<string, LuxorAvailabilityBlock[]>()

  for (const booking of bookings) {
    if (!booking.event_date || isLuxorTestAvailabilityBooking(booking)) continue
    if (!isCalendarBooking(booking)) continue
    const blocks = blocksByDate.get(booking.event_date) || []
    blocks.push(bookingRange(booking))
    blocksByDate.set(booking.event_date, blocks)
  }

  return Object.fromEntries([...blocksByDate.entries()].map(([date, blocks]) => [date, finalizeDay(blocks)]))
}

/** Returns active booking conflicts for a proposed period; missing ranges fail closed for that date. */
export function luxorAvailabilityConflicts(
  bookings: LuxorAvailabilityBooking[],
  date: string,
  startTime?: unknown,
  endTime?: unknown,
  options: { blockWholeDate?: boolean; cleanupBufferMinutes?: number } = {},
) {
  const selection = luxorScheduleMinutes(startTime, endTime)
  const requestedRange = options.blockWholeDate || !selection
    ? { start: 0, end: DAY_MINUTES }
    : {
        start: Math.max(0, selection.start - Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
        end: Math.min(NEXT_DAY_MINUTES, selection.end + Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
      }
  return bookings.filter((booking) => {
    if (booking.event_date !== date || !isActiveBooking(booking) || isLuxorTestAvailabilityBooking(booking)) return false
    return overlaps(bookingRange(booking), requestedRange)
  })
}

/** A proposed period can use a date only when its time range avoids every active booking/hold. */
export function isLuxorAvailabilityRangeOpen(
  calendar: LuxorAvailabilityCalendar,
  date: string,
  startTime: unknown,
  endTime: unknown,
  options: { blockWholeDate?: boolean; cleanupBufferMinutes?: number } = {},
) {
  const selection = luxorScheduleMinutes(startTime, endTime)
  if (!selection) return false
  const day = calendar[date]
  const requestedRange = options.blockWholeDate
    ? { start: 0, end: DAY_MINUTES }
    : {
        start: Math.max(0, selection.start - Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
        end: Math.min(NEXT_DAY_MINUTES, selection.end + Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
      }
  return !day?.blocks.some((block) => overlaps(block, requestedRange))
}

export function luxorRentalRange(period: string, startTime?: unknown, endTime?: unknown) {
  if (period === 'custom') return luxorScheduleMinutes(startTime, endTime)
  if (period === 'full_day') {
    return luxorScheduleMinutes(RENTAL_WINDOWS.full_day.start, RENTAL_WINDOWS.full_day.end)
  }
  const window = period === 'morning' ? RENTAL_WINDOWS.morning : period === 'evening' ? RENTAL_WINDOWS.evening : null
  return window ? luxorScheduleMinutes(window.start, window.end) : null
}

export function isLuxorRentalPeriodOpen(
  calendar: LuxorAvailabilityCalendar,
  date: string,
  period: string,
  startTime?: unknown,
  endTime?: unknown,
  options: { blockWholeDate?: boolean; cleanupBufferMinutes?: number } = {},
) {
  const range = luxorRentalRange(period, startTime, endTime)
  if (!range) return false
  const day = calendar[date]
  const requestedRange = options.blockWholeDate
    ? { start: 0, end: DAY_MINUTES }
    : {
        start: Math.max(0, range.start - Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
        end: Math.min(NEXT_DAY_MINUTES, range.end + Math.max(0, Number(options.cleanupBufferMinutes) || 0)),
      }
  return !day?.blocks.some((block) => overlaps(block, requestedRange))
}

export function luxorAvailabilityStatusLabel(day?: LuxorAvailabilityDay) {
  if (!day || day.status === 'available') return 'Available'
  if (day.status === 'fully-booked') return 'Fully booked'
  return day.status === 'am-booked' ? 'AM slot booked' : 'PM slot booked'
}
