import { getWeekdayCustomRentalSnapshot, isWeekdayCustomRentalContext } from './luxorWeekdayRental'
import { getLuxorCustomTimeRentalSnapshotV4 } from './luxorCustomTimeRentalV4'
import { resolveFixedProposalRentalRange, validateFixedProposalRentalSchedule } from './luxorProposalTerms'

type ProposalTimingContext = Record<string, unknown>

export class LuxorProposalBookingTimingError extends Error {
  readonly status = 409
}

function time(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new LuxorProposalBookingTimingError('The saved proposal contains an invalid rental time. Review its agreement before creating a booking.')
  }
  return value.trim()
}

/** Read frozen proposal times for a new booking; never repair an existing booking. */
export function proposalBookingTiming(context: ProposalTimingContext) {
  const snapshot = getWeekdayCustomRentalSnapshot(context.weekday_custom_rental)
  const v4Snapshot = getLuxorCustomTimeRentalSnapshotV4(context.weekday_custom_rental)
  if (isWeekdayCustomRentalContext(context) && !snapshot && !v4Snapshot) {
    throw new LuxorProposalBookingTimingError('The saved custom rental schedule is invalid. A revised proposal is required.')
  }
  if ((snapshot && snapshot.event_date !== context.event_date) || (v4Snapshot && v4Snapshot.event_date !== context.event_date)) {
    throw new LuxorProposalBookingTimingError('The saved custom rental date does not match the proposal. A revised proposal is required.')
  }

  if (!isWeekdayCustomRentalContext(context)) {
    const selection = context.pricing_selection && typeof context.pricing_selection === 'object' && !Array.isArray(context.pricing_selection)
      ? context.pricing_selection as Record<string, unknown>
      : {}
    const allowedPeriods = new Set(['morning', 'evening', 'full_day'])
    const selectedPeriod = selection.rentalPeriod
    if (selectedPeriod !== undefined && selectedPeriod !== null && selectedPeriod !== '' && (typeof selectedPeriod !== 'string' || !allowedPeriods.has(selectedPeriod))) {
      throw new LuxorProposalBookingTimingError('The saved proposal contains an invalid fixed rental period. Review its agreement before creating a booking.')
    }
    const savedPeriod = typeof selection.rentalPeriod === 'string' ? selection.rentalPeriod : context.rental_period
    if (savedPeriod !== undefined && savedPeriod !== null && savedPeriod !== '' && !allowedPeriods.has(String(savedPeriod))) {
      throw new LuxorProposalBookingTimingError('The saved proposal contains an invalid fixed rental period. Review its agreement before creating a booking.')
    }
    const starts = [context.rental_start_time, context.start_time, selection.rental_start_time, selection.rentalStartTime]
      .map(time)
      .filter((value): value is string => value !== null)
    const ends = [context.rental_end_time, context.end_time, selection.rental_end_time, selection.rentalEndTime]
      .map(time)
      .filter((value): value is string => value !== null)
    if (new Set(starts).size > 1 || new Set(ends).size > 1) {
      throw new LuxorProposalBookingTimingError('The saved proposal contains conflicting rental times. Review its agreement before creating a booking.')
    }

    const period = allowedPeriods.has(String(savedPeriod || 'evening')) ? String(savedPeriod || 'evening') : 'evening'
    const guestArrival = time(context.guest_arrival_time ?? context.guestArrivalTime)
    const eventEnd = time(context.event_end_time ?? context.eventEndTime)
    const range = resolveFixedProposalRentalRange(period, starts[0], ends[0], guestArrival, eventEnd)
    const schedule = validateFixedProposalRentalSchedule(period, range.startTime, range.endTime, guestArrival, eventEnd)
    if (!schedule.valid) {
      throw new LuxorProposalBookingTimingError(schedule.error || 'The saved fixed rental schedule is invalid. A revised proposal is required.')
    }
    return { startTime: range.startTime, endTime: range.endTime }
  }

  const separatedRentalTimes = snapshot?.version === 3 || Boolean(v4Snapshot)
  const starts = [snapshot?.start_time ?? v4Snapshot?.start_time, context.rental_start_time, ...(separatedRentalTimes ? [] : [context.guest_arrival_time, context.guestArrivalTime]), context.start_time].map(time).filter((value): value is string => value !== null)
  const ends = [snapshot?.end_time ?? v4Snapshot?.end_time, context.rental_end_time, ...(separatedRentalTimes ? [] : [context.event_end_time, context.eventEndTime]), context.end_time].map(time).filter((value): value is string => value !== null)
  if (new Set(starts).size > 1 || new Set(ends).size > 1) {
    throw new LuxorProposalBookingTimingError('The saved proposal contains conflicting rental times. Review its agreement before creating a booking.')
  }
  return { startTime: starts[0] || null, endTime: ends[0] || null }
}
