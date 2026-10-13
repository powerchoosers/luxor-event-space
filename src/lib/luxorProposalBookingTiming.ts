import { getWeekdayCustomRentalSnapshot, isWeekdayCustomRentalContext } from './luxorWeekdayRental'

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
  if (isWeekdayCustomRentalContext(context) && !snapshot) {
    throw new LuxorProposalBookingTimingError('The saved custom rental schedule is invalid. A revised proposal is required.')
  }
  if (snapshot && snapshot.event_date !== context.event_date) {
    throw new LuxorProposalBookingTimingError('The saved custom rental date does not match the proposal. A revised proposal is required.')
  }
  const starts = [snapshot?.start_time, context.guest_arrival_time, context.guestArrivalTime, context.start_time].map(time).filter((value): value is string => value !== null)
  const ends = [snapshot?.end_time, context.event_end_time, context.eventEndTime, context.end_time].map(time).filter((value): value is string => value !== null)
  if (new Set(starts).size > 1 || new Set(ends).size > 1) {
    throw new LuxorProposalBookingTimingError('The saved proposal contains conflicting rental times. Review its agreement before creating a booking.')
  }
  return { startTime: starts[0] || null, endTime: ends[0] || null }
}
